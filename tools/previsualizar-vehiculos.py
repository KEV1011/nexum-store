#!/usr/bin/env python3
"""Dibuja las ilustraciones de ZIPA con los MISMOS números que el Dart.

POR QUÉ EXISTE ESTE SCRIPT
--------------------------
No hay Flutter en el entorno de desarrollo, así que sin esto lo primero que
vería un dibujo nuevo sería un teléfono del usuario — y «compila» no es «se ve
bien». Con los glifos de la home pasó: tres de las cuatro formas cambiaron por
completo después de mirarlas.

Aquí se dibujan las siluetas de VAN, BUSETA y BUS (las tres del intermunicipal)
y la BOLSA de domicilio, a los tamaños a los que de verdad se juzgan.

⚠ SI SE TOCAN ESTOS NÚMEROS, SE TOCAN LOS DE
   AppCliente/lib/app/theme/zipa_vehiculos.dart

POR QUÉ DE PERFIL Y NO DE FRENTE
--------------------------------
Se probaron las dos imágenes de bus que trajo el usuario, las dos de frente: a
44 px un bus de frente es un rectángulo con una franja de parabrisas, igual que
cualquier otra caja. De perfil se lee de un vistazo, y —lo que importa para
hablar con un terminal— permite distinguir van, buseta y bus por LARGO y por
NÚMERO DE VENTANAS, que es lo único que se diferencia a ese tamaño.

    python3 tools/previsualizar-vehiculos.py
"""
from PIL import Image, ImageDraw

SS = 8  # supermuestreo: se dibuja grande y se reduce con LANCZOS

# La rejilla de diseño. El alto es COMÚN a los tres vehículos y solo cambia el
# largo: es lo que hace que un bus se vea más largo que una van cuando los dos
# entran en el mismo cuadro.
ALTO = 44


def _piezas_vehiculo(largo, ventanas, morro, techo_alto):
    """Las piezas de un vehículo de perfil, en la rejilla de diseño.

    Lo que diferencia los tres a simple vista NO es el largo absoluto —cada
    uno se escala a su cuadro, así que los tres acaban igual de anchos— sino
    la PROPORCIÓN y el número de ventanas: la van es rechoncha (alto/largo
    0,73) con dos ventanas, el bus es alargado (0,46) con cinco.
    """
    y_techo = 5 if techo_alto else 8
    y_suelo = 33
    x0, x1 = 2, largo - 2

    if morro > 0:
        carroceria = [
            (x0 + morro, y_techo),
            (x1 - 3, y_techo),
            (x1, y_techo + 3.5),
            (x1, y_suelo),
            (x0, y_suelo),
            (x0, y_techo + 5 + morro * 0.55),
            (x0 + morro * 0.5, y_techo + 2 + morro * 0.2),
        ]
    else:
        # Bus: frente PLANO. Con el punto de morro puesto a cero quedaba un
        # chaflán en la esquina delantera y el bus parecía golpeado.
        carroceria = [
            (x0 + 2, y_techo),
            (x1 - 3, y_techo),
            (x1, y_techo + 3.5),
            (x1, y_suelo),
            (x0, y_suelo),
            (x0, y_techo + 2.5),
        ]

    vs = []
    v_y0, v_y1 = y_techo + 3, y_techo + 13
    izq = x0 + 2.5 + morro
    util = (x1 - 3) - izq
    hueco = 2.2
    ancho_v = (util - hueco * (ventanas - 1)) / ventanas
    for i in range(ventanas):
        vx = izq + i * (ancho_v + hueco)
        if i == 0 and morro > 0:
            vs.append([
                (vx + 2.2, v_y0), (vx + ancho_v, v_y0),
                (vx + ancho_v, v_y1), (vx, v_y1),
            ])
        else:
            vs.append([
                (vx, v_y0), (vx + ancho_v, v_y0),
                (vx + ancho_v, v_y1), (vx, v_y1),
            ])

    # Ruedas GRANDES y asomando: a 44 px unas ruedas pequeñas desaparecen y el
    # vehículo se queda flotando como una caja.
    r = 5.4
    ruedas = [(x0 + morro + 6.5, y_suelo, r), (x1 - 7.5, y_suelo, r)]

    # Sin franja lateral: en la primera versión partía el vehículo en dos y se
    # leía como dos bloques apilados.
    return carroceria, vs, ruedas, None


VEHICULOS = {
    # largo, ventanas, morro, techo alto
    'van':    dict(largo=60, ventanas=2, morro=9, techo_alto=False),
    'buseta': dict(largo=78, ventanas=4, morro=5, techo_alto=True),
    'bus':    dict(largo=96, ventanas=5, morro=0, techo_alto=True),
}


def dibujar_vehiculo(nombre, lado, carroceria_c, ventana_c, rueda_c):
    cfg = VEHICULOS[nombre]
    largo = cfg['largo']
    # El lienzo es cuadrado (es el cuadro del icono); el vehículo se centra.
    escala = (lado * SS) / largo
    img = Image.new('RGBA', (lado * SS, lado * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    dy = (lado * SS - ALTO * escala) / 2

    def P(pts):
        return [(x * escala, y * escala + dy) for x, y in pts]

    cuerpo, ventanas, ruedas, _ = _piezas_vehiculo(**cfg)

    # Ruedas primero: van DETRÁS de la carrocería, así solo asoma la mitad de
    # abajo. Dibujadas encima parecerían pegatinas.
    for cx, cy, r in ruedas:
        d.ellipse([(cx - r) * escala, (cy - r) * escala + dy,
                   (cx + r) * escala, (cy + r) * escala + dy], fill=rueda_c)

    d.polygon(P(cuerpo), fill=carroceria_c)
    for v in ventanas:
        d.polygon(P(v), fill=ventana_c)
    return img.resize((lado, lado), Image.LANCZOS)


def dibujar_comida(lado, plato_c, campana_c):
    """Campana de servir sobre el plato.

    La primera versión era una bolsa térmica y se leía como un MALETÍN: asa
    rígida arriba y cuerpo cuadrado son un portafolio, no comida. La campana no
    se confunde con nada y ya es el lenguaje del glifo monocromo de la misma
    tarjeta; aquí solo gana color y volumen, que es lo que la iguala con el
    taxi y el repartidor, que son ilustraciones a color.

    Y no es un plato de comida concreto —una hamburguesa diría «comida rápida»
    a un restaurante de menú del día.
    """
    G = 44
    escala = (lado * SS) / G
    img = Image.new('RGBA', (lado * SS, lado * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def E(x0, y0, x1, y1, fill):
        d.ellipse([x0 * escala, y0 * escala, x1 * escala, y1 * escala], fill=fill)

    def R(x0, y0, x1, y1, r, fill):
        d.rounded_rectangle([x0 * escala, y0 * escala, x1 * escala, y1 * escala],
                            radius=r * escala, fill=fill)

    # Cúpula: media elipse ancha, no media circunferencia — una campana de
    # servir es más ancha que alta, y con el círculo parecía un iglú.
    # UNA sola pieza bajo la cúpula. Con borde de campana Y plato se leían
    # como dos barras apiladas y el conjunto parecía una hamburguesa de rayas.
    d.pieslice([6 * escala, 8 * escala, 38 * escala, 38 * escala],
               start=180, end=360, fill=campana_c)
    E(19.2, 4.4, 24.8, 10.0, campana_c)   # pomo
    # El plato va del MISMO color que la campana, separado por un hueco: en
    # tono claro desaparecía sobre el fondo ámbar del cuadro de la tarjeta,
    # que es justo donde va a vivir. El hueco es lo que lo separa, no el color.
    R(3.5, 30.5, 40.5, 35, 2.2, plato_c)  # plato, más ancho que la cúpula
    return img.resize((lado, lado), Image.LANCZOS)


def main():
    # Los colores del tinte intermunicipal (azul) y restaurantes (ámbar), que
    # es donde van a vivir.
    AZUL, AZUL_CLARO = (21, 101, 192, 255), (227, 242, 253, 255)
    OSCURO = (30, 41, 59, 255)
    AMBAR, AMBAR_CLARO = (180, 83, 9, 255), (255, 243, 224, 255)

    tiras = []
    for lado in (44, 64, 128):
        fila = Image.new('RGBA', (lado * 4 + 50, lado + 10), (255, 255, 255, 255))
        fd = ImageDraw.Draw(fila)
        x = 5
        for nombre in ('van', 'buseta', 'bus'):
            fd.rectangle([x, 5, x + lado, 5 + lado], fill=AZUL_CLARO)
            v = dibujar_vehiculo(nombre, lado, AZUL, AZUL_CLARO, OSCURO)
            fila.paste(v, (x, 5), v)
            x += lado + 10
        fd.rectangle([x, 5, x + lado, 5 + lado], fill=AMBAR_CLARO)
        b = dibujar_comida(lado, AMBAR, AMBAR)
        fila.paste(b, (x, 5), b)
        tiras.append(fila)

    alto = sum(t.height for t in tiras) + 20
    ancho = max(t.width for t in tiras)
    hoja = Image.new('RGBA', (ancho, alto), (255, 255, 255, 255))
    y = 5
    for t in tiras:
        hoja.paste(t, (0, y))
        y += t.height + 5
    hoja.save('/tmp/vehiculos.png')
    print('escrito /tmp/vehiculos.png', hoja.size)


if __name__ == '__main__':
    main()
