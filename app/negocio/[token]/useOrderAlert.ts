'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Aviso de pedido nuevo para el portal del negocio.
 *
 * Hasta ahora el pedido entraba por WebSocket y solo pintaba un toast. Con la
 * pestaña en segundo plano —que es como vive un portal de restaurante todo el
 * día— nadie se enteraba y el pedido se perdía. Aquí suena, parpadea el título
 * de la pestaña y, si el dueño lo permite, salta una notificación del sistema.
 *
 * El sonido se genera con WebAudio: no hay archivo que cargar, así que no
 * depende de la red ni de que el navegador acepte reproducir un `<audio>`.
 */

/** Campana de dos notas, repetida. Corta pero imposible de ignorar. */
function tocarCampana(ctx: AudioContext, cuando: number) {
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = cuando + i * 0.16
    // Ataque corto y caída larga: suena a campana, no a alarma de horno.
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.6)
  }
}

export function useOrderAlert(pendientes: number) {
  const ctxRef = useRef<AudioContext | null>(null)
  const tituloOriginal = useRef<string>('')
  const [sonidoBloqueado, setSonidoBloqueado] = useState(false)

  // El navegador no deja sonar hasta que el usuario interactúa con la página.
  // Se prepara el contexto y se marca si quedó suspendido, para poder ofrecer
  // el botón «Activar sonido» en vez de fallar en silencio.
  const prepararContexto = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      try {
        ctxRef.current = new Ctor()
      } catch {
        return null
      }
    }
    setSonidoBloqueado(ctxRef.current.state === 'suspended')
    return ctxRef.current
  }, [])

  /** Llamar desde un gesto del usuario (clic en el botón o en cualquier parte). */
  const activarSonido = useCallback(async () => {
    const ctx = prepararContexto()
    if (!ctx) return
    try {
      await ctx.resume()
      setSonidoBloqueado(ctx.state === 'suspended')
      // Nota de prueba, para que el dueño confirme que se oye.
      if (ctx.state === 'running') tocarCampana(ctx, ctx.currentTime)
    } catch {
      setSonidoBloqueado(true)
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission() } catch { /* el usuario decide */ }
    }
  }, [prepararContexto])

  // Cualquier clic en la página sirve para desbloquear el audio, aunque el
  // dueño nunca toque el botón.
  useEffect(() => {
    const desbloquear = () => { void prepararContexto()?.resume().then(() => setSonidoBloqueado(false)) }
    window.addEventListener('pointerdown', desbloquear, { once: true })
    return () => window.removeEventListener('pointerdown', desbloquear)
  }, [prepararContexto])

  /** Suena y notifica. Se llama al recibir un pedido nuevo. */
  const avisarPedido = useCallback((titulo: string, cuerpo: string) => {
    const ctx = prepararContexto()
    if (ctx && ctx.state === 'running') {
      // Tres repiques separados: uno solo se pierde entre el ruido del local.
      for (let i = 0; i < 3; i++) tocarCampana(ctx, ctx.currentTime + i * 0.9)
    }
    if (typeof navigator !== 'undefined') navigator.vibrate?.([200, 100, 200])
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      typeof document !== 'undefined' &&
      document.hidden
    ) {
      try {
        new Notification(titulo, { body: cuerpo, tag: 'zipa-pedido', renotify: true } as NotificationOptions)
      } catch { /* algunos navegadores exigen service worker; el sonido ya avisó */ }
    }
  }, [prepararContexto])

  // Título parpadeante mientras haya pedidos sin atender: el aviso persiste
  // aunque el dueño estuviera lejos del computador cuando sonó.
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!tituloOriginal.current) tituloOriginal.current = document.title
    const base = tituloOriginal.current

    if (pendientes <= 0) {
      document.title = base
      return
    }

    let visible = true
    const etiqueta = `(${pendientes}) ¡Pedido${pendientes === 1 ? '' : 's'} nuevo${pendientes === 1 ? '' : 's'}!`
    document.title = etiqueta
    const t = setInterval(() => {
      visible = !visible
      document.title = visible ? etiqueta : base
    }, 1200)

    return () => {
      clearInterval(t)
      document.title = base
    }
  }, [pendientes])

  return { avisarPedido, sonidoBloqueado, activarSonido }
}
