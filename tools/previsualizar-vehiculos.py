#!/usr/bin/env python3
"""Renderiza las siluetas de `vehicle_side_view.dart` con SUS coordenadas.

No hay Flutter en este entorno y «compila» no es «se ve bien»: un vector
escrito a mano puede compilar perfecto y parecer una mancha. Esto traduce los
mismos números del pintor a una imagen para poder mirarla antes de construir
un APK.

Las coordenadas se copian del Dart a mano. Si el pintor cambia y esto no, la
imagen deja de valer — sirve para revisar una vez, no como prueba.
"""
from PIL import Image, ImageDraw

ESC = 6            # cada unidad del widget, 6 px en la vista previa
W, H = 62, 46      # tamaño real en la app


def bez(p0, p1, p2, p3, n=24):
    """Muestrea una cúbica: PIL no dibuja beziers."""
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0]
        y = u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]
        pts.append((x, y))
    return pts


class Lienzo:
    """Mismo API mental que el Path de Flutter, en coordenadas normalizadas."""

    def __init__(self):
        self.pts = []
        self.cur = (0, 0)

    def move(self, x, y):
        self.cur = (x, y); self.pts.append(self.cur)

    def line(self, x, y):
        self.cur = (x, y); self.pts.append(self.cur)

    def cubic(self, x1, y1, x2, y2, x3, y3):
        self.pts += bez(self.cur, (x1, y1), (x2, y2), (x3, y3))[1:]
        self.cur = (x3, y3)

    def px(self, w, h, ox, oy):
        return [(ox + x * w * ESC, oy + y * h * ESC) for x, y in self.pts]


def mezcla(c1, c2, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))


def dibuja(img, d, ox, oy, tipo, cuerpo):
    llanta = mezcla(cuerpo, (0, 0, 0), 0.62)
    cristal = mezcla(cuerpo, (255, 255, 255), 0.68)
    sombreado = mezcla(cuerpo, (0, 0, 0), 0.10)
    w, h = W, H

    def P(x, y): return (ox + x * w * ESC, oy + y * h * ESC)

    def rueda(cx, cy, r):
        R = r * w * ESC
        c = P(cx, cy)
        d.ellipse([c[0]-R, c[1]-R, c[0]+R, c[1]+R], fill=llanta)
        r2 = R * 0.32
        d.ellipse([c[0]-r2, c[1]-r2, c[0]+r2, c[1]+r2],
                  fill=mezcla(llanta, cristal, 0.55))

    # sombra de contacto
    c = P(0.52, 0.90)
    sw, sh = 0.80*w*ESC/2, 0.10*h*ESC/2
    d.ellipse([c[0]-sw, c[1]-sh, c[0]+sw, c[1]+sh], fill=(225, 225, 228))

    if tipo in ('car', 'taxi'):
        p = Lienzo()
        p.move(0.055, 0.755)
        p.cubic(0.050, 0.650, 0.070, 0.600, 0.150, 0.588)
        p.cubic(0.245, 0.575, 0.300, 0.370, 0.405, 0.352)
        p.line(0.600, 0.352)
        p.cubic(0.700, 0.368, 0.745, 0.520, 0.825, 0.572)
        p.cubic(0.900, 0.598, 0.955, 0.645, 0.955, 0.755)
        d.polygon(p.px(w, h, ox, oy), fill=cuerpo)
        d.polygon([P(0.268, 0.548), P(0.420, 0.398), P(0.478, 0.398),
                   P(0.478, 0.548)], fill=cristal)
        d.polygon([P(0.512, 0.398), P(0.598, 0.398), P(0.690, 0.540),
                   P(0.512, 0.548)], fill=cristal)
        rueda(0.278, 0.772, 0.118)
        rueda(0.762, 0.772, 0.118)
        if tipo == 'taxi':
            d.rounded_rectangle([P(0.400, 0.268), P(0.585, 0.352)],
                                radius=4, fill=mezcla(cuerpo, (0,0,0), 0.30))

    elif tipo == 'moto':
        gw = int(0.052 * w * ESC)
        d.line([P(0.195,0.765), P(0.395,0.640), P(0.610,0.618), P(0.690,0.480)],
               fill=cuerpo, width=gw, joint='curve')
        d.line([P(0.690,0.480), P(0.805,0.765)], fill=cuerpo, width=gw)
        d.line([P(0.618,0.408), P(0.772,0.392)], fill=cuerpo, width=gw)
        d.line([P(0.690,0.480), P(0.700,0.400)], fill=cuerpo, width=gw)
        p = Lienzo()
        p.move(0.232, 0.586)
        p.cubic(0.250, 0.522, 0.362, 0.506, 0.458, 0.522)
        p.cubic(0.532, 0.534, 0.590, 0.474, 0.662, 0.482)
        p.cubic(0.702, 0.508, 0.690, 0.582, 0.630, 0.600)
        p.line(0.332, 0.626)
        p.cubic(0.266, 0.634, 0.226, 0.620, 0.232, 0.586)
        d.polygon(p.px(w, h, ox, oy), fill=cuerpo)
        rueda(0.195, 0.772, 0.126)
        rueda(0.805, 0.772, 0.126)

    else:  # truck
        d.rounded_rectangle([P(0.050, 0.315), P(0.565, 0.740)],
                            radius=4, fill=mezcla(cuerpo, (0,0,0), 0.22))
        p = Lienzo()
        p.move(0.565, 0.740)
        p.line(0.565, 0.430)
        p.line(0.760, 0.430)
        p.cubic(0.850, 0.448, 0.930, 0.560, 0.945, 0.660)
        p.line(0.945, 0.740)
        d.polygon(p.px(w, h, ox, oy), fill=cuerpo)
        d.polygon([P(0.640, 0.478), P(0.762, 0.478), P(0.858, 0.598),
                   P(0.640, 0.598)], fill=cristal)
        rueda(0.180, 0.766, 0.116)
        rueda(0.775, 0.766, 0.116)


img = Image.new('RGB', (W*ESC*4 + 100, H*ESC + 60), (247, 248, 250))
d = ImageDraw.Draw(img)
for i, (tipo, color) in enumerate([
    ('taxi', (242, 183, 5)),
    ('car', (43, 48, 59)),
    ('moto', (43, 48, 59)),
    ('truck', (75, 85, 99)),
]):
    dibuja(img, d, 20 + i * (W*ESC + 20), 20, tipo, color)
    d.text((20 + i * (W*ESC + 20), H*ESC + 28), tipo, fill=(60, 60, 60))

img.save('/tmp/claude-0/-home-user-nexum-store/f974d00d-4341-5314-99bd-4429b64112fa/scratchpad/vehiculos.png')
print("listo")
