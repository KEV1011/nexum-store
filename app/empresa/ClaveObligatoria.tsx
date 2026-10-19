'use client'

import { useEffect, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'

import type { OperatorApi } from './api'
import { motivoClaveInvalida } from '../clave-personal'

/**
 * Pide crear la clave personal cuando el acceso todavía no tiene una.
 *
 * Mientras el código del SMS sea el mismo para todos (la llave maestra del
 * piloto), un acceso sin clave es un acceso al que entra cualquiera que sepa
 * el teléfono. Se pregunta al SERVIDOR al abrir el portal —no se guarda en el
 * navegador— para que recargar la página no sirva para saltárselo.
 */
export default function ClaveObligatoria({ api }: { api: OperatorApi }) {
  const [falta, setFalta] = useState(false)
  const [nueva, setNueva] = useState('')
  const [repite, setRepite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    api<{ tiene: boolean; exigible: boolean }>('/operator/clave')
      .then((d) => { if (vivo) setFalta(d.exigible && !d.tiene) })
      .catch(() => { /* sin respuesta no se bloquea el portal */ })
    return () => { vivo = false }
  }, [api])

  if (!falta) return null

  async function guardar() {
    const motivo = motivoClaveInvalida(nueva)
    if (motivo) { setError(motivo); return }
    if (nueva !== repite) { setError('Las dos claves no coinciden.'); return }
    setGuardando(true)
    setError(null)
    try {
      await api('/operator/clave', { method: 'PUT', body: JSON.stringify({ nueva }) })
      setFalta(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la clave.')
    } finally {
      setGuardando(false)
    }
  }

  const campo =
    'w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-center text-lg tracking-[0.4em] text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none'

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
          <Lock className="h-5 w-5 text-emerald-700" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Crea tu clave personal</h2>
        <p className="mt-1 text-sm text-slate-600">
          Mientras el código que llega por mensaje sea el mismo para todos, tu clave es lo que impide que alguien
          que sepa tu teléfono entre a tu empresa. De 4 a 6 números; no uses 1234 ni el mismo número repetido.
        </p>
        <input
          className={`${campo} mt-4`}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          placeholder="Clave nueva"
          value={nueva}
          onChange={(e) => { setNueva(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
        />
        <input
          className={`${campo} mt-2`}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          placeholder="Repítela"
          value={repite}
          onChange={(e) => { setRepite(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !guardando) void guardar() }}
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          onClick={() => void guardar()}
          disabled={guardando}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar clave
        </button>
      </div>
    </div>
  )
}
