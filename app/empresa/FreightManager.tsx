'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Truck, Loader2, PackageSearch, Wifi } from 'lucide-react'
import type { OperatorApi } from './api'

// Tablero de fletes de carga: los clientes publican (peso, tipo de camión,
// precio) y la flota los toma asignando conductor + vehículo. Cancelar un
// flete tomado lo devuelve al tablero.

interface Freight {
  id: string
  clientName?: string
  clientPhone?: string
  originAddress: string
  destAddress: string
  originCity?: string
  destCity?: string
  cargoDescription: string
  weightKg: number
  vehicleType: string
  offeredPrice: number
  scheduledFor?: string
  status: string
  driverId?: string
  vehicleId?: string
  finalPrice?: number
  netEarning?: number
}

interface DriverOption { id: string; name: string; phone: string }
interface VehicleOption { id: string; plate: string; type: string; capacityKg: number | null }

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Disponible', ACCEPTED: 'Aceptado', IN_PROGRESS: 'En ruta',
  COMPLETED: 'Completado', CANCELLED: 'Cancelado',
}
const TYPE_LABEL: Record<string, string> = { TURBO: 'Turbo', CAMION: 'Camión', MULA: 'Mula' }

function cop(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}
function when(f: Freight) {
  if (!f.scheduledFor) return 'Lo antes posible'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(f.scheduledFor))
}

// Base HTTP del backend para resolver URLs relativas (/uploads/...) de recibos.
const HTTP_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

// WS del backend para avisos en vivo (mismo fallback de producción que api.ts).
const WS_URL = (() => {
  const base =
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    (process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : 'https://nexum-api-trxr.onrender.com')
  try {
    const u = new URL(base)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return u.toString()
  } catch {
    return 'wss://nexum-api-trxr.onrender.com'
  }
})()

interface FreightEventRow {
  id: string
  type: 'FUEL' | 'STOP' | 'NOTE'
  lat?: number
  lng?: number
  amountCop?: number
  gallons?: number
  odometerKm?: number
  note?: string
  photoUrl?: string
  createdAt: string
}

const EVENT_LABEL: Record<string, string> = {
  FUEL: 'Tanqueo',
  STOP: 'Parada',
  NOTE: 'Nota',
}

export default function FreightManager({ api, token }: { api: OperatorApi; token: string }) {
  const [available, setAvailable] = useState<Freight[]>([])
  const [mine, setMine] = useState<Freight[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Selección de conductor/vehículo por flete disponible.
  const [assign, setAssign] = useState<Record<string, { driverId: string; vehicleId: string }>>({})
  // Trazabilidad: bitácora expandida por flete (tanqueos/paradas del conductor).
  const [traceId, setTraceId] = useState<string | null>(null)
  const [trace, setTrace] = useState<{ events: FreightEventRow[]; fuelTotalCop: number } | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)

  async function toggleTrace(id: string) {
    if (traceId === id) { setTraceId(null); setTrace(null); return }
    setTraceId(id); setTrace(null); setTraceLoading(true)
    try {
      const data = await api<{ events: FreightEventRow[]; fuelTotalCop: number }>(`/operator/freight/${id}/events`)
      setTrace(data)
    } catch {
      setTrace({ events: [], fuelTotalCop: 0 })
    } finally {
      setTraceLoading(false)
    }
  }

  const load = useCallback(async () => {
    try {
      const [av, mn, ds, vs] = await Promise.all([
        api<Freight[]>('/operator/freight/available'),
        api<Freight[]>('/operator/freight'),
        api<DriverOption[]>('/operator/drivers'),
        api<VehicleOption[]>('/operator/vehicles'),
      ])
      setAvailable(Array.isArray(av) ? av : [])
      setMine(Array.isArray(mn) ? mn : [])
      setDrivers(Array.isArray(ds) ? ds : [])
      setVehicles(Array.isArray(vs) ? vs : [])
    } catch {
      /* el error puntual se muestra al accionar */
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 15_000)
    return () => clearInterval(t)
  }, [load])

  // Aviso en VIVO: al entrar un flete para los tipos de camión de esta flota,
  // el backend emite freight_new y el tablero se refresca al instante (el
  // polling de 15 s queda como respaldo). Reconecta solo cada 5 s.
  useEffect(() => {
    if (!token) return
    let closed = false
    const connect = () => {
      if (closed) return
      try {
        const ws = new WebSocket(WS_URL)
        wsRef.current = ws
        ws.onopen = () => ws.send(JSON.stringify({ type: 'operator_auth', token }))
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data as string) as { type?: string }
            if (msg.type === 'operator_auth_ok') setLive(true)
            else if (msg.type === 'freight_new') void load()
          } catch { /* mensaje ajeno */ }
        }
        ws.onclose = () => {
          setLive(false)
          wsRef.current = null
          if (!closed) reconnectRef.current = setTimeout(connect, 5000)
        }
        ws.onerror = () => ws.close()
      } catch { /* reintenta vía onclose */ }
    }
    connect()
    return () => {
      closed = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [token, load])

  async function accept(f: Freight) {
    const sel = assign[f.id]
    if (!sel?.driverId || !sel?.vehicleId) {
      setError('Selecciona el conductor y el vehículo para tomar el flete.')
      return
    }
    setError(null); setBusyId(f.id)
    try {
      await api(`/operator/freight/${f.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({ driverId: sel.driverId, vehicleId: sel.vehicleId }),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo tomar el flete.')
    } finally {
      setBusyId(null)
    }
  }

  async function setStatus(f: Freight, status: 'in_progress' | 'completed' | 'cancelled') {
    setError(null); setBusyId(f.id)
    try {
      await api(`/operator/freight/${f.id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el flete.')
    } finally {
      setBusyId(null)
    }
  }

  const cargoVehicles = vehicles.filter((v) => ['TURBO', 'CAMION', 'MULA'].includes(v.type))
  const activeMine = mine.filter((f) => f.status === 'ACCEPTED' || f.status === 'IN_PROGRESS')
  const doneMine = mine.filter((f) => f.status === 'COMPLETED').slice(0, 5)

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2 mb-1">
        <Truck className="w-4 h-4 text-emerald-600" /> Fletes de carga
        {available.length > 0 && (
          <span className="bg-amber-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">{available.length} disponibles</span>
        )}
        {live && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <Wifi className="w-3 h-3" /> En vivo
          </span>
        )}
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Solicitudes de clientes que tu flota puede tomar. Al completar un flete, la plataforma
        descuenta su comisión y el resto queda para tu operación.
      </p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Cargando fletes…</div>
      ) : (
        <div className="space-y-2.5">
          {available.length === 0 && activeMine.length === 0 && doneMine.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <PackageSearch className="w-9 h-9 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">Sin fletes por ahora. Cuando un cliente publique una carga para tus tipos de camión, aparecerá aquí.</p>
            </div>
          )}

          {available.map((f) => (
            <div key={f.id} className="bg-white border border-amber-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">
                    {f.originAddress} → {f.destAddress}
                  </p>
                  <p className="text-xs text-slate-500">
                    {TYPE_LABEL[f.vehicleType] ?? f.vehicleType} · {f.weightKg.toLocaleString('es-CO')} kg · {when(f)}
                    {f.originCity && f.destCity && f.originCity !== f.destCity ? ` · ${f.originCity} → ${f.destCity}` : ''}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{f.cargoDescription}</p>
                </div>
                <p className="font-bold text-emerald-700 text-sm shrink-0">{cop(f.offeredPrice)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={assign[f.id]?.driverId ?? ''}
                  onChange={(e) => setAssign((a) => ({ ...a, [f.id]: { driverId: e.target.value, vehicleId: a[f.id]?.vehicleId ?? '' } }))}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white outline-none focus:border-emerald-500"
                >
                  <option value="">Conductor…</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <select
                  value={assign[f.id]?.vehicleId ?? ''}
                  onChange={(e) => setAssign((a) => ({ ...a, [f.id]: { driverId: a[f.id]?.driverId ?? '', vehicleId: e.target.value } }))}
                  className="px-2.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 bg-white outline-none focus:border-emerald-500"
                >
                  <option value="">Vehículo…</option>
                  {cargoVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {TYPE_LABEL[v.type] ?? v.type}{v.capacityKg ? ` · ${v.capacityKg.toLocaleString('es-CO')} kg` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => accept(f)}
                disabled={busyId === f.id}
                className="w-full py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busyId === f.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Tomar flete
              </button>
            </div>
          ))}

          {activeMine.map((f) => (
            <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{f.originAddress} → {f.destAddress}</p>
                  <p className="text-xs text-slate-500">
                    {STATUS_LABEL[f.status]} · {TYPE_LABEL[f.vehicleType] ?? f.vehicleType} · {f.weightKg.toLocaleString('es-CO')} kg
                    {f.clientName ? ` · Cliente: ${f.clientName}${f.clientPhone ? ` (${f.clientPhone})` : ''}` : ''}
                  </p>
                </div>
                <p className="font-bold text-slate-800 text-sm shrink-0">{cop(f.offeredPrice)}</p>
              </div>
              <div className="flex gap-2">
                {f.status === 'ACCEPTED' && (
                  <button onClick={() => setStatus(f, 'in_progress')} disabled={busyId === f.id}
                    className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-60">
                    Iniciar ruta
                  </button>
                )}
                {(f.status === 'IN_PROGRESS' || f.status === 'ACCEPTED') && (
                  <button onClick={() => setStatus(f, 'completed')} disabled={busyId === f.id}
                    className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 disabled:opacity-60">
                    Completar y liquidar
                  </button>
                )}
                <button onClick={() => setStatus(f, 'cancelled')} disabled={busyId === f.id}
                  className="py-2 px-3 border border-slate-200 text-slate-500 rounded-lg text-xs font-semibold hover:border-red-300 hover:text-red-600 disabled:opacity-60">
                  Soltar
                </button>
              </div>
              {/* Trazabilidad en ruta: bitácora del conductor (tanqueos/paradas). */}
              <button onClick={() => void toggleTrace(f.id)}
                className="text-[11px] font-semibold text-amber-700 hover:text-amber-900">
                {traceId === f.id ? 'Ocultar trazabilidad' : 'Ver trazabilidad (tanqueos y paradas)'}
              </button>
              {traceId === f.id && (
                <div className="border-t border-slate-100 pt-2">
                  {traceLoading ? (
                    <p className="text-[11px] text-slate-400">Cargando bitácora…</p>
                  ) : !trace || trace.events.length === 0 ? (
                    <p className="text-[11px] text-slate-400">El conductor aún no registra eventos en este flete.</p>
                  ) : (
                    <>
                      <p className="text-[11px] font-semibold text-slate-600 mb-1.5">
                        Combustible total: {cop(trace.fuelTotalCop)}
                      </p>
                      <ul className="space-y-1">
                        {trace.events.map((e) => (
                          <li key={e.id} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                            <span className="font-semibold text-slate-800 shrink-0">
                              {new Date(e.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                              {' '}· {EVENT_LABEL[e.type] ?? e.type}
                            </span>
                            <span className="min-w-0 truncate">
                              {e.type === 'FUEL' && e.amountCop != null ? `${cop(e.amountCop)}` : ''}
                              {e.gallons != null ? ` · ${e.gallons} gal` : ''}
                              {e.odometerKm != null ? ` · ${e.odometerKm} km` : ''}
                              {e.note ? ` · ${e.note}` : ''}
                              {e.lat != null && e.lng != null ? (
                                <a href={`https://maps.google.com/?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer"
                                  className="text-emerald-700 hover:underline"> · ver lugar</a>
                              ) : null}
                              {e.photoUrl ? (
                                <a href={e.photoUrl.startsWith('http') ? e.photoUrl : `${HTTP_BASE}${e.photoUrl}`} target="_blank" rel="noreferrer"
                                  className="text-emerald-700 hover:underline"> · recibo</a>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {doneMine.map((f) => (
            <div key={f.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-2 opacity-80">
              <div className="min-w-0">
                <p className="font-medium text-slate-700 text-sm truncate">{f.originAddress} → {f.destAddress}</p>
                <p className="text-xs text-slate-400">Completado · neto flota {f.netEarning != null ? cop(f.netEarning) : '—'}</p>
              </div>
              <p className="font-bold text-emerald-700 text-sm shrink-0">{f.finalPrice != null ? cop(f.finalPrice) : cop(f.offeredPrice)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
