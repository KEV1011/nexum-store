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
}

const SERVICE_LABEL: Record<string, string> = {
  VIAJE: 'Viajes', INTERMUNICIPAL: 'Intermunicipal', MANDADO: 'Mandados', PEDIDO: 'Pedidos', FLETE: 'Fletes',
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

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      if (from) qs.set('from', new Date(from + 'T00:00:00').toISOString())
      if (to) qs.set('to', new Date(to + 'T23:59:59').toISOString())
      const d = await api<Analytics>(`/operator/fleet/analytics${qs.size ? `?${qs}` : ''}`)
      setData(d)
    } catch {
      /* reintenta en el interval */
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
            <Stat label="Servicios" value={String(data.totalServices)} />
            <Stat label="Facturación" value={cop(data.totalGross)} />
            <Stat label="Ticket promedio" value={cop(data.avgTicket)} />
            <Stat label="Neto flota" value={cop(data.totalNet)} highlight />
          </div>

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

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200'}`}>
      <p className={`text-lg font-bold leading-tight ${highlight ? 'text-white' : 'text-slate-900'}`}>{value}</p>
      <p className={`text-[11px] mt-0.5 ${highlight ? 'text-emerald-100' : 'text-slate-400'}`}>{label}</p>
    </div>
  )
}
