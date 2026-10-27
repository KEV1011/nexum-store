'use client'

import { useEffect, useState } from 'react'
import { Flag, Loader2, Check } from 'lucide-react'

import { BOTON } from '../../../ui'
import { BACKEND_URL } from '../../../backend'

/**
 * «Se leyó mal».
 *
 * Cuando el lector entiende mal una carta, lo que más sirve no es que el dueño
 * la corrija a mano (eso ya lo puede hacer en la tabla) sino que esa forma de
 * carta deje de romperse para TODOS. Esto manda la foto y lo que leímos al
 * equipo de ZIPA, que la vuelve una prueba. No cambia nada del catálogo.
 */
export function ReportarCarta({
  token,
  archivo,
  lecturaId,
}: {
  token: string
  archivo: File | null
  /** El código de la lectura: con él el servidor encuentra lo que leyó el OCR. */
  lecturaId: string | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Una foto nueva es otra carta: el aviso de «ya lo mandaste» no aplica.
  useEffect(() => {
    setAbierto(false)
    setEnviado(false)
    setError(null)
    setComentario('')
  }, [lecturaId])

  async function enviar() {
    setEnviando(true)
    setError(null)
    try {
      const body = new FormData()
      if (archivo) body.append('file', archivo)
      if (lecturaId) body.append('lecturaId', lecturaId)
      body.append('comentario', comentario.trim())
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/carta-reporte`, { method: 'POST', body })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) {
        setError(json.error ?? 'No pudimos enviarlo.')
        return
      }
      setEnviado(true)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Gracias. La vamos a revisar para que las cartas como la tuya se lean bien. Mientras tanto,
        puedes corregir la lista aquí mismo.
      </p>
    )
  }

  if (!abierto) {
    return (
      <div className="mt-4">
        <button type="button" onClick={() => setAbierto(true)} className={`${BOTON.secundario} !min-h-[40px] !text-xs`}>
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          Se leyó mal
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <label htmlFor="reporte-carta" className="text-[11px] font-semibold text-slate-700">
        ¿Qué salió mal? (opcional)
      </label>
      <textarea
        id="reporte-carta"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Ej.: los shots salieron sin precio, y la nota de abajo quedó como plato"
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      />
      <p className="mt-1 text-[11px] text-slate-500">
        Enviamos la foto y lo que leímos al equipo de ZIPA. No cambia nada de tu catálogo.
      </p>
      {error && <p className="mt-1 text-[11px] text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void enviar()} disabled={enviando} className={`${BOTON.secundario} !min-h-[40px] !text-xs`}>
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Flag className="h-3.5 w-3.5" aria-hidden="true" />}
          Enviar
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={`${BOTON.secundario} !min-h-[40px] !text-xs`}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
