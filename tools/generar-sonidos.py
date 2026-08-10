"""Genera dos sonidos de solicitud ORIGINALES para la app del conductor.

Sin numpy ni librerías de audio: síntesis a mano sobre el módulo `wave` de la
biblioteca estándar. Al ser generados desde cero no hay grabación de nadie de
por medio y no hay licencia que respetar.

Los dos tienen que cumplir lo mismo: oírse en la calle con ruido, distinguirse
de una notificación de WhatsApp, y repetirse en bucle sin cansar —el conductor
lo escucha varias veces al día y suena en bucle mientras decide—.
"""
import math
import struct
import wave

SR = 44100


def _envelope(i, n, ataque=0.005, caida=0.35):
    """Ataque rápido y caída exponencial: así suena una campana, no un pitido."""
    t = i / SR
    dur = n / SR
    if t < ataque:
        return t / ataque
    # Caída exponencial hasta el final; el último 8 % se apaga en rampa para
    # que el bucle no produzca un chasquido al empalmar.
    e = math.exp(-(t - ataque) / caida)
    restante = (dur - t) / dur
    if restante < 0.08:
        e *= restante / 0.08
    return e


def campana(freq, n, i, brillo=2.0):
    """Timbre de campana por FM: una portadora modulada da los armónicos
    inarmónicos que hacen que suene a metal y no a flauta."""
    t = i / SR
    mod = math.sin(2 * math.pi * freq * 1.41 * t) * brillo * math.exp(-t / 0.18)
    return math.sin(2 * math.pi * freq * t + mod)


def nota(freq, dur_s, brillo=2.0, caida=0.35):
    n = int(SR * dur_s)
    return [campana(freq, n, i, brillo) * _envelope(i, n, caida=caida)
            for i in range(n)]


def mezclar(pistas, total_s):
    """Suma pistas (desplazamiento en segundos, muestras) en un buffer común."""
    total = int(SR * total_s)
    buf = [0.0] * total
    for offset_s, muestras in pistas:
        off = int(SR * offset_s)
        for i, v in enumerate(muestras):
            if off + i < total:
                buf[off + i] += v
    pico = max(abs(v) for v in buf) or 1.0
    # Normalizado a -1.5 dB: fuerte pero sin recortar en altavoces baratos.
    ganancia = 0.84 / pico
    return [v * ganancia for v in buf]


def escribir(path, buf):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(
            struct.pack('<h', int(max(-1.0, min(1.0, v)) * 32767)) for v in buf
        ))
    print(f'{path}  {len(buf)/SR:.2f} s')


# ── Opción A · "Campana doble" ────────────────────────────────────────────────
# Dos notas ascendentes (La5 → Do#6, una tercera mayor) con cola de campana.
# Serena y reconocible: el registro clásico de "tienes un viaje".
A = mezclar([
    (0.00, nota(880.00, 1.10, brillo=2.2, caida=0.30)),
    (0.16, nota(1108.73, 1.30, brillo=1.8, caida=0.38)),
    # Un armónico suave una octava arriba da presencia sin subir el volumen.
    (0.16, [v * 0.28 for v in nota(2217.46, 0.60, brillo=1.2, caida=0.16)]),
], 1.70)
escribir('/tmp/opcion_a_campana.wav', A)

# ── Opción B · "Triple ascendente" ────────────────────────────────────────────
# Tres notas cortas subiendo (Mi6 → Sol#6 → Si6). Más urgente y más difícil de
# ignorar con la moto en marcha; el bucle nota antes que hay algo esperando.
B = mezclar([
    (0.00, nota(1318.51, 0.30, brillo=1.4, caida=0.10)),
    (0.13, nota(1661.22, 0.30, brillo=1.4, caida=0.10)),
    (0.26, nota(1975.53, 0.90, brillo=1.6, caida=0.26)),
], 1.35)
escribir('/tmp/opcion_b_triple.wav', B)
