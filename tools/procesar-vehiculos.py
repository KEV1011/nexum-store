#!/usr/bin/env python3
"""
Convierte las ilustraciones cenitales de `disenio/vehiculos/*.jpg` en los PNG
con transparencia que usan los mapas de las dos apps.

Se ejecuta a mano cuando cambian los originales:

    python3 tools/procesar-vehiculos.py

Por qué cada decisión, que es lo que no se ve en el resultado:

1. EL RECORTE ES POR TONO, NO POR COLOR EXACTO. El fondo pedido era #FF00FF
   pero Gemini devolvió (253,4,246), (244,21,223)… y encima son JPEG, que mete
   ±6 de ruido hasta en una zona plana. Un recorte por igualdad habría dejado
   el fondo casi entero. Se recorta por lo que hace magenta a un magenta: rojo
   y azul altos con verde bajo. Ningún color de los vehículos —amarillo, azul
   marino, gris, blanco, negro de las llantas— cumple eso.

2. ESO ADEMÁS MATA LA SOMBRA DEL CAMIÓN. Esa imagen trae una sombra que es
   magenta oscurecido. Con un umbral por distancia al fondo habría quedado
   como un velo semitransparente pegado al remolque; por tono, cae entera.

3. LOS TAMAÑOS SON RELATIVOS ENTRE SÍ, no «que cada uno llene su lienzo». Las
   cuatro ilustraciones venían con el vehículo ocupando más o menos lo mismo,
   así que a igual escala una moto se vería tan larga como un carro. Aquí la
   moto es visiblemente más corta y el camión más largo, que es la información
   que el mapa tiene que dar de un vistazo. El camión NO va a escala real (un
   tractocamión mide unos 16 m, cuatro veces un sedán): a esa proporción sería
   una tira ilegible, así que se recorta a lo que sigue leyéndose como camión.

4. TODO SALE EN UN LIENZO CUADRADO. El marcador del mapa gira con el rumbo, y
   sobre un cuadrado con el vehículo centrado la rotación es exacta y no hay
   que calcular nada: gira sobre su eje en vez de orbitar. El relleno
   transparente absorbe la diagonal —el camión, que es el más largo, mide 87
   de diagonal dentro de un lienzo de 96— y en PNG no pesa nada.
"""
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'disenio' / 'vehiculos'
DESTINOS = [
    RAIZ / 'AppCliente' / 'assets' / 'vehicles',
    RAIZ / 'AppTransport' / 'assets' / 'vehicles',
]

# Lado del lienzo cuadrado, en píxeles lógicos de Flutter.
LADO = 96

# Largo de cada vehículo dentro de ese lienzo. Ver nota 3.
LARGO = {
    'taxi': 58,
    'particular': 58,
    # A escala real una moto sería la mitad de un sedán, y probándolo sobre el
    # mapa oscuro quedaba en un punto gris que había que buscar. Se sube hasta
    # donde se distingue de un vistazo sin dejar de leerse más corta que un
    # carro, que es la información que tiene que dar.
    'moto': 46,
    'camion': 84,
}

# Densidades que genera Flutter: assets/vehicles/x.png, .../2.0x/x.png, 3.0x/.
DENSIDADES = [(1.0, ''), (2.0, '2.0x'), (3.0, '3.0x')]


def es_fondo(r: int, g: int, b: int) -> bool:
    """Magenta por tono: rojo y azul altos, verde bajo. Ver notas 1 y 2."""
    return g < 90 and r > g * 1.8 and b > g * 1.8 and r > 100 and b > 100


def recortar(ruta: Path) -> Image.Image:
    """Quita el fondo magenta y devuelve el vehículo ajustado a su caja."""
    im = Image.open(ruta).convert('RGBA')
    ancho, alto = im.size
    px = im.load()
    assert px is not None

    x0, y0, x1, y1 = ancho, alto, 0, 0
    for y in range(alto):
        for x in range(ancho):
            r, g, b, _ = px[x, y]
            if es_fondo(r, g, b):
                px[x, y] = (0, 0, 0, 0)
            else:
                if x < x0: x0 = x
                if y < y0: y0 = y
                if x > x1: x1 = x
                if y > y1: y1 = y

    if x1 <= x0 or y1 <= y0:
        raise SystemExit(f'{ruta.name}: no quedó nada tras quitar el fondo')
    return im.crop((x0, y0, x1 + 1, y1 + 1))


def componer(vehiculo: Image.Image, largo_logico: int, escala: float) -> Image.Image:
    """Centra el vehículo en un lienzo cuadrado transparente a la escala dada."""
    lado = round(LADO * escala)
    largo = round(largo_logico * escala)
    ancho = max(1, round(vehiculo.width * largo / vehiculo.height))

    # LANCZOS al reducir desde 2048: promedia el ruido del JPEG y el dentado
    # del contorno, así que la compresión del original deja de importar.
    pequeno = vehiculo.resize((ancho, largo), Image.Resampling.LANCZOS)

    lienzo = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    lienzo.paste(pequeno, ((lado - ancho) // 2, (lado - largo) // 2), pequeno)
    return lienzo


def main() -> None:
    for nombre, largo in LARGO.items():
        origen = ORIGEN / f'{nombre}.jpg'
        if not origen.exists():
            raise SystemExit(f'falta {origen}')
        vehiculo = recortar(origen)
        print(f'{nombre:11s} recortado a {vehiculo.width}x{vehiculo.height}')

        for escala, carpeta in DENSIDADES:
            imagen = componer(vehiculo, largo, escala)
            for destino in DESTINOS:
                salida = destino / carpeta / f'{nombre}.png'
                salida.parent.mkdir(parents=True, exist_ok=True)
                imagen.save(salida, 'PNG', optimize=True)
        print(f'{"":11s} → {len(DENSIDADES)} densidades × {len(DESTINOS)} apps')


if __name__ == '__main__':
    main()
