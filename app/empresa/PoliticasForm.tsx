'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollText, Loader2, Check } from 'lucide-react'
import type { OperatorApi } from './api'

/**
 * Las condiciones del tiquete que la empresa publica.
 *
 * Son las cuatro preguntas de la taquilla —equipaje, mascotas, menores,
 * cancelación— y hasta ahora la app no respondía ninguna, así que el pasajero
 * o no compraba o se enteraba en el andén.
 *
 * LA VISTA PREVIA VIENE DEL SERVIDOR, y es a propósito: `policyLines` es el
 * texto exacto que va a leer el pasajero. Si esta pantalla lo redactara por su
 * cuenta, la empresa creería estar publicando una regla y en la app saldría
 * otra — el mismo fallo que se evitó en su día haciendo que el banner de la
 * promoción y la caja usaran la misma función.
 */

interface Perfil {
  policies: Politicas | null
  policyLines?: string[]
}

interface Politicas {
  equipajeKg?: number
  equipajePiezas?: number
  mascotas?: string
  menores?: string
  cancelacionHoras?: number
  notas?: string
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

const MASCOTAS = [
  ['', 'Sin declarar'],
  ['no', 'No se admiten'],
  ['transportin', 'Sí, en guacal o transportín'],
  ['consulta', 'Consultar con la empresa'],
] as const

const MENORES = [
  ['', 'Sin declarar'],
  ['no_solos', 'Solo acompañados por un adulto'],
  ['con_autorizacion', 'Solos con autorización firmada'],
  ['consulta', 'Consultar con la empresa'],
] as const

export default function PoliticasForm({ api }: { api: OperatorApi }) {
  const [p, setP] = useState<Politicas>({})
  const [lineas, setLineas] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<Perfil>('/operator/profile')
      setP(data.policies ?? {})
      setLineas(data.policyLines ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const set = (patch: Partial<Politicas>) => setP((x) => ({ ...x, ...patch }))

  const guardar = async () => {
    setGuardando(true)
    setGuardado(false)
    setError(null)
    try {
      await api('/operator/profile', {
        method: 'PUT',
        body: JSON.stringify({ policies: p }),
      })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
      // Se recarga para traer el texto redactado por el servidor, que es el
      // que verá el pasajero.
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <p className="text-sm text-slate-400 text-center py-4">Cargando condiciones…</p>
      </section>
    )
  }

  const num = (v: number | undefined) => (v === undefined ? '' : String(v))
  const aNum = (s: string) => (s.trim() === '' ? undefined : Number(s))

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-emerald-600" /> Condiciones del tiquete
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Lo que el pasajero pregunta antes de comprar. Lo que dejes sin
          declarar no se muestra: no inventamos una condición en tu nombre.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Equipaje incluido (piezas)
          </label>
          <input
            className={INPUT}
            type="number"
            min={0}
            max={10}
            placeholder="Ej: 2"
            value={num(p.equipajePiezas)}
            onChange={(e) => set({ equipajePiezas: aNum(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Peso máximo (kg)
          </label>
          <input
            className={INPUT}
            type="number"
            min={0}
            max={100}
            placeholder="Ej: 20"
            value={num(p.equipajeKg)}
            onChange={(e) => set({ equipajeKg: aNum(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Mascotas</label>
          <select
            className={INPUT}
            value={p.mascotas ?? ''}
            onChange={(e) => set({ mascotas: e.target.value || undefined })}
          >
            {MASCOTAS.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Menores de edad</label>
          <select
            className={INPUT}
            value={p.menores ?? ''}
            onChange={(e) => set({ menores: e.target.value || undefined })}
          >
            {MENORES.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Cancelación: hasta cuántas horas antes
          </label>
          <input
            className={INPUT}
            type="number"
            min={0}
            max={168}
            placeholder="Ej: 4"
            value={num(p.cancelacionHoras)}
            onChange={(e) => set({ cancelacionHoras: aNum(e.target.value) })}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            El pago del pasaje no pasa por ZIPA, así que la app dice que la
            devolución del dinero se acuerda contigo.
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Otra condición (opcional)
          </label>
          <textarea
            className={INPUT}
            rows={2}
            maxLength={500}
            placeholder="Ej: Presentarse 20 minutos antes en la taquilla."
            value={p.notas ?? ''}
            onChange={(e) => set({ notas: e.target.value })}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        onClick={() => void guardar()}
        disabled={guardando}
        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : guardado ? <Check className="w-4 h-4" /> : null}
        {guardado ? 'Publicado' : 'Publicar condiciones'}
      </button>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          Así lo ve el pasajero
        </p>
        {lineas.length === 0 ? (
          <p className="text-sm text-slate-500">
            «Esta empresa no ha publicado sus condiciones.»
          </p>
        ) : (
          <ul className="space-y-1">
            {lineas.map((l, i) => (
              <li key={i} className="text-sm text-slate-700">· {l}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
