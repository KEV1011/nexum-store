"""Genera los sonidos de solicitud de la app del conductor.

Sin numpy ni librerías de audio: síntesis a mano sobre el módulo `wave` de la
biblioteca estándar. Al generarse desde cero no hay grabación de nadie de por
medio y no hay licencia que respetar — importa, porque el sonido de una app de
transporte se parece inevitablemente al de la competencia y conviene que el
parecido sea de carácter, no de archivo.

QUÉ HACE QUE UN AVISO SUENE "NEUTRO" Y NO CHILLE
------------------------------------------------
1. **Armónicos enteros, no inarmónicos.** Una campana de verdad tiene parciales
   a 1,41×, 2,83×… de la fundamental: por eso suena a metal y "raspa". Un
   timbre neutro (marimba, madera, voz) usa múltiplos enteros: 2×, 3×, 4×. Ese
   es el cambio que más se nota.
2. **Registro medio.** Por encima de ~1,5 kHz el oído humano es más sensible
   (curva de Fletcher-Munson) y lo percibe como agresivo. Un aviso entre 400 y
   800 Hz se oye igual de bien y no fatiga tras la décima vez del día.
3. **Armónicos que caen rápido.** El brillo se va antes que el cuerpo: el 3.º y
   4.º armónico se apagan en un tercio del tiempo que la fundamental.
4. **Ataque suave.** 5 ms es un golpe seco; 12–18 ms se oye igual de puntual
   pero sin el "clic" del arranque.
"""
import math
import struct
import wave

SR = 44100

# Armónicos: (múltiplo entero, peso, cuánto más rápido se apaga que la
# fundamental). Todos enteros a propósito — ver nota 1 de arriba.
VOZ_CALIDA = [(1.0, 1.00, 1.0), (2.0, 0.32, 2.2), (3.0, 0.12, 3.5), (4.0, 0.05, 5.0)]


def nota(freq, dur_s, caida=0.45, ataque=0.014, voz=VOZ_CALIDA):
    """Una nota de timbre cálido: suma de armónicos enteros, cada uno con su
    propia caída, y una rampa final que evita el chasquido al repetir en bucle."""
    n = int(SR * dur_s)
    out = []
    for i in range(n):
        t = i / SR
        # Envolvente: ataque corto + caída exponencial.
        env = (t / ataque) if t < ataque else math.exp(-(t - ataque) / caida)
        # Los últimos 12 % se apagan en rampa: el bucle empalma sin clic.
        restante = (dur_s - t) / dur_s
        if restante < 0.12:
            env *= restante / 0.12
        v = 0.0
        for mult, peso, vel in voz:
            # Cada armónico con su propia caída: el brillo se va antes que el
            # cuerpo, que es lo que hace que el sonido "se redondee" al decaer.
            v += peso * math.exp(-(t) / (caida / vel)) * math.sin(
                2 * math.pi * freq * mult * t
            )
        out.append(v * env)
    return out


def mezclar(pistas, total_s, pico_objetivo=0.80):
    total = int(SR * total_s)
    buf = [0.0] * total
    for offset_s, muestras in pistas:
        off = int(SR * offset_s)
        for i, v in enumerate(muestras):
            if off + i < total:
                buf[off + i] += v
    pico = max(abs(v) for v in buf) or 1.0
    g = pico_objetivo / pico
    return [v * g for v in buf]


def escribir(path, buf):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(
            struct.pack('<h', int(max(-1.0, min(1.0, v)) * 32767)) for v in buf
        ))
    print(f'{path}  {len(buf)/SR:.2f} s')


if __name__ == '__main__':
    # ── C · "Dos notas cálidas" ───────────────────────────────────────────────
    # Do5 → Mi5 (523 → 659 Hz). Registro medio, timbre de marimba. Es el que
    # más se acerca al carácter de las apps grandes sin copiar su grabación.
    escribir('/tmp/opcion_c_calida.wav', mezclar([
        (0.00, nota(523.25, 0.85, caida=0.30)),
        (0.15, nota(659.25, 1.20, caida=0.42)),
    ], 1.50))

    # ── D · "Grave y serena" ──────────────────────────────────────────────────
    # Sol4 → Do5 (392 → 523 Hz), una cuarta ascendente. Aún más neutra y con
    # más cuerpo: se oye bien en el altavoz del teléfono dentro del bolsillo.
    escribir('/tmp/opcion_d_grave.wav', mezclar([
        (0.00, nota(392.00, 0.90, caida=0.34)),
        (0.17, nota(523.25, 1.30, caida=0.48)),
    ], 1.60))

    # ── E · "Doble pulso" ─────────────────────────────────────────────────────
    # La misma nota dos veces (Do5). Lo más neutro posible: no hay melodía que
    # se pegue ni intervalo que canse. El "doo-doo" clásico de aviso.
    escribir('/tmp/opcion_e_pulso.wav', mezclar([
        (0.00, nota(523.25, 0.55, caida=0.20)),
        (0.22, nota(523.25, 1.10, caida=0.40)),
    ], 1.40))
