#!/usr/bin/env python3
"""
Convierte las ilustraciones FRONTALES de `disenio/` en los PNG con
transparencia que usan el selector de categorías y la puerta de Envíos.

    python3 tools/procesar-categorias.py

Se ejecuta a mano cuando cambian los originales. No confundir con
`tools/procesar-vehiculos.py`, que prepara los vehículos CENITALES del mapa:
son otro dibujo para otro sitio. En el mapa el marcador gira con el rumbo y
tiene que verse desde arriba; aquí el pasajero elige categoría y lo que
reconoce en una fracción de segundo es el frente del vehículo.

POR QUÉ CADA DECISIÓN
---------------------

1. SE RASTERIZA AQUÍ, sin cairosvg ni rsvg. Los SVG vienen de vectorizar un
   PNG: 60–70 polígonos planos con solo M/L/Z, sin una curva. Para eso no hace
   falta un motor SVG completo, y añadir una dependencia del sistema para
   convertir cuatro archivos a mano sería peor. Se pinta con Pillow y listo.

2. SUPERSAMPLING x4 Y LUEGO REDUCIR. La vectorización deja bordes dentados que
   a tamaño grande se ven como ruido. Al reducir con LANCZOS ese ruido se
   promedia y el contorno queda limpio — comprobado a 46 px, que es el tamaño
   real en el selector.

3. LOS TAMAÑOS SON RELATIVOS ENTRE SÍ, no «que cada uno llene su lienzo». Es la
   misma regla que la herramienta del mapa. Las cuatro ilustraciones vienen con
   el vehículo ocupando más o menos lo mismo, así que a igual escala una moto
   se vería tan ancha como un bus. Aquí la moto es visiblemente más angosta y
   el bus más grande, que es la información que el selector tiene que dar de un
   vistazo. No van a escala real: un bus de frente mide casi tres veces el
   ancho de una moto, y a esa proporción la moto sería un punto.

4. LIENZO CUADRADO Y CONTENIDO CENTRADO. Cada original trae su propia caja
   (219x197, 216x159, 160x179, 207x174), así que puestos en fila sin normalizar
   se verían de tamaños distintos sin motivo. Se recorta al contenido real —no
   al viewBox, que trae aire— y se centra en un cuadrado común.

5. EL FONDO DEL REPARTIDOR SE QUITA POR RELLENO DESDE LAS ESQUINAS, no por
   «borrar lo negro». El dibujo tiene negros propios —pantalón, llantas, la
   visera del casco, el logo de la caja— y un umbral por color se los comería
   dejando agujeros. El fondo es una región negra conectada que toca los cuatro
   bordes; el negro del dibujo está rodeado de color y no se alcanza desde
   fuera. Se rellena desde las esquinas con tolerancia y se para solo.
"""
import re
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
APPS = [RAIZ / 'AppCliente']

# Supersampling del rasterizado. x4 basta: por encima no mejora y la memoria sí
# sube (un bus a 4x de 512 px son 2048x1800 en RGB por cada uno de los 64 paths).
SS = 4

# Lado del lienzo cuadrado en densidad 1x. El selector lo pinta a 46–56 px, así
# que 64 deja margen para que 2x y 3x no interpolen hacia arriba nunca.
LADO = 64

# Cuánto del lienzo ocupa cada vehículo, uno respecto de otro (ver punto 3).
# El número es la fracción del lado que ocupa el lado MAYOR del dibujo.
PESO = {
    'taxi': 0.92,
    'particular': 0.92,   # mismo porte que el taxi: son el mismo carro
    'moto': 0.74,         # de frente una moto es angosta; igualarla miente
    'bus': 1.00,          # el más grande, y se nota al lado de los otros
}


# ─── Rasterizado de los SVG planos ───────────────────────────────────────────

def _subtrazados(d: str) -> list[list[tuple[float, float]]]:
    """Parte el atributo `d` en polígonos. Solo entiende M, L y Z."""
    salida: list[list[tuple[float, float]]] = []
    actual: list[tuple[float, float]] = []
    for t in re.finditer(r'([MLZ])\s*([-\d.]+)?\s*([-\d.]+)?', d):
        if t.group(1) == 'Z':
            if actual:
                salida.append(actual)
                actual = []
        else:
            actual.append((float(t.group(2)), float(t.group(3))))
    if actual:
        salida.append(actual)
    return salida


def rasterizar(ruta: Path, alto_px: int) -> Image.Image:
    """Dibuja el SVG en RGBA con fondo transparente."""
    fuente = ruta.read_text()
    _, _, w, h = (float(v) for v in
                  re.search(r'viewBox="([\d.\- ]+)"', fuente).group(1).split())
    escala = (alto_px * SS) / h
    W, H = int(w * escala), int(h * escala)
    lienzo = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    for m in re.finditer(r'<path d="([^"]+)"\s+fill="([^"]+)"', fuente):
        d, color = m.group(1), m.group(2)
        if color == 'none':
            continue
        partes = _subtrazados(d)
        if not partes:
            continue
        # fill-rule="evenodd": cada subtrazado invierte la máscara donde se
        # solapa, que es lo que hace que los huecos sean huecos de verdad.
        mascara = Image.new('1', (W, H), 0)
        for p in partes:
            if len(p) < 3:
                continue
            capa = Image.new('1', (W, H), 0)
            ImageDraw.Draw(capa).polygon(
                [(x * escala, y * escala) for x, y in p], fill=1)
            mascara = ImageChops.logical_xor(mascara, capa)
        lienzo.paste(Image.new('RGBA', (W, H), color), (0, 0), mascara)

    return lienzo.resize((max(1, W // SS), max(1, H // SS)), Image.LANCZOS)


# ─── Recorte del fondo del repartidor ────────────────────────────────────────

def quitar_fondo(img: Image.Image, claro: bool, tolerancia: int = 24) -> Image.Image:
    """Borra la región de fondo CONECTADA a los bordes. Ver punto 5.

    `claro=True` para los originales sobre blanco, `False` para los que vienen
    sobre negro. En los dos casos el color interior del dibujo sobrevive porque
    no se alcanza desde fuera: los faros blancos del taxi están rodeados de
    amarillo, y el pantalón negro del repartidor, de amarillo también.
    """
    img = img.convert('RGBA')
    ancho, alto = img.size
    px = img.load()

    def es_fondo(x: int, y: int) -> bool:
        r, g, b, _ = px[x, y]
        if claro:
            return r >= 255 - tolerancia and g >= 255 - tolerancia and b >= 255 - tolerancia
        return r <= tolerancia and g <= tolerancia and b <= tolerancia

    visto = bytearray(ancho * alto)
    cola: deque[tuple[int, int]] = deque()
    for x in range(ancho):
        for y in (0, alto - 1):
            if es_fondo(x, y):
                cola.append((x, y))
    for y in range(alto):
        for x in (0, ancho - 1):
            if es_fondo(x, y):
                cola.append((x, y))

    while cola:
        x, y = cola.popleft()
        i = y * ancho + x
        if visto[i]:
            continue
        visto[i] = 1
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < ancho and 0 <= ny < alto and not visto[ny * ancho + nx] \
                    and es_fondo(nx, ny):
                cola.append((nx, ny))

    return img


# ─── Normalizado a lienzo cuadrado ───────────────────────────────────────────

def a_cuadrado(img: Image.Image, lado: int, peso: float) -> Image.Image:
    """Recorta al contenido real y lo centra en un cuadrado. Ver puntos 3 y 4."""
    caja = img.getbbox()
    if caja:
        img = img.crop(caja)

    objetivo = lado * peso
    escala = objetivo / max(img.width, img.height)
    nueva = (max(1, round(img.width * escala)), max(1, round(img.height * escala)))
    img = img.resize(nueva, Image.LANCZOS)

    fondo = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    fondo.paste(img, ((lado - img.width) // 2, (lado - img.height) // 2), img)
    return fondo


def exportar(img_1x: Image.Image, carpeta: str, nombre: str) -> None:
    """Escribe el PNG en las tres densidades que declara el pubspec."""
    for app in APPS:
        for factor, sub in ((1, ''), (2, '2.0x'), (3, '3.0x')):
            destino = app / 'assets' / carpeta / sub
            destino.mkdir(parents=True, exist_ok=True)
            lado = img_1x.width * factor
            img_1x.resize((lado, lado), Image.LANCZOS).save(destino / f'{nombre}.png')


def _abrir(carpeta: str, nombre: str) -> Image.Image:
    """El original de ese icono, venga como venga.

    Conviven las dos fuentes a propósito: los primeros vinieron vectorizados
    desde un PNG y los que se fueron reemplazando llegan ya como ilustración
    limpia. Si existe un PNG o un WEBP con ese nombre, manda sobre el SVG —así
    sustituir un dibujo es dejar el archivo nuevo, sin tocar el script.
    """
    base = RAIZ / 'disenio' / carpeta
    for ext, claro in (('png', True), ('webp', None), ('jpg', True)):
        p = base / f'{nombre}.{ext}'
        if not p.exists():
            continue
        img = Image.open(p)
        # El webp del repartidor vino sobre negro; los PNG, sobre blanco. Se
        # mira una esquina en vez de fiarse del formato.
        esquina = img.convert('RGB').getpixel((0, 0))
        sobre_claro = claro if claro is not None else sum(esquina) > 382
        return quitar_fondo(img, claro=sobre_claro)

    svg = base / f'{nombre}.svg'
    # Se rasteriza grande y se normaliza después: así el recorte al contenido
    # trabaja con detalle y no con un dibujo ya pixelado.
    return rasterizar(svg, alto_px=LADO * 6)


def main() -> None:
    print('Categorías (vista frontal, para el selector)')
    for nombre, peso in PESO.items():
        exportar(a_cuadrado(_abrir('categorias', nombre), LADO, peso),
                 'categorias', nombre)
        print(f'  ✓ {nombre:11s} peso {peso}')

    print('Servicios (puertas del home)')
    for nombre in ('repartidor', 'restaurantes'):
        exportar(a_cuadrado(_abrir('servicios', nombre), LADO, 1.0),
                 'servicios', nombre)
        print(f'  ✓ {nombre}')


if __name__ == '__main__':
    main()
