"""Íconos de la app instalable del portal de negocios (PWA).

Salen del ícono de la app cliente (1024 px, fondo verde a sangre y el logo
dentro de la zona segura), así que sirven a la vez como ícono normal y como
«maskable»: Android recorta la forma que quiera sin comerse la Z.

    python3 tools/generar-iconos-pwa.py
"""
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'AppCliente' / 'assets' / 'icons' / 'app_icon.png'
DESTINO = RAIZ / 'public' / 'pwa'

TAMANOS = {
    'zipa-192.png': 192,
    'zipa-512.png': 512,
    # iOS no lee el manifiesto: toma este de <link rel="apple-touch-icon">.
    'apple-touch-icon.png': 180,
}


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    fuente = Image.open(ORIGEN).convert('RGB')
    for nombre, lado in TAMANOS.items():
        fuente.resize((lado, lado), Image.LANCZOS).save(DESTINO / nombre, optimize=True)
        print(DESTINO / nombre)
    print('color de arriba:', '#%02x%02x%02x' % fuente.getpixel((512, 4)))


if __name__ == '__main__':
    main()
