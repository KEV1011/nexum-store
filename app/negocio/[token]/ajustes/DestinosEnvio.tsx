'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Truck, Loader2, Check, Trash2, Plus, AlertTriangle } from 'lucide-react'
import { useMunicipios } from '@/app/empresa/useMunicipios'
import { formatCOP } from '@/app/moneda'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

export interface Destino {
  city: string
  fee: number
  etaHours: number
  /** Hasta qué hora se recibe para que salga hoy, «HH:MM». Opcional. */
  cutoff?: string
}

/**
 * A qué otras ciudades despacha el comercio.
 *
 * El modelo que esto habilita: las empresas intermunicipales de pasajeros ya
 * salen todos los días y tienen taquilla en cada terminal. Un mayorista de
 * Cúcuta manda su mercancía en esos buses y el cliente de Bucaramanga la recibe
 * al día siguiente.
 *
 * El precio lo pone el comercio y no nosotros, porque quien sabe cuánto cuesta
 * mandar una caja a Bucaramanga es el que la manda todas las semanas, y además
 * cada uno negocia distinto con la transportadora.
 *
 * LA LISTA VACÍA SIGNIFICA «A NINGUNA», y hay que decirlo en pantalla: es lo
 * que impide que un restaurante acabe ofreciendo almuerzos a Bogotá sin
 * enterarse.
 */
export function DestinosEnvio({
  token,
  citySlug,
  inicial,
}: {
  token: string
  /** La plaza del propio comercio; sin ella no se puede declarar destinos. */
  citySlug?: string | null
  inicial: Destino[]
}) {
  const { municipios } = useMunicipios()
  const [destinos, setDestinos] = useState<Destino[]>(inicial)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setDestinos(inicial) }, [inicial])

  const nombrePlaza = useMemo(
    () => municipios.find((m) => m.slug === citySlug)?.name ?? citySlug ?? null,
    [municipios, citySlug],
  )

  // Ni la propia ciudad ni las ya declaradas: el backend las rechaza y no tiene
  // sentido ofrecerlas para que el dueño descubra el error al guardar.
  const disponibles = useMemo(
    () => municipios.filter(
      (m) => m.slug !== citySlug && !destinos.some((d) => d.city === m.slug),
    ),
    [municipios, citySlug, destinos],
  )

  const [nueva, setNueva] = useState('')
  const [precio, setPrecio] = useState('')
  const [horas, setHoras] = useState('24')
  const [corte, setCorte] = useState('')

  const agregar = useCallback(() => {
    const fee = Number(precio.replace(/\D/g, ''))
    const etaHours = Number(horas)
    if (!nueva || !Number.isFinite(fee) || fee <= 0) return
    setDestinos((prev) => [
      ...prev,
      { city: nueva, fee, etaHours, ...(corte ? { cutoff: corte } : {}) },
    ])
    setNueva(''); setPrecio(''); setHoras('24'); setCorte('')
    setGuardado(false)
  }, [nueva, precio, horas, corte])

  const quitar = (city: string) => {
    setDestinos((prev) => prev.filter((d) => d.city !== city))
    setGuardado(false)
  }

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/shipping`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinos }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean; error?: string; data?: Destino[]
      }
      if (!res.ok || json.success === false) {
        // El motivo del backend se muestra tal cual: dice la ciudad y el
        // problema concreto («supera el máximo», «está repetida»).
        setError(json.error ?? 'No se pudieron guardar los destinos.')
        return
      }
      if (json.data) setDestinos(json.data)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  const nombre = (slug: string) =>
    municipios.find((m) => m.slug === slug)?.name ?? slug

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          destinos.length > 0 ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'
        }`}>
          <Truck className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 text-sm">Envíos a otras ciudades</p>
          <p className="text-xs text-slate-500">
            {destinos.length > 0
              ? 'Tus clientes de estas ciudades pueden comprarte y recibir su pedido allá.'
              : 'Hoy solo entregas en tu ciudad. Agrega un destino para vender fuera.'}
          </p>
        </div>
      </div>

      {/* Sin plaza no hay nada que hacer aquí, y el motivo tiene arreglo:
          ubicarse en el mapa, que está justo encima en esta misma página. */}
      {!citySlug ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>
            Primero ubica tu negocio en el mapa, aquí arriba. Sin saber de qué
            ciudad sales no podemos calcular un envío.
          </span>
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Sales desde <strong className="text-slate-700">{nombrePlaza}</strong>.
            El precio que pongas es lo que le cobras al cliente por llevarle el
            pedido hasta allá — lo que te cobre la transportadora va por tu cuenta.
          </p>

          {destinos.length > 0 && (
            <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {destinos.map((d) => (
                <li key={d.city} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{nombre(d.city)}</p>
                    <p className="text-xs text-slate-500">
                      {formatCOP(d.fee)} · llega en {d.etaHours} h
                      {d.cutoff ? ` · corte ${d.cutoff}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => quitar(d.city)}
                    aria-label={`Quitar ${nombre(d.city)}`}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none"
            >
              <option value="">Elige una ciudad…</option>
              {disponibles.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name} — {m.department}
                </option>
              ))}
            </select>
            <button
              onClick={agregar}
              disabled={!nueva || !precio}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
            <input
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              inputMode="numeric"
              placeholder="Precio del envío"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none"
            />
            <select
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none"
            >
              <option value="12">Mismo día</option>
              <option value="24">Al día siguiente</option>
              <option value="48">En 2 días</option>
              <option value="72">En 3 días</option>
            </select>
            {/* La hora de corte es lo que convierte la promesa en una fecha
                real: sin ella, a las cinco de la tarde se le sigue diciendo al
                cliente «llega en 12 horas» con el bus de las cuatro ya ido. */}
            <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0">Recibo hasta las</span>
              <input
                type="time"
                value={corte}
                onChange={(e) => setCorte(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none"
              />
              <span className="text-slate-400">
                para que salga el mismo día (opcional)
              </span>
            </label>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            onClick={() => void guardar()}
            disabled={guardando}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : guardado ? <Check className="w-4 h-4" /> : null}
            {guardado ? 'Guardado' : 'Guardar destinos'}
          </button>
        </>
      )}
    </div>
  )
}
