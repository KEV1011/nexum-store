'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Avisar al comensal de la mesa cuando su pedido cambia.
 *
 * EL DEFECTO: la página de la carta sondea el estado cada 10 s y **no avisaba
 * de nada** — ni sonido, ni notificación, ni título. El comensal guarda el
 * teléfono; cuando la cocina acepta y declara su tiempo, o cuando el plato
 * sale, la página lo sabe y él no. Por eso tampoco calificaba: la hoja de
 * estrellas solo la ve quien vuelve a abrir la pantalla por su cuenta.
 *
 * NO ES `useOrderAlert`, y la diferencia importa. Aquél es la alarma de una
 * cocina: tres repiques que se repiten mientras haya pedidos sin atender,
 * porque el cocinero está de espaldas. Esto suena en la mesa de un
 * restaurante, así que:
 *
 *   - **Un solo repique corto**, nunca una alarma que insista.
 *   - Avisa en DOS transiciones y no en cada cambio: cuando la cocina acepta
 *     —que es cuando aparece el tiempo— y cuando se sirve. Lo demás es ruido.
 *   - La notificación del sistema solo con la pestaña oculta: con la página
 *     delante ya se ve el cambio.
 *
 * EL PERMISO SE PIDE AL ENVIAR EL PEDIDO, no al abrir la carta: antes de pedir
 * no hay nada que avisar y un diálogo en frío se rechaza —y rechazado no se
 * vuelve a preguntar—. Por eso `prepararAvisos` es una función aparte que
 * llama el botón de «Enviar a la cocina», que además es el toque que
 * desbloquea el audio en iOS.
 */

/** Campana de dos notas, UNA vez. */
function tocarCampana(ctx: AudioContext) {
  const t0 = ctx.currentTime + 0.02
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = t0 + i * 0.16
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.55)
  }
}

let ctxCompartido: AudioContext | null = null

/** Deja el audio y el permiso listos. Se llama DESDE un toque del comensal. */
export async function prepararAvisos(): Promise<void> {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor && !ctxCompartido) ctxCompartido = new Ctor()
    // En iOS el contexto nace suspendido y solo se reanuda desde un gesto.
    if (ctxCompartido?.state === 'suspended') await ctxCompartido.resume()
  } catch {
    // Sin audio el aviso sigue valiendo: queda la notificación y el título.
  }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  } catch {
    /* el comensal decide */
  }
}

/** Los estados en los que hay algo que decirle, y qué decirle. */
export type EstadoAviso = 'aceptado' | 'servido'

export function textoDeAviso(estado: EstadoAviso, minutos?: number | null): string {
  if (estado === 'servido') return 'Tu pedido está servido. ¡Buen provecho!'
  // Sin minutos declarados NO se inventa un tiempo: se dice lo que se sabe.
  return minutos && minutos > 0
    ? `La cocina aceptó tu pedido · sale en unos ${minutos} min`
    : 'La cocina aceptó tu pedido'
}

/**
 * Avisa cuando `estado` entra en una transición que al comensal le importa.
 *
 * Se dispara por CAMBIO, no por valor: `useEffect` con el estado anterior
 * guardado. Sin eso, cada sondeo de 10 s volvería a sonar.
 */
export function useAvisoComensal(
  estado: EstadoAviso | null,
  minutos?: number | null,
): void {
  const anterior = useRef<EstadoAviso | null>(null)
  const avisados = useRef<Set<EstadoAviso>>(new Set())

  const avisar = useCallback((e: EstadoAviso, min?: number | null) => {
    const texto = textoDeAviso(e, min)
    try {
      if (ctxCompartido && ctxCompartido.state === 'running') tocarCampana(ctxCompartido)
    } catch { /* el sonido es el extra, no el aviso */ }
    try { navigator.vibrate?.(120) } catch { /* no todos vibran */ }
    try {
      if (
        typeof document !== 'undefined' &&
        document.hidden &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification('ZIPA', { body: texto, tag: 'zipa-mesa' })
      }
    } catch { /* el navegador puede negarse */ }
  }, [])

  useEffect(() => {
    if (!estado) return
    // Solo al ENTRAR en el estado, y solo una vez por estado: volver a
    // sonar en cada sondeo sería insoportable en una mesa.
    if (anterior.current === estado || avisados.current.has(estado)) {
      anterior.current = estado
      return
    }
    anterior.current = estado
    avisados.current.add(estado)
    avisar(estado, minutos)
  }, [estado, minutos, avisar])
}
