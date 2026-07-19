'use client'

// ── Alertas de seguridad EN VIVO de la flota (Torre de Control) ───────────────
// Geocerca de destino, detenciones prolongadas y desvíos del corredor de la
// ruta en servicios EN CURSO. El backend las mantiene en memoria (se reinician
// con el redeploy); aquí se sondean cada 15 s.

import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { OperatorApi } from './api'

interface SafetyAlert {
  id: number
  at: string
  kind: 'geofence' | 'stall' | 'deviation'
  driverName: string
  serviceKind: string
  serviceId: string
  detail: string
}

const KIND_META: Record<SafetyAlert['kind'], { label: string; cls: string }> = {
  geofence: { label: '📍 Llegando a destino', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  stall: { label: '⏸ Detención prolongada', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  deviation: { label: '↪ Desvío de ruta', cls: 'bg-red-50 text-red-700 border-red-200' },
}

const SERVICE_LABEL: Record<string, string> = {
  trip: 'Viaje',
  intercity: 'Intermunicipal',
  freight: 'Flete',
}

export default function AlertsPanel({ api }: { api: OperatorApi }) {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([])

  const load = useCallback(async () => {
    try {
      const data = await api<SafetyAlert[]>('/operator/alerts')
      setAlerts(Array.isArray(data) ? data : [])
    } catch {
      // silencioso: la torre sigue mostrando lo último conocido
    }
  }, [api])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 15_000)
    return () => clearInterval(t)
  }, [load])

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-600" /> Alertas de ruta
        <span className="text-slate-400 font-normal">({alerts.length})</span>
      </h2>
      {alerts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-400">
          Sin alertas: tu flota va en ruta y sin novedades. 🎉
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, 20).map((a) => {
            const meta = KIND_META[a.kind] ?? KIND_META.deviation
            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                <span className="text-sm font-semibold text-slate-800">{a.driverName}</span>
                <span className="text-xs text-slate-500">
                  {SERVICE_LABEL[a.serviceKind] ?? a.serviceKind} · {a.detail}
                </span>
                <span className="text-[11px] text-slate-400 ml-auto">
                  {new Date(a.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
