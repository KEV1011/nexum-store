#!/usr/bin/env python3
"""
Íconos de iOS de las dos apps, desde el logo de marca.

POR QUÉ EXISTE. Los PNG del `AppIcon.appiconset` que había en el repo eran el
logo de Flutter, y el workflow de iOS los «arreglaba» al compilar dibujando un
pin verde con Python y pasándoselo a flutter_launcher_icons con
`continue-on-error`. O sea que un .ipa salía con uno de dos íconos que no son
ZIPA, y si el paso fallaba nadie se enteraba. Para TestFlight eso es un
rechazo esperando: el ícono es lo primero que ve el revisor.

Ahora los íconos se generan aquí, se commitean, y el build los usa tal cual.

REGLAS (las mismas que aplica flutter_launcher_icons con `remove_alpha_ios`):
  · Sin canal alfa. App Store Connect rechaza un ícono de 1024 con alfa.
  · Lo transparente del logo se rellena con el color de fondo que ya declara
    cada pubspec (`background_color_ios`), para que no cambie de color según
    la herramienta que lo genere.
  · Un tamaño por cada entrada del `Contents.json`: si Apple pide uno nuevo y
    se añade al catálogo, este script lo genera sin tocar código.

Uso:
  python3 -I tools/generar-iconos-ios.py
"""
import json
import pathlib
import re
import sys

from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
APPS = ['AppCliente', 'AppTransport']


def color_de_fondo(app: str) -> tuple[int, int, int]:
    pubspec = (RAIZ / app / 'pubspec.yaml').read_text(encoding='utf-8')
    m = re.search(r'background_color_ios:\s*"#([0-9A-Fa-f]{6})"', pubspec)
    if not m:
        sys.exit(f'{app}: falta background_color_ios en pubspec.yaml')
    h = m.group(1)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def generar(app: str) -> None:
    fuente = RAIZ / app / 'assets' / 'icons' / 'app_icon.png'
    destino = RAIZ / app / 'ios' / 'Runner' / 'Assets.xcassets' / 'AppIcon.appiconset'
    catalogo = json.loads((destino / 'Contents.json').read_text(encoding='utf-8'))

    logo = Image.open(fuente).convert('RGBA')
    fondo = Image.new('RGBA', logo.size, color_de_fondo(app) + (255,))
    plano = Image.alpha_composite(fondo, logo).convert('RGB')

    hechos: set[str] = set()
    for img in catalogo['images']:
        nombre = img['filename']
        if nombre in hechos:
            continue
        lado = float(img['size'].split('x')[0]) * int(img['scale'].rstrip('x'))
        px = round(lado)
        plano.resize((px, px), Image.LANCZOS).save(destino / nombre, 'PNG')
        hechos.add(nombre)
    print(f'{app}: {len(hechos)} íconos')


if __name__ == '__main__':
    for a in APPS:
        generar(a)
