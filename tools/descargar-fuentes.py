#!/usr/bin/env python3
"""Baja las fuentes de la web a `app/fonts/`, para no bajarlas en cada build.

POR QUÉ EXISTE ESTE SCRIPT. El portal usaba `next/font/google`, que descarga
el .woff2 de fonts.gstatic.com DURANTE la compilación. Eso hace que un
tropiezo de red de Google —o del runner— tumbe un despliegue con decenas de
«module not found» sobre un CSS generado, sin una sola línea rota en el
repositorio: el error no se parece a su causa. Ahora los archivos están
versionados y el build no toca la red.

Correrlo solo hace falta para ACTUALIZAR las fuentes (una vez al año, o
nunca). El día a día no lo necesita.

    python3 tools/descargar-fuentes.py

LO QUE HACE Y POR QUÉ ASÍ:

1. Pide el CSS con **user-agent de Chrome**. Google sirve formatos distintos
   según quién pregunta: sin un UA moderno devuelve .ttf en vez de .woff2, que
   pesa el triple y es lo que acabaría en el repositorio sin que nadie lo note.

2. Se queda con el subconjunto **latin**, el que empieza en `U+0000-00FF`. Es
   el que cubre el español (áéíóúñü¿¡). Google parte cada familia en ocho o
   nueve subconjuntos (cirílico, griego, vietnamita…) y bajarlos todos
   multiplicaría el peso para servir alfabetos que esta plataforma no usa.

3. **Comprueba que el español está cubierto** antes de escribir nada. Si
   Google reorganiza sus subconjuntos y el archivo «latin» dejara de traer la
   eñe, el fallo aparecería como una tilde rota en producción semanas después.
   Aquí revienta en el acto y dice qué carácter falta.

4. Avisa si la fuente **no es variable**. Las dos lo son hoy (un archivo da
   los pesos 100–900). Si alguna dejara de serlo, un solo archivo ya no
   bastaría y `layout.tsx` necesitaría un `src` por peso: mejor enterarse aquí
   que ver los titulares en el peso equivocado.

Requiere `fonttools` y `brotli` solo para las comprobaciones 3 y 4:
    pip install fonttools brotli
Sin ellas descarga igual, diciendo qué no pudo comprobar.
"""

import re
import sys
import urllib.request
from pathlib import Path

DESTINO = Path(__file__).resolve().parent.parent / 'app' / 'fonts'

# Sin esto Google devuelve .ttf en vez de .woff2.
UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)

# Lo que el portal usa de verdad: `--font-inter` para el texto y
# `--font-montserrat` para los titulares (ver app/layout.tsx).
FAMILIAS = {
    'Inter-latin.woff2':      'Inter:wght@100..900',
    'Montserrat-latin.woff2': 'Montserrat:wght@100..900',
}

# Lo que tiene que saber escribir una web colombiana. La apertura de
# interrogación y exclamación entran porque son las que más se olvidan en los
# subconjuntos recortados.
ESPANOL = 'áéíóúüñÁÉÍÓÚÜÑ¿¡'


def traer(url: str) -> bytes:
    pet = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(pet, timeout=30) as r:
        return r.read()


def url_del_subconjunto_latino(css: str) -> str | None:
    """De todos los @font-face del CSS, el del subconjunto latino."""
    for bloque in re.findall(r'@font-face\s*\{(.*?)\}', css, re.S):
        rango = re.search(r'unicode-range:\s*([^;]+);', bloque)
        enlace = re.search(r'url\((https://[^)]+)\)', bloque)
        if rango and enlace and rango.group(1).strip().startswith('U+0000-00FF'):
            return enlace.group(1)
    return None


def revisar(ruta: Path) -> list[str]:
    """Devuelve los problemas encontrados; lista vacía si está sana."""
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print(f'   · sin fonttools: no se comprobó el contenido de {ruta.name}')
        return []

    fuente = TTFont(ruta)
    problemas = []

    faltan = [c for c in ESPANOL if ord(c) not in fuente.getBestCmap()]
    if faltan:
        problemas.append(
            f'{ruta.name} no trae {"".join(faltan)} — el subconjunto latino de '
            'Google cambió y ya no cubre el español.'
        )

    if 'fvar' not in fuente:
        peso = fuente['OS/2'].usWeightClass
        problemas.append(
            f'{ruta.name} dejó de ser variable (es peso fijo {peso}). '
            'layout.tsx la declara como «100 900» y necesitaría un archivo '
            'por peso.'
        )
    return problemas


def main() -> int:
    DESTINO.mkdir(parents=True, exist_ok=True)
    problemas: list[str] = []

    for nombre, familia in FAMILIAS.items():
        print(f'{nombre}:')
        css = traer(
            f'https://fonts.googleapis.com/css2?family={familia}&display=swap'
        ).decode()

        url = url_del_subconjunto_latino(css)
        if not url:
            problemas.append(
                f'{nombre}: el CSS de Google no trae un bloque con el '
                'subconjunto latino (U+0000-00FF). Revisa el nombre de la '
                'familia.'
            )
            continue

        datos = traer(url)
        ruta = DESTINO / nombre
        ruta.write_bytes(datos)
        print(f'   · {len(datos) // 1024} KB desde {url.rsplit("/", 1)[-1]}')
        problemas += revisar(ruta)

    if problemas:
        print('\nPROBLEMAS:')
        for p in problemas:
            print(f'  ✗ {p}')
        return 1

    print('\nListo. Las fuentes quedaron en app/fonts/ — commitéalas.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
