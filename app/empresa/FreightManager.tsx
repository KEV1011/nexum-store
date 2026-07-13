'use client'

import { useCallback, useEffect, useState } from 'react'
import { Truck, Loader2, PackageSearch } from 'lucide-react'
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

export default function FreightManager({ api }: { api: OperatorApi }) {
  const [available, setAvailable] = useState<Freight[]>([])
  const [mine, setMine] = useState<Freight[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Selección de conductor/vehículo por flete disponible.
  const [assign, setAssign] = useState<Record<string, { driverId: string; vehicleId: string }>>({})

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
