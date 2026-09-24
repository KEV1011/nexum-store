'use client'

import { useCallback, useEffect, useState } from 'react'
import { Banknote, Loader2, Check } from 'lucide-react'
import type { OperatorApi } from './api'

/**
 * Cómo cobra la empresa el pasaje.
 *
 * Hasta ahora la reserva terminaba sin decir una palabra sobre el dinero: el
 * pasajero confirmaba su silla y se quedaba sin saber si paga al subir, si
 * tiene que transferir antes, o si se paga en taquilla.
 *
 * LA PLATA NO PASA POR ZIPA. Esto no es una pasarela: es lo que la empresa
 * DECLARA, publicado tal cual. Por eso el texto lo redacta el servidor
 * (`paymentLines`) y aquí solo se muestra — si esta pantalla escribiera su
 * propia versión, la empresa creería publicar una cosa y el pasajero leería
 * otra, el mismo fallo que ya se evitó con las condiciones del tiquete.
 */

interface Perfil {
  paymentInfo: Cobro | null
  paymentLines?: string[]
}

interface Cobro {
  medios?: string[]
  detalle?: string
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

/** Los mismos cuatro del servidor (`lib/cobro-pasaje.ts`). */
const MEDIOS = [
  ['efectivo', 'Efectivo al abordar'],
  ['transferencia', 'Transferencia (Nequi, Daviplata, banco)'],
  ['datafono', 'Tarjeta con datáfono al abordar'],
  ['taquilla', 'En la taquilla de la empresa'],
] as const

export default function CobroForm({ api }: { api: OperatorApi }) {
  const [medios, setMedios] = useState<string[]>([])
  const [detalle, setDetalle] = useState('')
  const [lineas, setLineas] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<Perfil>('/operator/profile')
      setMedios(data.paymentInfo?.medios ?? [])
      setDetalle(data.paymentInfo?.detalle ?? '')
      setLineas(data.paymentLines ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const alternar = (m: string) =>
    setMedios((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : [...xs, m]))

  const guardar = async () => {
    setGuardando(true)
    setGuardado(false)
    setError(null)
    try {
      await api('/operator/profile', {
        method: 'PUT',
        // Sin ningún medio marcado se manda null: eso RETIRA la declaración,
        // que es distinto de no tocar el campo.
        body: JSON.stringify({
          paymentInfo: medios.length === 0 ? null : { medios, detalle },
        }),
      })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
      await load()
    } catch (e) {
      // El motivo exacto viene del servidor —por ejemplo, transferencia sin
      // decir a qué cuenta— y es el que tiene que leer la empresa.
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <p className="text-sm text-slate-400 text-center py-4">Cargando formas de pago…</p>
      </section>
    )
  }

  const pideCuenta = medios.includes('transferencia')

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <Banknote className="w-4 h-4 text-emerald-600" /> Cómo cobras el pasaje
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          El pasajero te paga directamente a ti: ZIPA no cobra el pasaje ni
          retiene nada. Lo que dejes sin declarar no se muestra — la app le dirá
          que lo acuerde contigo.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MEDIOS.map(([clave, etiqueta]) => (
          <label
            key={clave}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:border-emerald-400"
          >
            <input
              type="checkbox"
              checked={medios.includes(clave)}
              onChange={() => alternar(clave)}
              className="accent-emerald-600"
            />
            <span className="text-sm text-slate-700">{etiqueta}</span>
          </label>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">
          {pideCuenta ? 'A qué cuenta te transfieren (obligatorio)' : 'Detalle (opcional)'}
        </label>
        <input
          className={INPUT}
          maxLength={140}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Nequi 300 123 4567 · a nombre de Transportes del Norte"
        />
        {pideCuenta && detalle.trim() === '' && (
          <p className="text-xs text-amber-700 mt-1">
            Sin la cuenta, el pasajero lee «paga por transferencia» y no tiene a
            dónde pagarte.
          </p>
        )}
      </div>

      {/* Lo que va a leer el pasajero, redactado por el servidor. */}
      {lineas.length > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <p className="text-[11px] font-semibold text-slate-500 mb-1">
            Así lo verá el pasajero
          </p>
          <ul className="space-y-0.5">
            {lineas.map((l) => (
              <li key={l} className="text-xs text-slate-600">· {l}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={guardar}
        disabled={guardando}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : guardado ? <Check className="w-4 h-4" /> : null}
        {guardado ? 'Guardado' : 'Guardar formas de pago'}
      </button>
    </section>
  )
}
