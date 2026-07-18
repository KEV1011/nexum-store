'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import type { OperatorApi } from './api'

// Fase C del modelo de carga: control financiero total de la flota.
// Consolida TODOS los servicios sellados a la empresa (viajes, intermunicipal,
// mandados, pedidos y fletes): bruto, comisión de plataforma, neto, y el
// desglose por servicio, por conductor y por vehículo (fletes).

interface Finance {
  from: string
  to: string
  totalGross: number
  totalCommission: number
  totalNet: number
  totalServices: number
  byService: Record<string, { count: number; gross: number }>
  byDriver: { name: string; count: number; gross: number }[]
  byVehicle: { plate: string; count: number; gross: number }[]
}

const SERVICE_LABEL: Record<string, string> = {
  VIAJE: 'Viajes', INTERMUNICIPAL: 'Intermunicipal', MANDADO: 'Mandados',
  PEDIDO: 'Pedidos', FLETE: 'Fletes',
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Stat label="Servicios" value={String(data.totalServices)} />
            <Stat label="Ingreso bruto" value={cop(data.totalGross)} />
            <Stat label="Comisión ZIPA" value={`- ${cop(data.totalCommission)}`} muted />
            <Stat label="Neto flota" value={cop(data.totalNet)} highlight />
          </div>

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

          <div className="grid sm:grid-cols-2 gap-3">
            {data.byDriver.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                <p className="text-xs font-semibold text-slate-500 mb-2">Por conductor</p>
                <div className="space-y-1.5">
                  {data.byDriver.slice(0, 6).map((d) => (
                    <Row key={d.name} left={`${d.name} (${d.count})`} right={cop(d.gross)} />
                  ))}
                </div>
              </div>
            )}
            {data.byVehicle.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                <p className="text-xs font-semibold text-slate-500 mb-2">Por vehículo (fletes)</p>
                <div className="space-y-1.5">
                  {data.byVehicle.slice(0, 6).map((v) => (
                    <Row key={v.plate} left={`${v.plate} (${v.count})`} right={cop(v.gross)} />
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

function Stat({ label, value, highlight, muted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200'}`}>
      <p className={`text-lg font-bold leading-tight ${highlight ? 'text-white' : muted ? 'text-slate-500' : 'text-slate-900'}`}>{value}</p>
      <p className={`text-[11px] mt-0.5 ${highlight ? 'text-emerald-100' : 'text-slate-400'}`}>{label}</p>
    </div>
  )
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600 truncate">{left}</span>
      <span className="font-semibold text-slate-800 shrink-0 ml-2">{right}</span>
    </div>
  )
}
