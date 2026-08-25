'use client'

import { useCallback, useEffect, useState } from 'react'
import { Trophy, Star, Car, TrendingUp } from 'lucide-react'
import type { OperatorApi } from './api'

// Flota-3: rendimiento de la flota — ranking de conductores y vehículos por
// facturación, con rating, neto y ticket promedio. Datos 100% de viajes sellados.

interface Analytics {
  from: string
  to: string
  totalGross: number
  totalNet: number
  totalCommission: number
  totalServices: number
  avgTicket: number
  byService: { service: string; count: number; gross: number; avg: number }[]
  topDrivers: { name: string; count: number; gross: number; net: number; avgTicket: number; rating: number | null }[]
  topVehicles: { plate: string; count: number; gross: number; avgTicket: number; type: string | null }[]
  serie: { fecha: string; servicios: number; bruto: number }[]
  anterior: { desde: string; hasta: string; bruto: number; servicios: number }
  cambio: { bruto: number | null; servicios: number | null }
  tiempos: {
    esperaAceptacionMin: number | null
    hastaRecogerMin: number | null
    duracionMin: number | null
    muestra: number
  }
}

const SERVICE_LABEL: Record<string, string> = {
  VIAJE: 'Viajes', INTERMUNICIPAL: 'Intermunicipal', MANDADO: 'Mandados', PEDIDO: 'Pedidos', FLETE: 'Fletes',
  CARGA: 'Carga',
}
const TYPE_LABEL: Record<string, string> = {
  TAXI: 'Taxi', PARTICULAR: 'Particular', MOTO: 'Moto', TURBO: 'Turbo', CAMION: 'Camión', MULA: 'Mula',
}

function cop(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}

const RANK_TONE = ['bg-amber-400', 'bg-slate-300', 'bg-amber-700']

export default function AnalyticsPanel({ api }: { api: OperatorApi }) {
  const [data, setData] = useState<Analytics | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [fallo, setFallo] = useState(false)

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      if (from) qs.set('from', new Date(from + 'T00:00:00').toISOString())
      if (to) qs.set('to', new Date(to + 'T23:59:59').toISOString())
      const d = await api<Analytics>(`/operator/fleet/analytics${qs.size ? `?${qs}` : ''}`)
      setData(d)
      setFallo(false)
    } catch {
      setFallo(true)
    } finally {
      setLoading(false)
    }
  }, [api, from, to])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const maxDriver = data ? Math.max(1, ...data.topDrivers.map((d) => d.gross)) : 1
  const maxVehicle = data ? Math.max(1, ...data.topVehicles.map((v) => v.gross)) : 1

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <Trophy className="w-4 h-4 text-emerald-600" /> Rendimiento de la flota
        </h2>
        <div className="flex items-center gap-1.5 text-xs">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white outline-none focus:border-emerald-500" />
          <span className="text-slate-400">a</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white outline-none focus:border-emerald-500" />
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3">Sin fechas = el mes en curso. Ranking por facturación de viajes sellados a tu flota.</p>

      {loading && !data ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Cargando rendimiento…</div>
      ) : !data && fallo ? (
        // "No hay actividad" y "no pudimos consultarla" son cosas distintas:
        // decirle a un empresario que no facturó nada cuando en realidad falló
        // la consulta es darle un dato falso sobre su propio negocio.
        <div className="bg-white border border-amber-200 rounded-xl p-10 text-center">
          <TrendingUp className="w-10 h-10 text-amber-300 mx-auto mb-3" />
          <p className="font-medium text-amber-800">No pudimos cargar el rendimiento</p>
          <p className="text-slate-400 text-sm mt-1">Reintentando automáticamente. Esto no significa que no hayas tenido actividad.</p>
        </div>
      ) : !data || data.totalServices === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">Aún no hay actividad en este periodo</p>
          <p className="text-slate-400 text-sm mt-1">Cuando tus conductores completen servicios, verás aquí el ranking y el rendimiento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat
              label="Servicios"
              value={String(data.totalServices)}
              cambio={data.cambio.servicios}
            />
            <Stat
              label="Facturación"
              value={cop(data.totalGross)}
              cambio={data.cambio.bruto}
            />
            <Stat label="Ticket promedio" value={cop(data.avgTicket)} />
            <Stat label="Neto flota" value={cop(data.totalNet)} highlight />
          </div>

          <SerieDiaria puntos={data.serie} />
          <Tiempos t={data.tiempos} />

          {/* Ranking de conductores */}
          {data.topDrivers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-slate-500 mb-2.5 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500" /> Conductores por facturación
              </p>
              <div className="space-y-2.5">
                {data.topDrivers.slice(0, 8).map((d, i) => (
                  <div key={d.name}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-5 h-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0 ${RANK_TONE[i] ?? 'bg-slate-400'}`}>{i + 1}</span>
                      <span className="font-semibold text-slate-800 text-sm truncate flex-1">{d.name}</span>
                      {d.rating != null && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-slate-500 shrink-0">
                          <Star className="w-3 h-3 text-amber-400" /> {d.rating.toFixed(1)}
                        </span>
                      )}
                      <span className="font-bold text-slate-900 text-sm shrink-0">{cop(d.gross)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(d.gross / maxDriver) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{d.count} servicios · ticket {cop(d.avgTicket)} · neto {cop(d.net)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ranking de vehículos */}
          {data.topVehicles.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-slate-500 mb-2.5 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-emerald-600" /> Vehículos por facturación
              </p>
              <div className="space-y-2.5">
                {data.topVehicles.slice(0, 8).map((v, i) => (
                  <div key={v.plate}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-5 h-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0 ${RANK_TONE[i] ?? 'bg-slate-400'}`}>{i + 1}</span>
                      <span className="font-semibold text-slate-800 text-sm tracking-widest truncate">{v.plate}</span>
                      {v.type && <span className="text-[11px] text-slate-400 shrink-0">{TYPE_LABEL[v.type] ?? v.type}</span>}
                      <span className="flex-1" />
                      <span className="font-bold text-slate-900 text-sm shrink-0">{cop(v.gross)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-700 rounded-full" style={{ width: `${(v.gross / maxVehicle) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{v.count} servicios · ticket {cop(v.avgTicket)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mezcla por servicio */}
          {data.byService.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-slate-500 mb-2">Mezcla por servicio</p>
              <div className="space-y-1.5">
                {data.byService.map((s) => (
                  <div key={s.service} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate">{SERVICE_LABEL[s.service] ?? s.service} <span className="text-slate-400">({s.count})</span></span>
                    <span className="font-semibold text-slate-800 shrink-0 ml-2">{cop(s.gross)} <span className="text-slate-400 font-normal">· prom {cop(s.avg)}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, highlight, cambio }: {
  label: string; value: string; highlight?: boolean; cambio?: number | null
}) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200'}`}>
      <p className={`text-lg font-bold leading-tight ${highlight ? 'text-white' : 'text-slate-900'}`}>{value}</p>
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <p className={`text-[11px] ${highlight ? 'text-emerald-100' : 'text-slate-400'}`}>{label}</p>
        {/*
          `cambio` es null cuando el período anterior fue cero. Ahí no se pinta
          nada: «+100 %» sobre una base de cero es un estreno disfrazado de
          crecimiento, y es la mentira más fácil de colar en un tablero.
        */}
        {cambio != null && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              cambio > 0
                ? 'bg-emerald-50 text-emerald-700'
                : cambio < 0
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-slate-100 text-slate-500'
            }`}
            title="Frente al mismo número de días inmediatamente anterior"
          >
            {cambio > 0 ? '▲' : cambio < 0 ? '▼' : '='} {Math.abs(cambio)} %
          </span>
        )}
      </div>
    </div>
  )
}

/** Barras por día. Sin librería: son barras, no hace falta traerse una. */
function SerieDiaria({ puntos }: { puntos: { fecha: string; servicios: number; bruto: number }[] }) {
  if (puntos.length === 0) return null
  const max = Math.max(1, ...puntos.map((p) => p.bruto))
  const dia = (f: string) => f.slice(8, 10)
  // Con muchos días no cabe una etiqueta por barra: se marcan de cinco en cinco
  // para no convertir el eje en una mancha.
  const paso = puntos.length > 20 ? 5 : puntos.length > 10 ? 2 : 1

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <p className="text-xs font-semibold text-slate-500 mb-3">Facturación por día</p>
      <div className="flex items-end gap-[3px] h-28">
        {puntos.map((p) => (
          <div
            key={p.fecha}
            className="flex-1 min-w-0 flex flex-col justify-end h-full group relative"
            title={`${p.fecha} · ${p.servicios} servicio(s) · ${cop(p.bruto)}`}
          >
            <div
              className={`w-full rounded-t ${p.bruto > 0 ? 'bg-emerald-500 group-hover:bg-emerald-600' : 'bg-slate-100'}`}
              // Los días en cero se dibujan como una línea de 2 px en vez de
              // desaparecer: un hueco en la barra ES la información.
              style={{ height: p.bruto > 0 ? `${Math.max(4, (p.bruto / max) * 100)}%` : '2px' }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1">
        {puntos.map((p, i) => (
          <div key={p.fecha} className="flex-1 min-w-0 text-center text-[9px] text-slate-400">
            {i % paso === 0 ? dia(p.fecha) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Cuánto tarda de verdad un servicio, por etapas. */
function Tiempos({ t }: { t: Analytics['tiempos'] }) {
  const nada =
    t.esperaAceptacionMin == null && t.hastaRecogerMin == null && t.duracionMin == null
  if (nada) return null
  const min = (v: number | null) => (v == null ? '—' : `${v} min`)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <p className="text-xs font-semibold text-slate-500 mb-2.5">
        Tiempos del servicio
        <span className="font-normal text-slate-400">
          {' '}· viajes urbanos · {t.muestra} en la muestra
        </span>
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        <Reloj label="Hasta que alguien acepta" value={min(t.esperaAceptacionMin)} />
        <Reloj label="De aceptar a recoger" value={min(t.hastaRecogerMin)} />
        <Reloj label="Duración del viaje" value={min(t.duracionMin)} />
      </div>
    </div>
  )
}

function Reloj({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-base font-bold text-slate-900 leading-tight">{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{label}</p>
    </div>
  )
}
