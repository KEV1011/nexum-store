'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Plus, XCircle, Loader2, Users, Bus } from 'lucide-react'
import type { OperatorApi } from './api'

// Ciudades (enum IntercityCity del backend). El motor pooled espera los
// códigos en minúscula (claves de INTERCITY_ROUTES).
const CITIES: { code: string; label: string }[] = [
  { code: 'pamplona', label: 'Pamplona' },
  { code: 'cucuta', label: 'Cúcuta' },
  { code: 'bucaramanga', label: 'Bucaramanga' },
  { code: 'chitaga', label: 'Chitagá' },
  { code: 'malaga', label: 'Málaga' },
  { code: 'ocana', label: 'Ocaña' },
  { code: 'bogota', label: 'Bogotá' },
]
const CITY_LABEL: Record<string, string> = Object.fromEntries(CITIES.map((c) => [c.code, c.label]))

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: 'Abierta', cls: 'bg-emerald-100 text-emerald-700' },
  full: { label: 'Llena', cls: 'bg-amber-100 text-amber-700' },
  departed: { label: 'En viaje', cls: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completada', cls: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-600' },
}

interface PooledTripRow {
  id: string
  tripRef: string
  driverName: string
  vehicleDescription: string
  origin: string
  destination: string
  departureTime: string
  totalSeats: number
  availableSeats: number
  farePerSeat: number
  status: string
}

interface OperatorDriverRow {
  id: string
  name: string
  phone: string
  isVerified: boolean
}

function formatCOP(v: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

/**
 * Salidas programadas de la empresa: publica horarios intermunicipales con
 * conductor afiliado, puestos y tarifa. El cliente los ve y reserva en
 * "Cupos compartidos" de la app.
 */
export default function SchedulesManager({ api }: { api: OperatorApi }) {
  const [trips, setTrips] = useState<PooledTripRow[]>([])
  const [drivers, setDrivers] = useState<OperatorDriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [driverId, setDriverId] = useState('')
  const [origin, setOrigin] = useState('pamplona')
  const [dest, setDest] = useState('cucuta')
  const [departure, setDeparture] = useState('')
  const [seats, setSeats] = useState('4')
  const [fare, setFare] = useState('22000')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([
        api<PooledTripRow[]>('/operator/pool'),
        api<OperatorDriverRow[]>('/operator/drivers'),
      ])
      setTrips(Array.isArray(t) ? t : [])
      const list = Array.isArray(d) ? d : []
      setDrivers(list)
      if (list.length > 0 && !driverId) setDriverId(list[0].id)
    } catch {
      /* errores puntuales se muestran al accionar */
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  useEffect(() => { void load() }, [load])

  async function publish() {
    setError(null)
    if (!driverId) { setError('Afiliar primero un conductor (pestaña Conductores).'); return }
    if (origin === dest) { setError('El origen y el destino deben ser diferentes.'); return }
    if (!departure) { setError('Elige fecha y hora de salida.'); return }
    setSaving(true)
    try {
      await api('/operator/pool/publish', {
        method: 'POST',
        body: JSON.stringify({
          driverId,
          origin,
          destination: dest,
          departureTime: new Date(departure).toISOString(),
          totalSeats: Number(seats),
          farePerSeat: Number(fare),
          notes: notes.trim() || undefined,
        }),
      })
      setNotes('')
      setDeparture('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar la salida.')
    } finally {
      setSaving(false)
    }
  }

  async function cancel(id: string) {
    setError(null)
    try {
      await api(`/operator/pool/${id}/cancel`, { method: 'POST' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar la salida.')
    }
  }

  const active = trips.filter((t) => t.status === 'open' || t.status === 'full' || t.status === 'departed')
  const past = trips.filter((t) => t.status === 'completed' || t.status === 'cancelled').slice(0, 10)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-4 h-4 text-emerald-600" />
        <h2 className="font-bold text-slate-900 text-sm">Salidas programadas</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Publica tus horarios intermunicipales: los pasajeros los ven y reservan puestos
        desde la app (Cupos compartidos), a nombre de tu empresa.
      </p>

      {/* Formulario */}
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Conductor (afiliado)</span>
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            {drivers.length === 0 && <option value="">— Afilia un conductor primero —</option>}
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name} · {d.phone}{d.isVerified ? '' : ' (sin verificar)'}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha y hora de salida</span>
          <input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm bg-white" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Origen</span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            {CITIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Destino</span>
          <select value={dest} onChange={(e) => setDest(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm bg-white">
            {CITIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Puestos</span>
          <input type="number" min={1} max={20} value={seats} onChange={(e) => setSeats(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Tarifa por puesto (COP)</span>
          <input type="number" min={0} step={500} value={fare} onChange={(e) => setFare(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm" />
        </label>
      </div>
      <label className="block mb-3">
        <span className="block text-[11px] font-semibold text-slate-500 mb-1">Notas (opcional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Punto de salida, equipaje, paradas…"
          className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm" />
      </label>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <button onClick={publish} disabled={saving || drivers.length === 0}
        className="inline-flex items-center gap-1.5 py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 mb-5">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Publicar salida
      </button>

      {/* Listado */}
      {loading ? (
        <p className="text-xs text-slate-400">Cargando salidas…</p>
      ) : active.length === 0 && past.length === 0 ? (
        <p className="text-xs text-slate-400">Aún no has publicado salidas.</p>
      ) : (
        <ul className="space-y-2">
          {[...active, ...past].map((t) => {
            const st = STATUS_LABEL[t.status] ?? STATUS_LABEL.open
            const cancellable = t.status === 'open' || t.status === 'full'
            return (
              <li key={t.id} className="flex items-center gap-3 border border-slate-100 rounded-xl px-3 py-2.5">
                <Bus className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {CITY_LABEL[t.origin] ?? t.origin} → {CITY_LABEL[t.destination] ?? t.destination}
                    <span className="text-slate-400 font-normal"> · {formatWhen(t.departureTime)}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {t.driverName} · {t.vehicleDescription} · {formatCOP(t.farePerSeat)}/puesto · ref {t.tripRef}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 shrink-0">
                  <Users className="w-3.5 h-3.5" />{t.availableSeats}/{t.totalSeats}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                {cancellable && (
                  <button onClick={() => cancel(t.id)} title="Cancelar salida"
                    className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
