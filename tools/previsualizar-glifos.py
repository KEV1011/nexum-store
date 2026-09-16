#!/usr/bin/env python3
"""
Previsualiza los glifos propios de ZIPA antes de transcribirlos a Dart.

POR QUÉ EXISTE
--------------
Un `CustomPainter` compila siempre. Compilar no es verse bien, y aquí no hay
Flutter local: si la geometría se escribe directamente en Dart, lo primero que
la ve es un teléfono del usuario. Ya pasó con la moto cenital, que compilaba y
«era una mancha».

Este script dibuja EXACTAMENTE la misma geometría con Pillow, en la misma
rejilla de 24x24, y la saca a PNG en varios tamaños. Lo que se juzga no es el
PNG grande —cualquier cosa se ve bien a 128 px— sino el de 20 px, que es el
tamaño real del catálogo.

CÓMO USARLO
-----------
    python3 tools/previsualizar-glifos.py /ruta/de/salida

REGLAS DE DIBUJO (las mismas en Dart)
-------------------------------------
1. Rejilla de 24x24 unidades, escalada al tamaño pedido. Nada de medidas en
   píxeles: el glifo tiene que verse igual a 16 que a 29.
2. SILUETA RELLENA, no trazo. Los otros 17 iconos del catálogo son de la
   familia `rounded` de Material, que es rellena; un glifo de línea al lado se
   lee como de otra familia aunque nadie sepa decir por qué. Y de paso una
   silueta aguanta el reescalado a 20 px, donde un hueco de trazo de dos
   unidades se tapona.
3. Los detalles interiores son HUECOS en la silueta (ventanas, bujes), no
   líneas encima. En Dart eso es `PathFillType.evenOdd`; aquí se borra.
4. La tinta se centra en la rejilla. Un dibujo que ocupa de y=4 a y=15 se ve
   caído aunque el lienzo esté centrado.
5. Un solo color. Son iconos de interfaz, no ilustraciones: el color lo pone
   quien los usa (el tinte de la categoría).
"""

import os
import sys

from PIL import Image, ImageDraw

REJILLA = 24.0
# Se dibuja en grande y se reduce: Pillow no antialiasea.
SUPER = 16
BORRAR = (0, 0, 0, 0)


class Lienzo:
    """Traduce coordenadas de la rejilla de 24 a píxeles del PNG."""

    def __init__(self, px):
        self.escala = px * SUPER / REJILLA
        self.img = Image.new("RGBA", (px * SUPER, px * SUPER), BORRAR)
        self.d = ImageDraw.Draw(self.img)
        self.tinta = (17, 24, 39, 255)

    def _c(self, hueco):
        # PIL escribe el valor crudo, así que pintar con alfa 0 borra.
        return BORRAR if hueco else self.tinta

    def _p(self, x, y):
        return (x * self.escala, y * self.escala)

    def rrect(self, x0, y0, x1, y1, r, hueco=False):
        self.d.rounded_rectangle(
            [self._p(x0, y0), self._p(x1, y1)],
            radius=r * self.escala,
            fill=self._c(hueco),
        )

    def circulo(self, cx, cy, r, hueco=False):
        a, b = self._p(cx - r, cy - r)
        c, e = self._p(cx + r, cy + r)
        self.d.ellipse([a, b, c, e], fill=self._c(hueco))

    def poligono(self, puntos, hueco=False):
        self.d.polygon([self._p(x, y) for x, y in puntos], fill=self._c(hueco))

    def medio_disco(self, cx, cy, r, hueco=False):
        """La mitad de arriba de un círculo: la campana de servir."""
        a, b = self._p(cx - r, cy - r)
        c, e = self._p(cx + r, cy + r)
        self.d.pieslice([a, b, c, e], 180, 360, fill=self._c(hueco))

    def png(self, px):
        return self.img.resize((px, px), Image.LANCZOS)


# ── Los cuatro glifos ─────────────────────────────────────────────────────────
#
# Los números son los mismos que van al Dart. Si se cambian aquí, se cambian
# allí: no hay forma de que una máquina lo compruebe, porque son dos lenguajes.


def movilidad(c):
    """
    Taxi de perfil. El cartel del techo es lo único que lo separa de un carro,
    igual que en la calle.
    """
    c.rrect(10.2, 4.4, 13.8, 6.9, 0.8)                        # cartel del techo
    c.poligono([(6.0, 11.6), (8.3, 6.7), (15.7, 6.7), (18.0, 11.6)])  # cabina
    c.rrect(2.2, 11.4, 21.8, 16.6, 2.2)                       # carrocería
    c.circulo(7.0, 17.0, 2.1)                                 # rueda delantera
    c.circulo(17.0, 17.0, 2.1)                                # rueda trasera
    c.circulo(7.0, 17.0, 0.85, hueco=True)                    # buje
    c.circulo(17.0, 17.0, 0.85, hueco=True)                   # buje
    # Las ventanas, huecas: sin ellas la cabina es un triángulo macizo.
    c.poligono([(8.0, 10.6), (9.6, 8.1), (11.4, 8.1), (11.4, 10.6)], hueco=True)
    c.poligono([(12.6, 8.1), (14.4, 8.1), (16.0, 10.6), (12.6, 10.6)], hueco=True)


def restaurantes(c):
    """
    Campana de servir.

    Más legible a 20 px que un tenedor y un cuchillo cruzados, que a ese tamaño
    son dos palitos.
    """
    c.circulo(12.0, 7.0, 1.35)                                # pomo
    c.medio_disco(12.0, 16.4, 8.2)                            # campana
    c.rrect(2.2, 16.2, 21.8, 18.4, 1.1)                       # bandeja


def envios(c):
    """
    Caja de envío: la tapa MÁS ANCHA que el cuerpo es lo que la hace caja.

    Primera versión: una costura vertical que asomaba por encima de la tapa,
    que convertía la caja en un regalo con lazo. Segunda: la costura hacia
    abajo, que partía el frente en dos y se leía como un mueble.
    """
    c.rrect(2.2, 5.0, 21.8, 9.9, 1.3)                         # tapa
    c.rrect(4.1, 10.5, 19.9, 19.3, 1.5)                       # cuerpo
    c.rrect(9.9, 13.2, 14.1, 14.9, 0.7, hueco=True)           # tirador


def intermunicipal(c):
    """
    Buseta de perfil: cuerpo alto, fila de ventanas, dos ruedas.

    Se probó de frente para no repetir silueta con el taxi y se leía como un
    electrodoméstico —un rectángulo alto con una pantalla y dos puntos—. De
    perfil no se confunde: el taxi es bajo y con el techo inclinado, la buseta
    es una caja alta con ventanas.
    """
    c.rrect(2.2, 4.8, 21.8, 17.2, 2.8)                        # carrocería
    c.rrect(4.3, 7.0, 19.7, 11.9, 1.2, hueco=True)            # fila de ventanas
    c.rrect(9.1, 7.0, 10.2, 11.9, 0.0)                        # montante
    c.rrect(13.8, 7.0, 14.9, 11.9, 0.0)                       # montante
    c.circulo(7.0, 17.6, 2.1)                                 # rueda delantera
    c.circulo(17.0, 17.6, 2.1)                                # rueda trasera
    c.circulo(7.0, 17.6, 0.85, hueco=True)                    # buje
    c.circulo(17.0, 17.6, 0.85, hueco=True)                   # buje


GLIFOS = {
    "movilidad": movilidad,
    "restaurantes": restaurantes,
    "envios": envios,
    "intermunicipal": intermunicipal,
}

# 20 es el tamaño del catálogo; 29 es el de la puerta de la home (20 x 1.45);
# 128 es para mirar el dibujo con lupa. El que decide es el de 20.
TAMANOS = [20, 29, 128]


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(salida, exist_ok=True)

    for px in TAMANOS:
        hueco = max(8, px // 2)
        ancho = len(GLIFOS) * (px + hueco) + hueco
        tira = Image.new("RGBA", (ancho, px + 2 * hueco), (248, 249, 250, 255))
        x = hueco
        for _, fn in GLIFOS.items():
            c = Lienzo(px)
            fn(c)
            tira.alpha_composite(c.png(px), (x, hueco))
            x += px + hueco
        ruta = os.path.join(salida, f"glifos-{px}.png")
        tira.save(ruta)
        print(f"  {ruta}  ({ancho}x{tira.height})")


if __name__ == "__main__":
    main()
