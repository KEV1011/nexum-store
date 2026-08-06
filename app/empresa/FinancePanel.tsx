'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import type { OperatorApi } from './api'

// Fase C del modelo de carga: control financiero total de la flota.
// Consolida TODOS los servicios sellados a la empresa (viajes, intermunicipal,
// mandados, pedidos y fletes): bruto, comisión de plataforma, neto, y el
// desglose por servicio, por conductor y por vehículo (fletes).

interface CostBreakdown {
  fuel: number
  toll: number
  perdiem: number
  maintenance: number
  total: number
}

interface Finance {
  from: string
  to: string
  totalGross: number
  totalCommission: number
  totalNet: number
  totalServices: number
  // Añadidos con los gastos de ruta. Opcionales: si el backend aún no está
  // desplegado, el panel muestra lo de siempre en vez de romperse.
  costs?: CostBreakdown
  totalMargin?: number
  realKm?: number
  costPerKm?: number
  onTime?: { measured: number; onTime: number; late: number; pct: number; avgLateMin: number }
  efficiency?: VehicleEfficiency[]
  byService: Record<string, { count: number; gross: number }>
  byDriver: { name: string; count: number; gross: number; cost?: number }[]
  byVehicle: { plate: string; count: number; gross: number; cost?: number }[]
}

const EMPTY_COSTS: CostBreakdown = { fuel: 0, toll: 0, perdiem: 0, maintenance: 0, total: 0 }

// Rendimiento de combustible por camión (método tanque a tanque del backend).
interface VehicleEfficiency {
  vehicle: string
  fills: number
  segments: number
  km: number
  gallons: number
  kmPerGallon: number
  costPerKm: number
  spentCop: number
}

const SERVICE_LABEL: Record<string, string> = {
  VIAJE: 'Viajes', INTERMUNICIPAL: 'Intermunicipal', MANDADO: 'Mandados',
  PEDIDO: 'Pedidos', FLETE: 'Fletes', CARGA: 'Carga',
}

function cop(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}

export default function FinancePanel({ api }: { api: OperatorApi }) {
  const [data, setData] = useState<Finance | null>(null)
  const [from, setFrom] = useState('') // yyyy-mm-dd
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      if (from) qs.set('from', new Date(from + 'T00:00:00').toISOString())
      if (to) qs.set('to', new Date(to + 'T23:59:59').toISOString())
      const d = await api<Finance>(`/operator/finance/summary${qs.size ? `?${qs}` : ''}`)
      setData(d)
    } catch {
      /* el panel simplemente no pinta si falla; reintenta el interval */
    }
  }, [api, from, to])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  const services = data ? Object.entries(data.byService) : []
  const costs = data?.costs ?? EMPTY_COSTS
  // Si el backend todavía no manda el margen, se deriva aquí: el panel nunca
  // debe quedarse en blanco por ir un despliegue por delante.
  const margen = data ? data.totalMargin ?? data.totalNet - costs.total : 0

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" /> Finanzas de la flota
        </h2>
        <div className="flex items-center gap-1.5 text-xs">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white outline-none focus:border-emerald-500" />
          <span className="text-slate-400">a</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white outline-none focus:border-emerald-500" />
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3">Sin fechas = el mes en curso. Incluye todos los servicios sellados a tu flota.</p>

      {!data ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Cargando finanzas…</div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <Stat label="Servicios" value={String(data.totalServices)} />
            <Stat label="Ingreso bruto" value={cop(data.totalGross)} />
            <Stat label="Comisión ZIPA" value={`- ${cop(data.totalCommission)}`} muted />
            <Stat label="Gastos de ruta" value={`- ${cop(costs.total)}`} muted />
            <Stat label="Margen real" value={cop(margen)} highlight negative={margen < 0} />
          </div>

          {/* Desglose de gastos: es la mitad que faltaba para saber si la
              operación deja plata. Solo los fletes llevan bitácora de gastos. */}
          <div className="bg-white border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500">Gastos de ruta (fletes)</p>
              {(data.realKm ?? 0) > 0 && (
                <p className="text-[11px] text-slate-400">
                  {data.realKm} km recorridos · {cop(data.costPerKm ?? 0)}/km
                </p>
              )}
            </div>
            {costs.total === 0 ? (
              <p className="text-[11px] text-slate-400">
                Todavía no hay gastos registrados en este período. Los conductores los
                cargan desde su app, en la bitácora del flete.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Row left="Combustible" right={cop(costs.fuel)} />
                <Row left="Peajes" right={cop(costs.toll)} />
                <Row left="Viáticos" right={cop(costs.perdiem)} />
                <Row left="Mantenimiento" right={cop(costs.maintenance)} />
                <div className="border-t border-slate-100 pt-1.5">
                  <Row left="Total" right={cop(costs.total)} />
                </div>
              </div>
            )}
          </div>

          {/* Cumplimiento: solo cuenta los fletes que TENÍAN fecha comprometida.
              Incluir los que nadie prometió inflaría el indicador. */}
          {(data.onTime?.measured ?? 0) > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-slate-500 mb-2">Cumplimiento de entregas</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className={`text-2xl font-bold ${(data.onTime!.pct) >= 90 ? 'text-emerald-600' : (data.onTime!.pct) >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                  {data.onTime!.pct}%
                </span>
                <span className="text-xs text-slate-500">
                  a tiempo · {data.onTime!.onTime} de {data.onTime!.measured} con fecha comprometida
                  {data.onTime!.late > 0 && ` · ${data.onTime!.late} tarde (promedio ${data.onTime!.avgLateMin} min)`}
                </span>
              </div>
            </div>
          )}

          {services.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-slate-500 mb-2">Por servicio</p>
              <div className="space-y-1.5">
                {services.map(([k, v]) => (
                  <Row key={k} left={`${SERVICE_LABEL[k] ?? k} (${v.count})`} right={cop(v.gross)} />
                ))}
              </div>
            </div>
          )}

          {/* Rendimiento: sale de los galones y el odómetro que el conductor ya
              teclea en cada tanqueo. Solo aparecen los camiones con al menos
              dos tanqueos con odómetro — antes no hay tramo que medir. */}
          {(data.efficiency?.some((v) => v.kmPerGallon > 0) ?? false) && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5">
              <p className="text-xs font-semibold text-slate-500 mb-2">Rendimiento por camión</p>
              <div className="space-y-1.5">
                {data.efficiency!.filter((v) => v.kmPerGallon > 0).slice(0, 8).map((v) => (
                  <Row
                    key={v.vehicle}
                    left={v.vehicle}
                    right={`${v.kmPerGallon} km/gal`}
                    sub={`${v.km.toLocaleString('es-CO')} km · ${cop(v.costPerKm)}/km`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Medido entre tanqueos consecutivos del mismo camión. Los tramos con
                odómetro imposible se descartan.
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {data.byDriver.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                <p className="text-xs font-semibold text-slate-500 mb-2">Por conductor</p>
                <div className="space-y-1.5">
                  {data.byDriver.slice(0, 6).map((d) => (
                    <Row key={d.name} left={`${d.name} (${d.count})`} right={cop(d.gross)}
                      sub={d.cost ? `gastos ${cop(d.cost)}` : undefined} />
                  ))}
                </div>
              </div>
            )}
            {data.byVehicle.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                <p className="text-xs font-semibold text-slate-500 mb-2">Por vehículo (fletes)</p>
                <div className="space-y-1.5">
                  {data.byVehicle.slice(0, 6).map((v) => (
                    <Row key={v.plate} left={`${v.plate} (${v.count})`} right={cop(v.gross)}
                      sub={v.cost ? `gastos ${cop(v.cost)}` : undefined} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function Stat({
  label, value, highlight, muted, negative,
}: { label: string; value: string; highlight?: boolean; muted?: boolean; negative?: boolean }) {
  // Un margen en rojo no puede verse igual que uno sano: la tarjeta destacada
  // cambia a rojo cuando la operación pierde plata.
  const fondo = highlight
    ? negative ? 'bg-red-600 border-red-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white'
    : 'bg-white border-slate-200'
  return (
    <div className={`rounded-xl border p-3 ${fondo}`}>
      <p className={`text-lg font-bold leading-tight ${highlight ? 'text-white' : muted ? 'text-slate-500' : 'text-slate-900'}`}>{value}</p>
      <p className={`text-[11px] mt-0.5 ${highlight ? (negative ? 'text-red-100' : 'text-emerald-100') : 'text-slate-400'}`}>{label}</p>
    </div>
  )
}

function Row({ left, right, sub }: { left: string; right: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600 truncate">
        {left}
        {sub ? <span className="text-[11px] text-slate-400"> · {sub}</span> : null}
      </span>
      <span className="font-semibold text-slate-800 shrink-0 ml-2">{right}</span>
    </div>
  )
}
