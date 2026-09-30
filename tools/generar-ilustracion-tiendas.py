#!/usr/bin/env python3
"""Ilustración de la puerta «Tiendas» de la home del cliente.

POR QUÉ ESTE SCRIPT Y NO UN ARCHIVO SUELTO. Las otras cuatro puertas son
ilustraciones 3D de la marca (taxi, hamburguesa, repartidor, buseta) y el
widget exige que TODAS lleven una: un glifo monocromo al lado de cuatro
renders a color se lee como que falta algo. No hay render de tienda, así que
se dibuja uno que conviva con ellos — y queda el script, no solo el PNG, para
poder rehacerlo cuando cambie el tinte de la categoría o haga falta otra
densidad.

QUÉ SE DIBUJA Y POR QUÉ UNA BOLSA. Las otras cuatro son objetos reconocibles
a 20 px; una fachada de almacén con vitrina y letrero se convierte en una
mancha a ese tamaño. La bolsa de compras es el signo universal de comercio
—Amazon, Mercado Libre, Rappi— y no se confunde con la caja de «Envíos», que
además ya está representada por el repartidor y no por un paquete.

LAS CUATRO REGLAS QUE HACEN QUE PEGUE CON LAS DEMÁS, sacadas de mirarlas:

1. **Supermuestreo x4 y reducción con LANCZOS.** Pillow no antialiasa los
   polígonos; dibujar directo a 64 px deja los bordes en escalera y el icono
   parece de otra época. Se dibuja a 4× y se reduce.
2. **Dos caras, no un relleno plano.** El volumen de las otras sale de que la
   cara lateral es más oscura que la frontal. Sin eso es una pegatina.
3. **Sombra de contacto elíptica y difusa bajo el objeto**, no un borde. Es lo
   que las asienta en la tarjeta en vez de dejarlas flotando.
4. **Nada toca el borde del lienzo.** Las cuatro dejan aire alrededor; sin ese
   margen la bolsa se vería más grande que sus vecinas a igual tamaño.

Uso:  python3 tools/generar-ilustracion-tiendas.py
Salida: AppCliente/assets/servicios/{,2.0x/,3.0x/}tiendas.png (64/128/192)
        y una tira de previsualización en /tmp para juzgarla antes de subirla.
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter

# El lienzo de trabajo. 64 px es el tamaño base del asset (1.0x); todo se
# dibuja a ESCALA veces eso y se reduce al final.
BASE = 64
ESCALA = 12          # 768 px de trabajo: sobra, y el detalle fino sobrevive
L = BASE * ESCALA

# Paleta. El amarillo es el de la marca en las otras ilustraciones (el casco y
# la caja del repartidor); el asa y la cara lateral son el mismo tono bajado,
# no un gris: un gris al lado de un amarillo saturado se ve sucio.
AMARILLO_CLARO = (255, 196, 46)
AMARILLO = (250, 176, 22)
AMARILLO_OSCURO = (214, 138, 8)
AMARILLO_SOMBRA = (176, 110, 4)
BLANCO = (255, 255, 255)
SOMBRA_PISO = (60, 55, 45)


def _lienzo() -> Image.Image:
    return Image.new('RGBA', (L, L), (0, 0, 0, 0))


def _px(v: float) -> float:
    """De unidades de la rejilla de 64 a píxeles del lienzo de trabajo."""
    return v * ESCALA


def _sombra_de_piso(dst: Image.Image) -> None:
    """Elipse difusa bajo la bolsa: es lo que la asienta en la tarjeta."""
    capa = _lienzo()
    d = ImageDraw.Draw(capa)
    d.ellipse(
        [_px(13), _px(50), _px(50), _px(56.5)],
        fill=SOMBRA_PISO + (70,),
    )
    capa = capa.filter(ImageFilter.GaussianBlur(_px(1.6)))
    dst.alpha_composite(capa)


def _asas(dst: Image.Image) -> None:
    """Dos asas en arco, DETRÁS del cuerpo.

    Se dibujan antes y el cuerpo las tapa por abajo: así nacen del interior de
    la bolsa en vez de quedar pegadas encima, que es lo que delata un dibujo
    plano.
    """
    capa = _lienzo()
    d = ImageDraw.Draw(capa)
    grosor = _px(2.0)
    # Arco izquierdo y derecho. Finos y altos: con el grosor de antes y menos
    # altura se leían como dos orejas pegadas a la caja, no como asas.
    # Bajan POR DEBAJO del borde superior (y=24 contra el borde en 21) para
    # que la solapa las tape: así nacen de dentro de la bolsa. Terminadas en
    # el borde se leerían como dos arcos posados encima.
    for x0, x1 in ((_px(18.5), _px(29)), (_px(31), _px(41.5))):
        d.arc([x0, _px(8), x1, _px(24)], start=180, end=360,
              fill=AMARILLO_OSCURO, width=int(grosor))
    dst.alpha_composite(capa)


def _cuerpo(dst: Image.Image) -> None:
    """Cara frontal + cara lateral + solapa superior."""
    capa = _lienzo()
    d = ImageDraw.Draw(capa)

    # Cara frontal: trapecio ligeramente más ancho arriba, esquinas de abajo
    # redondeadas. Una bolsa llena se ensancha arriba; con los lados paralelos
    # parece una caja y se confunde con Envíos.
    frontal = [
        (_px(12.5), _px(21)),
        (_px(45.5), _px(21)),
        (_px(42.5), _px(51)),
        (_px(15.5), _px(51)),
    ]
    d.polygon(frontal, fill=AMARILLO)

    # Cara lateral derecha, más oscura: el volumen sale de aquí.
    lateral = [
        (_px(45.5), _px(21)),
        (_px(51.5), _px(17.5)),
        (_px(47.5), _px(47.5)),
        (_px(42.5), _px(51)),
    ]
    d.polygon(lateral, fill=AMARILLO_OSCURO)

    # Solapa superior (el doblez del borde). Dos tonos, uno por cara.
    d.polygon(
        [(_px(12.5), _px(21)), (_px(45.5), _px(21)),
         (_px(45.1), _px(26.5)), (_px(13.0), _px(26.5))],
        fill=AMARILLO_CLARO,
    )
    d.polygon(
        [(_px(45.5), _px(21)), (_px(51.5), _px(17.5)),
         (_px(50.8), _px(23)), (_px(45.1), _px(26.5))],
        fill=AMARILLO,
    )

    dst.alpha_composite(capa)


def _brillo(dst: Image.Image) -> None:
    """Reflejo diagonal suave sobre la cara frontal.

    Va recortado a la cara frontal con una máscara: desbordado sobre el fondo
    transparente se vería como una nube blanca suelta al lado de la bolsa.
    """
    mascara = Image.new('L', (L, L), 0)
    ImageDraw.Draw(mascara).polygon(
        [(_px(13.0), _px(26.5)), (_px(45.1), _px(26.5)),
         (_px(42.5), _px(51)), (_px(15.5), _px(51))],
        fill=255,
    )

    capa = _lienzo()
    d = ImageDraw.Draw(capa)
    d.polygon(
        [(_px(17.5), _px(26.5)), (_px(26), _px(26.5)),
         (_px(21.5), _px(51)), (_px(16.5), _px(51))],
        fill=BLANCO + (58,),
    )
    capa = capa.filter(ImageFilter.GaussianBlur(_px(0.9)))
    capa.putalpha(Image.composite(
        capa.getchannel('A'), Image.new('L', (L, L), 0), mascara,
    ))
    dst.alpha_composite(capa)


def _pliegue(dst: Image.Image) -> None:
    """Sombra vertical en el encuentro de las dos caras.

    Sin ella el canto se ve como dos colores pegados; con ella hay una arista.
    """
    capa = _lienzo()
    d = ImageDraw.Draw(capa)
    d.polygon(
        [(_px(43.6), _px(21)), (_px(45.5), _px(21)),
         (_px(42.5), _px(51)), (_px(40.8), _px(51))],
        fill=AMARILLO_SOMBRA + (110,),
    )
    capa = capa.filter(ImageFilter.GaussianBlur(_px(0.7)))
    dst.alpha_composite(capa)


def _contorno(dst: Image.Image) -> None:
    """Perfil oscuro de un pelo alrededor del cuerpo.

    Las ilustraciones de la marca tienen contraste contra el fondo claro de la
    tarjeta; sin esta línea la bolsa amarilla sobre blanco roto se deshace por
    los bordes y parece de otra familia.
    """
    capa = _lienzo()
    d = ImageDraw.Draw(capa)
    d.line(
        [(_px(12.5), _px(21)), (_px(51.5), _px(17.5)), (_px(47.5), _px(47.5)),
         (_px(42.5), _px(51)), (_px(15.5), _px(51)), (_px(12.5), _px(21))],
        fill=AMARILLO_SOMBRA + (150,), width=int(_px(0.8)), joint='curve',
    )
    dst.alpha_composite(capa)


def construir() -> Image.Image:
    img = _lienzo()
    _sombra_de_piso(img)
    _asas(img)
    _cuerpo(img)
    _pliegue(img)
    _brillo(img)
    _contorno(img)
    return img


def main() -> None:
    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    destino = os.path.join(raiz, 'AppCliente', 'assets', 'servicios')

    grande = construir()
    salidas = {'': BASE, '2.0x': BASE * 2, '3.0x': BASE * 3}
    for carpeta, tam in salidas.items():
        ruta = os.path.join(destino, carpeta, 'tiendas.png')
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        grande.resize((tam, tam), Image.LANCZOS).save(ruta)
        print(f'  {os.path.relpath(ruta, raiz)}  {tam}x{tam}')

    # Tira de previsualización: los tamaños a los que de verdad se ve, sobre
    # el tinte de la categoría. «Compila» no es «se ve bien», y sin Flutter
    # local lo primero que vería el dibujo sería un teléfono del usuario.
    tira = Image.new('RGB', (560, 270), (232, 234, 246))
    x = 16
    for tam in (20, 29, 48, 64, 128):
        marco = Image.new('RGB', (tam, tam), (232, 234, 246))
        pieza = grande.resize((tam, tam), Image.LANCZOS)
        marco.paste(pieza, (0, 0), pieza)
        tira.paste(marco, (x, 20))
        x += tam + 16
    fondo_oscuro = Image.new('RGB', (560, 100), (26, 29, 39))
    x = 16
    for tam in (48, 64):
        pieza = grande.resize((tam, tam), Image.LANCZOS)
        marco = Image.new('RGB', (tam, tam), (26, 29, 39))
        marco.paste(pieza, (0, 0), pieza)
        fondo_oscuro.paste(marco, (x, 18))
        x += tam + 16
    tira.paste(fondo_oscuro, (0, 165))
    tira.save('/tmp/tiendas-preview.png')
    print('  /tmp/tiendas-preview.png  (20/29/48/64/128 px, claro y oscuro)')


if __name__ == '__main__':
    main()
