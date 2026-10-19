'use client'

import { useEffect, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'

import { BACKEND_URL } from '../../../backend'
import { motivoClaveInvalida } from '../../../clave-personal'

const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-center text-lg tracking-[0.4em] ' +
  'text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

/**
 * La clave con la que el dueño recupera el enlace de su portal si lo pierde.
 *
 * El enlace del portal es la llave del negocio entero, y se recupera con el
 * teléfono. Mientras el código que llega por mensaje sea el mismo para todos,
 * el teléfono solo no prueba nada: con saber el número del dueño, cualquiera
 * se llevaba el enlace. Con clave, la recuperación la pide.
 */
export function ClaveNegocio({ token }: { token: string }) {
  const [cargando, setCargando] = useState(true)
  const [tiene, setTiene] = useState(false)
  const [exigible, setExigible] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repite, setRepite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true
    fetch(`${BACKEND_URL}/business/${token}/clave`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { data?: { tiene?: boolean; exigible?: boolean } }) => {
        if (!vivo) return
        setTiene(j.data?.tiene === true)
        setExigible(j.data?.exigible === true)
      })
      .catch(() => { /* sin respuesta se ofrece crearla igual */ })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [token])

  async function guardar() {
    const motivo = motivoClaveInvalida(nueva)
    if (motivo) { setError(motivo); return }
    if (nueva !== repite) { setError('Las dos claves no coinciden.'); return }
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/clave`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nueva, ...(tiene ? { actual } : {}) }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setError(json.error ?? 'No se pudo guardar la clave.'); return }
      setTiene(true)
      setAbierto(false)
      setListo(true)
      setActual('')
      setNueva('')
      setRepite('')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) return null

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
      <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
        <Lock className="w-4 h-4 text-slate-500" /> Clave para recuperar tu enlace
      </h2>
      {!tiene && exigible && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          Todavía no tienes clave. Mientras el código que llega por mensaje sea el mismo para todos, cualquiera que
          sepa tu teléfono podría recuperar este enlace. Créala ahora.
        </p>
      )}
      {tiene && !abierto && (
        <p className="text-xs text-slate-600">
          {listo ? 'Clave guardada. ' : ''}Te la pediremos cuando recuperes el enlace con tu teléfono.
        </p>
      )}
      {!abierto ? (
        <button
          onClick={() => { setAbierto(true); setError(null); setListo(false) }}
          className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {tiene ? 'Cambiar clave' : 'Crear clave'}
        </button>
      ) : (
        <div className="space-y-2">
          {tiene && (
            <input className={INPUT} type="password" inputMode="numeric" maxLength={6} placeholder="Clave actual"
              autoComplete="current-password" value={actual}
              onChange={(e) => { setActual(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }} />
          )}
          <input className={INPUT} type="password" inputMode="numeric" maxLength={6} placeholder="Clave nueva (4 a 6 números)"
            autoComplete="new-password" value={nueva}
            onChange={(e) => { setNueva(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }} />
          <input className={INPUT} type="password" inputMode="numeric" maxLength={6} placeholder="Repítela"
            autoComplete="new-password" value={repite}
            onChange={(e) => { setRepite(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void guardar()}
              disabled={guardando}
              className="min-h-[44px] flex-1 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar clave
            </button>
            <button
              onClick={() => { setAbierto(false); setError(null) }}
              className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
