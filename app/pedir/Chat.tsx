'use client'

import { useEffect, useRef, useState } from 'react'
import type { MensajeChat } from './api'

/**
 * El chat del viaje, sobre el MISMO WebSocket que ya usan las dos apps.
 *
 * POR QUÉ AQUÍ Y NO POR WHATSAPP. Meta regala 1.000 mensajes de servicio al
 * mes por número y cobra a partir de ahí; un chat de seis mensajes por carrera
 * agota ese cupo en unas 160 carreras. Por WebSocket no hay techo ni costo por
 * mensaje, y es instantáneo. WhatsApp queda para lo que esta pestaña no puede
 * hacer: avisar cuando el pasajero la cerró.
 *
 * El socket lo maneja la página (uno solo para estado del viaje y chat); este
 * componente solo pinta y avisa hacia arriba cuando hay que enviar.
 */
export function Chat({
  mensajes,
  conectado,
  onEnviar,
  nombreConductor,
}: {
  mensajes: MensajeChat[]
  conectado: boolean
  onEnviar: (texto: string) => void
  nombreConductor: string
}) {
  const [texto, setTexto] = useState('')
  const finRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes.length])

  function enviar() {
    const t = texto.trim()
    if (!t || !conectado) return
    onEnviar(t)
    setTexto('')
  }

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">
          Chat con {nombreConductor}
        </span>
        <span
          className={`ml-auto text-[11px] font-semibold ${
            conectado ? 'text-emerald-600' : 'text-amber-600'
          }`}
        >
          {/* Reconectando se DICE: escribir en un chat caído y que el mensaje
              no salga es peor que saber que hay que esperar un momento. */}
          {conectado ? 'En línea' : 'Reconectando…'}
        </span>
      </div>

      <div className="h-56 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
        {mensajes.length === 0 ? (
          <p className="text-xs text-slate-400 text-center mt-16">
            Escríbele si necesitas indicarle algo de la recogida.
          </p>
        ) : (
          mensajes.map((m) => {
            const mio = m.senderRole === 'client'
            return (
              <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                    mio
                      ? 'bg-emerald-600 text-white rounded-br-sm'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
                  }`}
                >
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt="Foto enviada en el chat"
                      className="rounded-lg mb-1 max-h-40 w-auto"
                    />
                  )}
                  {m.body && <span className="whitespace-pre-wrap break-words">{m.body}</span>}
                  <span
                    className={`block text-[10px] mt-0.5 ${
                      mio ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {new Date(m.sentAt).toLocaleTimeString('es-CO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={finRef} />
      </div>

      <div className="flex items-center gap-2 p-2 border-t border-slate-100">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar()
          }}
          placeholder="Escribe un mensaje…"
          maxLength={500}
          className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!conectado || texto.trim().length === 0}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
