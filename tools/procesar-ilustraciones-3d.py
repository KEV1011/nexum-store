#!/usr/bin/env python3
"""Ilustraciones 3D de la app cliente: la puerta de Restaurantes y las seis
categorías de «¿Qué te traemos?».

DE DÓNDE SALEN. Son los renders 3D de Fluent Emoji de Microsoft, publicados
con licencia MIT (https://github.com/microsoft/fluentui-emoji). La licencia
permite usarlos y modificarlos con una condición: llevar el aviso de
copyright. Va en `AppCliente/assets/licencias/fluent-emoji.txt` y la app lo
registra en `LicenseRegistry` (main.dart), así aparece en la pantalla de
licencias del sistema. NO son emojis del teléfono: son PNG nuestros, se ven
igual en todos los Android y no dependen de la fuente del sistema — que es
justo lo que prohíbe la regla de «sin emojis» de las pruebas.

POR QUÉ ESTOS Y NO DIBUJADOS A MANO. El dueño pidió una hamburguesa
«renderizada». Lo que se puede dibujar con Pillow es una ilustración plana
con degradados (la bolsa de Tiendas); un render de verdad, con volumen y luz,
no. Estos sí lo son, y tienen licencia clara.

LAS DOS FORMAS DE PROCESARLOS, y por qué no es la misma:

* **Puerta del inicio** (`--puerta`): convive con el taxi, el repartidor y la
  buseta, que van perfilados en negro, brillantes y con sombra de contacto.
  Fluent es más pastel y sin contorno; puesto al lado tal cual se leía de otro
  juego. Se le sube el color y el contraste, se le pone el MISMO contorno fino
  oscuro y la misma sombra elíptica. Comprobado poniéndolos en fila.
* **Categorías** (sin `--puerta`): van solas sobre el cuadro tintado de su
  categoría, sin vecinos perfilados. Ahí el contorno sobra y el render limpio
  se ve mejor; solo se recorta, se centra y se deja aire.

Uso:
    # 1. Bajar los originales (256 px) a una carpeta vacía:
    #    https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/
    #      assets/<Nombre>/3D/<nombre>_3d.png
    # 2. Procesarlos:
    python3 tools/procesar-ilustraciones-3d.py --puerta  ORIGEN/hamburger.png  AppCliente/assets/servicios restaurantes
    python3 tools/procesar-ilustraciones-3d.py           ORIGEN/pill.png       AppCliente/assets/mandados   drogueria

Antojos (`--antojo`, tarjetas de «¿Qué se te antoja?», render con sombra de
contacto y sin contorno):
    python3 tools/procesar-ilustraciones-3d.py --antojo ORIGEN/hot_dog_3d.png AppCliente/assets/antojos perros

Composiciones (`--combo`, ORIGEN = la carpeta `assets/` de fluentui-emoji;
las piezas y su colocación están en COMBOS, abajo):
    python3 tools/procesar-ilustraciones-3d.py --combo --puerta ORIGEN AppCliente/assets/servicios restaurantes
    python3 tools/procesar-ilustraciones-3d.py --combo          ORIGEN AppCliente/assets/mandados   comida

Los usados hoy:
    restaurantes  ← Hamburger + French fries + Cup with straw   (combo, puerta)
    comida        ← Takeout box + Pizza                          (combo)
    drogueria     ← Pill
    mercado       ← Shopping cart
    pagos         ← Receipt
    documentos    ← Card index dividers
    compras       ← Shopping bags

Antojos (`AppCliente/assets/antojos/`, uno por clave de `antojos.dart`):
    hamburguesas ← Hamburger        perros     ← Hot dog
    pizza        ← Pizza            salchipapas← French fries
    pollo        ← Poultry leg      sushi      ← Sushi
    mexicana     ← Taco             arepas     ← Flatbread
    empanadas    ← Dumpling         sandwiches ← Sandwich
    asados       ← Cut of meat      postres    ← Shortcake
    helados      ← Soft ice cream   cafe       ← Hot beverage
    desayunos    ← Cooking          oriental   ← Steaming bowl
    mariscos     ← Shrimp           ensaladas  ← Green salad
    pastas       ← Spaghetti        almuerzos  ← Fork and knife with plate
    panaderia    ← Bread
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

TRABAJO = 1024  # lienzo de trabajo; se reduce con LANCZOS al final


def _recortar(im: Image.Image) -> Image.Image:
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def _centrar(im: Image.Image, margen: float, subir: float = 0.0) -> tuple[Image.Image, int, int]:
    util = int(TRABAJO * (1 - 2 * margen))
    f = util / max(im.size)
    im = im.resize((round(im.size[0] * f), round(im.size[1] * f)), Image.LANCZOS)
    ox = (TRABAJO - im.size[0]) // 2
    oy = (TRABAJO - im.size[1]) // 2 - int(TRABAJO * subir)
    return im, ox, oy


def puerta(src: str | Image.Image) -> Image.Image:
    base = src if isinstance(src, Image.Image) else Image.open(src)
    im = _recortar(base.convert('RGBA'))
    rgb, a = im.convert('RGB'), im.getchannel('A')
    rgb = ImageEnhance.Color(rgb).enhance(1.25)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
    im = Image.merge('RGBA', (*rgb.split(), a))
    im, ox, oy = _centrar(im, margen=0.10, subir=0.02)

    # Contorno oscuro y fino: el de las vecinas mide ~2 px a 192.
    alfa = Image.new('L', (TRABAJO, TRABAJO), 0)
    alfa.paste(im.getchannel('A'), (ox, oy))
    grueso = alfa.filter(ImageFilter.MaxFilter(2 * (TRABAJO // 192) * 2 + 1))
    borde = Image.new('RGBA', (TRABAJO, TRABAJO), (38, 30, 28, 255))
    borde.putalpha(grueso)

    # Sombra de contacto elíptica y difusa: la asienta en la tarjeta.
    sombra = Image.new('L', (TRABAJO, TRABAJO), 0)
    cx, base = TRABAJO // 2, oy + im.size[1]
    ImageDraw.Draw(sombra).ellipse(
        (cx - im.size[0] * 0.42, base - TRABAJO * 0.035,
         cx + im.size[0] * 0.42, base + TRABAJO * 0.03),
        fill=90,
    )
    sombra = sombra.filter(ImageFilter.GaussianBlur(TRABAJO * 0.02))
    capa = Image.new('RGBA', (TRABAJO, TRABAJO), (0, 0, 0, 255))
    capa.putalpha(sombra)

    out = Image.new('RGBA', (TRABAJO, TRABAJO), (0, 0, 0, 0))
    out.alpha_composite(capa)
    out.alpha_composite(borde)
    out.alpha_composite(im, (ox, oy))
    return out


def antojo(src: str) -> Image.Image:
    """Las tarjetas de «¿Qué se te antoja?»: el estilo que pidió el dueño.

    La referencia (su captura: la hamburguesa y la caneca de reciclaje) es el
    render limpio SIN contorno —el contorno es cosa de las puertas, que
    conviven con el taxi y la buseta perfilados— pero CON su sombra de
    contacto, que es lo que hace que el objeto «se apoye» en la tarjeta gris en
    vez de flotar. Color un punto más vivo que el original, menos que la
    puerta: aquí van veinte seguidas y un carrusel saturado cansa.
    """
    im = _recortar(Image.open(src).convert('RGBA'))
    rgb, a = im.convert('RGB'), im.getchannel('A')
    rgb = ImageEnhance.Color(rgb).enhance(1.12)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.05)
    im = Image.merge('RGBA', (*rgb.split(), a))
    im, ox, oy = _centrar(im, margen=0.09, subir=0.03)

    sombra = Image.new('L', (TRABAJO, TRABAJO), 0)
    cx, base = TRABAJO // 2, oy + im.size[1]
    ImageDraw.Draw(sombra).ellipse(
        (cx - im.size[0] * 0.40, base - TRABAJO * 0.03,
         cx + im.size[0] * 0.40, base + TRABAJO * 0.035),
        fill=70,
    )
    sombra = sombra.filter(ImageFilter.GaussianBlur(TRABAJO * 0.022))
    capa = Image.new('RGBA', (TRABAJO, TRABAJO), (20, 20, 30, 255))
    capa.putalpha(sombra)

    out = Image.new('RGBA', (TRABAJO, TRABAJO), (0, 0, 0, 0))
    out.alpha_composite(capa)
    out.alpha_composite(im, (ox, oy))
    return out


def categoria(src: str) -> Image.Image:
    return categoria_de(Image.open(src))


def categoria_de(base: Image.Image) -> Image.Image:
    im = _recortar(base.convert('RGBA'))
    im, ox, oy = _centrar(im, margen=0.06)
    out = Image.new('RGBA', (TRABAJO, TRABAJO), (0, 0, 0, 0))
    out.alpha_composite(im, (ox, oy))
    return out


# COMPOSICIONES. Una pieza suelta (la hamburguesa, la olla) se veía «muy
# simple» al lado del taxi, la moto y la buseta, que son escenas con varios
# elementos. Se arman de varias piezas de Fluent, de atrás hacia adelante:
# (carpeta de Fluent, alto, centro x, base y), en fracción del lienzo.
COMBOS = {
    # El combo de comida rápida: se lee «restaurante» de un vistazo.
    'restaurantes': [
        ('French fries', 0.58, 0.28, 0.70),
        ('Cup with straw', 0.66, 0.73, 0.70),
        ('Hamburger', 0.62, 0.50, 0.95),
    ],
    # «Te traemos comida»: pizza y caja para llevar. No pollo con papas, que
    # se leía muy bien pero repetía las papas del combo en la misma pantalla.
    'comida': [
        ('Takeout box', 0.62, 0.66, 0.72),
        ('Pizza', 0.56, 0.38, 0.95),
    ],
}


def combo(nombre: str, origen: str) -> Image.Image:
    import glob
    out = Image.new('RGBA', (TRABAJO, TRABAJO), (0, 0, 0, 0))
    for carpeta, alto, cx, base in COMBOS[nombre]:
        rutas = glob.glob(os.path.join(origen, carpeta, '3D', '*.png'))
        if not rutas:
            sys.exit(f'Falta {carpeta}/3D en {origen}')
        im = _recortar(Image.open(rutas[0]).convert('RGBA'))
        h = int(TRABAJO * alto)
        w = int(im.size[0] * h / im.size[1])
        im = im.resize((w, h), Image.LANCZOS)
        x, y = int(TRABAJO * cx - w / 2), int(TRABAJO * base - h)
        # Sombra suave de cada pieza sobre la de atrás: separa los planos y
        # evita que la composición se lea como un recorte pegado.
        sombra = Image.new('L', (TRABAJO, TRABAJO), 0)
        sombra.paste(im.getchannel('A'), (x + int(TRABAJO * 0.012), y + int(TRABAJO * 0.018)))
        sombra = sombra.filter(ImageFilter.GaussianBlur(TRABAJO * 0.012)).point(lambda a: int(a * 0.35))
        capa = Image.new('RGBA', (TRABAJO, TRABAJO), (40, 20, 10, 255))
        capa.putalpha(sombra)
        out.alpha_composite(capa)
        out.alpha_composite(im, (x, y))
    return out


def main() -> None:
    args = sys.argv[1:]
    es_puerta = '--puerta' in args
    es_combo = '--combo' in args
    es_antojo = '--antojo' in args
    args = [a for a in args if a not in ('--puerta', '--combo', '--antojo')]
    if len(args) != 3:
        print(__doc__)
        sys.exit(2)
    src, carpeta, nombre = args
    if es_combo:
        # `src` es la carpeta `assets/` del repositorio de Fluent.
        compuesta = combo(nombre, src)
        out = puerta(compuesta) if es_puerta else categoria_de(compuesta)
    elif es_antojo:
        out = antojo(src)
    else:
        out = puerta(src) if es_puerta else categoria(src)
    # La puerta se pinta a 64 lógicos; el antojo, a 52; la categoría, a 44.
    base = 64 if es_puerta else 56 if es_antojo else 48
    for sub, f in (('', 1), ('2.0x', 2), ('3.0x', 3)):
        d = os.path.join(carpeta, sub)
        os.makedirs(d, exist_ok=True)
        out.resize((base * f, base * f), Image.LANCZOS).save(
            os.path.join(d, f'{nombre}.png'), optimize=True)
    print(f'{nombre}: {base}/{base * 2}/{base * 3} px en {carpeta}')


if __name__ == '__main__':
    main()
