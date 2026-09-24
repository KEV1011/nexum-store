'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { llamar, urlWebSocket, type MensajeChat, type Viaje } from './api'

/**
 * Sigue un viaje en vivo: estado, conductor y chat, sobre un único WebSocket.
 *
 * TRES DECISIONES QUE SOSTIENEN ESTO
 *
 * 1. **Un socket, no dos.** El backend identifica al cliente por la conexión
 *    (`client_auth` guarda el id contra el `ws`), así que el chat y el estado
 *    del viaje tienen que viajar por la misma: con dos sockets, el segundo
 *    quedaría sin autenticar y el chat respondería «Not authenticated».
 *
 * 2. **Polling REST de respaldo.** En un navegador el socket se cae al cambiar
 *    de red, al bloquear el teléfono o al pasar por un proxy que corta las
 *    conexiones largas. Sin respaldo, el pasajero se quedaría mirando
 *    «buscando conductor» con el taxi ya en la puerta. Es el mismo patrón que
 *    usa la app: WS primero, REST cada 5 s por debajo.
 *
 * 3. **Reconexión con espera creciente.** Reintentar cada segundo contra un
 *    backend que está despertando (Render en frío) es martillearlo justo
 *    cuando menos puede. Se empieza en 1 s y se dobla hasta 15.
 */
export function useViajeEnVivo(token: string | null, viajeId: string | null) {
  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [mensajes, setMensajes] = useState<MensajeChat[]>([])
  const [conectado, setConectado] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const enviarRef = useRef<(texto: string) => void>(() => {})
  // `vivo` corta la reconexión cuando el componente se desmonta: sin esto, un
  // `setTimeout` pendiente abriría un socket contra un componente que ya no
  // existe y el estado se actualizaría en el vacío.
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !viajeId) return

    let ws: WebSocket | null = null
    let reintento: ReturnType<typeof setTimeout> | null = null
    let espera = 1000

    function abrir() {
      if (!vivo.current) return
      try {
        ws = new WebSocket(urlWebSocket())
      } catch {
        programarReintento()
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        espera = 1000
        ws?.send(JSON.stringify({ type: 'client_auth', token }))
      }

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(String(ev.data)) as Record<string, unknown>
        } catch {
          // Un mensaje malformado no puede tumbar el seguimiento del viaje.
          return
        }
        switch (msg['type']) {
          case 'client_auth_ok':
            setConectado(true)
            ws?.send(JSON.stringify({ type: 'subscribe_trip', tripId: viajeId }))
            ws?.send(JSON.stringify({ type: 'subscribe_trip_chat', tripId: viajeId }))
            break
          case 'trip_update':
            if (msg['trip']) setViaje(msg['trip'] as Viaje)
            break
          case 'trip_chat_history':
            setMensajes((msg['messages'] as MensajeChat[] | undefined) ?? [])
            break
          case 'trip_chat_message': {
            const m = msg['message'] as MensajeChat | undefined
            if (!m) break
            // El propio mensaje vuelve por el socket. Se descarta si ya está,
            // porque duplicarlo en pantalla hace dudar de si se envió dos veces.
            setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
            break
          }
          default:
            break
        }
      }

      ws.onclose = () => {
        setConectado(false)
        programarReintento()
      }
      ws.onerror = () => ws?.close()
    }

    function programarReintento() {
      if (!vivo.current || reintento) return
      reintento = setTimeout(() => {
        reintento = null
        espera = Math.min(espera * 2, 15000)
        abrir()
      }, espera)
    }

    enviarRef.current = (texto: string) => {
      const s = wsRef.current
      if (!s || s.readyState !== WebSocket.OPEN) return
      s.send(JSON.stringify({ type: 'trip_chat_send', tripId: viajeId, text: texto }))
    }

    abrir()
    return () => {
      vivo.current = false
      if (reintento) clearTimeout(reintento)
      const s = ws
      if (s) {
        s.onclose = null // no reconectar al cerrar a propósito
        s.close()
      }
      wsRef.current = null
      setConectado(false)
    }
  }, [token, viajeId])

  // ── Respaldo REST ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !viajeId) return
    let cancelado = false

    async function refrescar() {
      try {
        const v = await llamar<Viaje>(`/client/trips/${viajeId}`, { token })
        if (!cancelado) setViaje(v)
      } catch {
        // Silencio a propósito: el WS es la vía principal y un fallo puntual
        // del sondeo no es algo que el pasajero pueda accionar.
      }
    }

    void refrescar()
    const t = setInterval(refrescar, 5000)
    return () => {
      cancelado = true
      clearInterval(t)
    }
  }, [token, viajeId])

  const enviarMensaje = useCallback((texto: string) => enviarRef.current(texto), [])

  return { viaje, setViaje, mensajes, conectado, enviarMensaje }
}
