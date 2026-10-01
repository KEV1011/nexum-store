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

LAS SEIS REGLAS QUE HACEN QUE PEGUE CON LAS DEMÁS. Las cuatro primeras salieron
de mirar los renders; las dos últimas, de compararlos CON la primera versión
de esta bolsa puesta al lado — plana y descolorida, se veía de otro juego:

1. **Supermuestreo y reducción con LANCZOS.** Pillow no antialiasa los
   polígonos; dibujar directo a 64 px deja los bordes en escalera.
2. **Volumen con degradado, no un relleno plano.** Las cuatro van de claro
   arriba a oscuro abajo y llevan un brillo especular. Medido: cada render
   usa ~1.800 colores distintos en 2.000 píxeles opacos; una bolsa de dos
   tonos planos usaba 729. Eso es exactamente la diferencia que se ve.
3. **CONTORNO OSCURO.** Es lo que más las une: el taxi, la buseta, la
   hamburguesa y el repartidor están perfilados en negro. Sin él, el objeto
   no se despega del fondo de la tarjeta y parece un icono, no una
   ilustración.
4. **Sombra de contacto elíptica y difusa bajo el objeto**, no un borde: es lo
   que las asienta en la tarjeta en vez de dejarlas flotando.
5. **Algo asomando dentro.** Las otras cuatro tienen contenido (ruedas, luces,
   el vaso y las papas). Una bolsa vacía es una silueta; con una caja roja y
   un paquete blanco saliendo se lee «compras» y además trae los acentos rojo
   y blanco que usan sus vecinas.
6. **Nada toca el borde del lienzo.** Las cuatro dejan aire alrededor; sin ese
   margen la bolsa se vería más grande que sus vecinas a igual tamaño.

Uso:  python3 tools/generar-ilustracion-tiendas.py
Salida: AppCliente/assets/servicios/{,2.0x/,3.0x/}tiendas.png (64/128/192)
        y una tira de previsualización en /tmp para juzgarla antes de subirla.
"""

from __future__ import annotations

import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

# El lienzo de trabajo. 64 px es el tamaño base del asset (1.0x); todo se
# dibuja a ESCALA veces eso y se reduce al final.
BASE = 64
ESCALA = 12          # 768 px de trabajo: sobra, y el detalle fino sobrevive
L = BASE * ESCALA


def e(v: float) -> int:
    """Pasa una coordenada del lienzo de 64 al lienzo de trabajo."""
    return round(v * ESCALA)


# ── Paleta ───────────────────────────────────────────────────────────────────
#
# El amarillo es el de la marca (el mismo del taxi). El contorno NO es negro
# puro: en los renders es un marrón muy oscuro, que a 20 px se lee como negro
# pero no apaga el color de al lado.
AMARILLO_ALTO = (255, 226, 126)
AMARILLO = (252, 186, 25)
AMARILLO_BAJO = (203, 124, 2)
LATERAL_ALTO = (236, 170, 18)
LATERAL_BAJO = (186, 118, 4)
CONTORNO = (38, 24, 2)
ROJO = (226, 62, 52)
ROJO_OSCURO = (176, 38, 32)
BLANCO = (252, 250, 246)
GRIS = (214, 210, 202)


def degradado(y0: int, y1: int,
              arriba: tuple[int, int, int],
              abajo: tuple[int, int, int]) -> Image.Image:
    """Un degradado VERTICAL a todo el lienzo, recortado luego por la máscara.

    Solo hace falta el rango de alturas: el degradado de estos renders va de
    arriba abajo y la horizontal no aporta nada. Por encima de `y0` queda el
    color claro y por debajo de `y1` el oscuro, así que una máscara que se
    salga del rango no estrena un color raro.
    """
    alto = max(1, y1 - y0)
    tira = Image.new('RGB', (1, alto))
    px = tira.load()
    for y in range(alto):
        t = y / max(1, alto - 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(arriba, abajo))
    capa = Image.new('RGB', (L, L), abajo)
    capa.paste(Image.new('RGB', (L, max(0, y0)), arriba), (0, 0))
    capa.paste(tira.resize((L, alto), Image.BILINEAR), (0, y0))
    return capa


def pintar(lienzo: Image.Image, mascara: Image.Image,
           arriba: tuple[int, int, int], abajo: tuple[int, int, int],
           rango: tuple[int, int]) -> None:
    """Rellena `mascara` con un degradado vertical en ese rango de alturas."""
    lienzo.paste(degradado(rango[0], rango[1], arriba, abajo), (0, 0), mascara)


def mascara() -> Image.Image:
    return Image.new('L', (L, L), 0)


def contorno_de(*mascaras: Image.Image, grosor: float = 1.8) -> Image.Image:
    """El borde exterior de la unión de varias máscaras.

    Se dilata la silueta y se le resta la original: así el contorno rodea el
    objeto sin comerse su color, que es como están perfilados los otros
    renders. `MaxFilter` necesita un tamaño impar.
    """
    union = mascaras[0].copy()
    for m in mascaras[1:]:
        union = ImageChops.lighter(union, m)
    k = max(3, e(grosor) | 1)
    gorda = union.filter(ImageFilter.MaxFilter(k))
    return ImageChops.subtract(gorda, union)


def construir() -> Image.Image:
    img = Image.new('RGBA', (L, L), (0, 0, 0, 0))

    # ── Geometría, en coordenadas de 64 ──────────────────────────────────────
    #
    # La bolsa es más ANCHA ARRIBA que abajo (una bolsa de papel se abre en la
    # boca y se estrecha al fondo). La primera versión tenía las coordenadas al
    # revés y salía un cubo, que es justo lo que no parece una bolsa.
    cuerpo_y0, cuerpo_y1 = 23.0, 55.0
    sup_izq, sup_der = 12.5, 51.5
    inf_izq, inf_der = 15.5, 48.5
    lateral = 7.0            # ancho de la cara lateral, a la derecha

    # ── Sombra de contacto ───────────────────────────────────────────────────
    sombra = Image.new('RGBA', (L, L), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).ellipse(
        [e(14), e(52.5), e(50), e(59.5)], fill=(40, 26, 4, 96),
    )
    img.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(e(1.1))))

    # ── Contenido que asoma: caja roja y paquete blanco ──────────────────────
    #
    # Van ANTES del cuerpo para que la boca de la bolsa los tape por abajo: así
    # salen DE la bolsa en vez de estar pegados encima.
    # La boca de la bolsa está en y=23: el contenido tiene que ASOMAR por
    # encima de eso. En la primera versión nacía en 21,5 y el cuerpo se lo
    # comía entero — la bolsa salía vacía y no se notaba el error hasta
    # mirarla, porque compilar no dice nada de esto.
    caja_roja = mascara()
    ImageDraw.Draw(caja_roja).polygon(
        [(e(18.5), e(15)), (e(28), e(11.5)), (e(28), e(23)), (e(18.5), e(25.5))],
        fill=255,
    )
    pintar(img, caja_roja, ROJO, ROJO_OSCURO, (e(13), e(26)))

    tapa_roja = mascara()
    ImageDraw.Draw(tapa_roja).polygon(
        [(e(18.5), e(15)), (e(24), e(12.8)), (e(33.5), e(9.3)), (e(28), e(11.5))],
        fill=255,
    )
    pintar(img, tapa_roja, (246, 108, 98), ROJO, (e(10.8), e(17)))

    paquete = mascara()
    ImageDraw.Draw(paquete).polygon(
        [(e(33), e(15)), (e(43), e(11.5)), (e(45.5), e(17)), (e(35.5), e(21.5))],
        fill=255,
    )
    pintar(img, paquete, BLANCO, GRIS, (e(10.5), e(21)))

    # ── Asas ─────────────────────────────────────────────────────────────────
    #
    # Dos arcos finos y ALTOS. En la primera versión eran anchas y bajas y se
    # leían como orejas; el truco es que nazcan por DETRÁS de la boca.
    asas = mascara()
    d = ImageDraw.Draw(asas)
    grosor_asa = e(1.9)
    d.arc([e(14.5), e(13), e(26.5), e(27)], start=190, end=350,
          fill=255, width=grosor_asa)
    d.arc([e(37.5), e(13), e(49.5), e(27)], start=190, end=350,
          fill=255, width=grosor_asa)
    pintar(img, asas, LATERAL_ALTO, LATERAL_BAJO, (e(11), e(27)))

    # ── Cuerpo: cara frontal y cara lateral ──────────────────────────────────
    frontal = mascara()
    ImageDraw.Draw(frontal).polygon(
        [
            (e(sup_izq), e(cuerpo_y0)),
            (e(sup_der - lateral), e(cuerpo_y0)),
            (e(inf_der - lateral), e(cuerpo_y1)),
            (e(inf_izq), e(cuerpo_y1)),
        ],
        fill=255,
    )
    pintar(img, frontal, AMARILLO_ALTO, AMARILLO_BAJO,
           (e(cuerpo_y0 - 1), e(cuerpo_y1 + 2)))

    lado = mascara()
    ImageDraw.Draw(lado).polygon(
        [
            (e(sup_der - lateral), e(cuerpo_y0)),
            (e(sup_der), e(cuerpo_y0 - 1.5)),
            (e(inf_der), e(cuerpo_y1 - 2)),
            (e(inf_der - lateral), e(cuerpo_y1)),
        ],
        fill=255,
    )
    pintar(img, lado, LATERAL_ALTO, LATERAL_BAJO,
           (e(cuerpo_y0 - 2), e(cuerpo_y1)))

    # Boca de la bolsa: una banda más clara arriba, que es el borde doblado.
    boca = mascara()
    ImageDraw.Draw(boca).polygon(
        [
            (e(sup_izq), e(cuerpo_y0)),
            (e(sup_der - lateral), e(cuerpo_y0)),
            (e(sup_der), e(cuerpo_y0 - 1.5)),
            (e(sup_der - lateral - 0.2), e(cuerpo_y0 - 1.5)),
            (e(sup_izq + 0.2), e(cuerpo_y0 - 1.5)),
        ],
        fill=255,
    )
    pintar(img, boca, (255, 232, 150), AMARILLO,
           (e(cuerpo_y0 - 2), e(cuerpo_y0 + 1)))

    # Brillo especular: una franja diagonal clara sobre la cara frontal. Es lo
    # que convierte el degradado en «material», y las cuatro lo llevan.
    brillo = mascara()
    ImageDraw.Draw(brillo).polygon(
        [(e(17.5), e(26)), (e(22.5), e(26)), (e(19.8), e(52)), (e(17.2), e(52))],
        fill=255,
    )
    brillo = ImageChops.multiply(brillo, frontal)
    brillo = brillo.filter(ImageFilter.GaussianBlur(e(0.35)))
    img.paste(Image.new('RGB', (L, L), (255, 246, 206)),
              (0, 0), brillo.point(lambda v: int(v * 0.55)))

    # ── Contorno ─────────────────────────────────────────────────────────────
    borde = contorno_de(frontal, lado, asas, caja_roja, tapa_roja, paquete)
    img.paste(Image.new('RGB', (L, L), CONTORNO), (0, 0), borde)

    # Y la arista entre las dos caras, que sin línea se pierde cuando los dos
    # amarillos quedan cerca.
    arista = mascara()
    ImageDraw.Draw(arista).line(
        [(e(sup_der - lateral), e(cuerpo_y0)), (e(inf_der - lateral), e(cuerpo_y1))],
        fill=255, width=e(0.55),
    )
    img.paste(Image.new('RGB', (L, L), CONTORNO), (0, 0),
              arista.point(lambda v: int(v * 0.65)))

    return img


def main() -> None:
    raiz = os.path.join(os.path.dirname(__file__), '..',
                        'AppCliente', 'assets', 'servicios')
    grande = construir()

    for carpeta, tam in [('', 64), ('2.0x', 128), ('3.0x', 192)]:
        destino = os.path.join(raiz, carpeta)
        os.makedirs(destino, exist_ok=True)
        grande.resize((tam, tam), Image.LANCZOS).save(
            os.path.join(destino, 'tiendas.png'))
        print(f'  · {tam}px → {os.path.normpath(os.path.join(destino, "tiendas.png"))}')

    # Tira de previsualización: sin Flutter local, lo primero que vería el
    # dibujo sería el teléfono del usuario. «Compila» no es «se ve bien».
    tiras = [20, 29, 64, 128]
    ancho = sum(t + 16 for t in tiras)
    tira = Image.new('RGBA', (ancho, 150), (245, 246, 248, 255))
    x = 8
    for t in tiras:
        tira.alpha_composite(grande.resize((t, t), Image.LANCZOS), (x, (150 - t) // 2))
        x += t + 16
    tira.save('/tmp/tiendas-preview.png')
    print('  · previsualización → /tmp/tiendas-preview.png')


if __name__ == '__main__':
    main()
