'use client'

import { useCallback, useEffect, useState } from 'react'
import { Truck, Plus, X } from 'lucide-react'
import type { OperatorApi } from './api'

// Viajes de carga: un camión sale con mercancía de VARIOS clientes, cada uno
// con su referencia, su destino y su fecha de entrega. Cada línea del viaje es
// un remito, así que el mismo documento sirve para la bodega, para el conductor
// y para la cuenta de cobro.

export interface TripLine {
  id: string
  code: string
  reference?: string
  clientName: string
  clientCity?: string
  totalItems: number
  totalMeasure: number
  deliveredOn?: string
  status: string
}

export interface CargoTrip {
  id: string
  number: number
  originCity: string
  originPlace?: string
  weightKg?: number
  freightAmount?: number
  isUrban: boolean
  driverId?: string
  vehicleId?: string
  driverName?: string
  vehiclePlate?: string
  destCity?: string
  status: string
  scheduledAt?: string
  startedAt?: string
  promisedAt?: string
  dispatchedAt?: string
  completedAt?: string
  cobroId?: string
  totalItems: number
  totalMeasure: number
  lines: TripLine[]
}

interface DriverOption { id: string; name: string }
interface VehicleOption { id: string; plate: string; type: string }

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', DISPATCHED: 'Despachado', COMPLETED: 'Completado', CANCELLED: 'Cancelado',
}
const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  DISPATCHED: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

function cop(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}

function num(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

function fecha(iso?: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' }).format(new Date(iso))
}

export default function CargoTripsManager({ api }: { api: OperatorApi }) {
  const [trips, setTrips] = useState<CargoTrip[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [ts, ds, vs] = await Promise.all([
        api<CargoTrip[]>('/operator/cargo-trips'),
        api<DriverOption[]>('/operator/drivers').catch(() => []),
        api<VehicleOption[]>('/operator/vehicles').catch(() => []),
      ])
      setTrips(Array.isArray(ts) ? ts : [])
      setDrivers(Array.isArray(ds) ? ds : [])
      setVehicles(Array.isArray(vs) ? vs : [])
    } catch {
      /* el error puntual se muestra al accionar */
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  async function accion(fn: () => Promise<unknown>) {
    setError(null)
    try { await fn(); await load() } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-2">
        <Truck className="w-4 h-4 text-emerald-600" /> Viajes de carga
        <span className="text-slate-400 font-normal">({trips.length})</span>
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Un camión puede llevar mercancía de varios clientes. Cada línea es un remito
        con su referencia, destinatario y destino; el peso es del viaje completo.
      </p>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={() => setCreando((v) => !v)}
        className="inline-flex items-center gap-1.5 py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors mb-4"
      >
        <Plus className="w-4 h-4" /> {creando ? 'Cerrar' : 'Nuevo viaje'}
      </button>

      {creando && (
        <NuevoViaje
          drivers={drivers}
          vehicles={vehicles}
          onCrear={async (dto) => {
            await accion(() => api('/operator/cargo-trips', { method: 'POST', body: JSON.stringify(dto) }))
            setCreando(false)
          }}
        />
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
          Cargando viajes…
        </div>
      ) : trips.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Truck className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aún no has registrado viajes.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {trips.map((t) => (
            <FilaViaje
              key={t.id}
              t={t}
              abierto={abierto === t.id}
              onToggle={() => setAbierto(abierto === t.id ? null : t.id)}
              onAccion={accion}
              api={api}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function NuevoViaje({
  drivers, vehicles, onCrear,
}: {
  drivers: DriverOption[]
  vehicles: VehicleOption[]
  onCrear: (dto: Record<string, unknown>) => Promise<void>
}) {
  const [originCity, setOriginCity] = useState('')
  const [originPlace, setOriginPlace] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [freightAmount, setFreightAmount] = useState('')
  const [isUrban, setIsUrban] = useState(false)
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [guardando, setGuardando] = useState(false)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-4 space-y-2.5">
      <div className="grid sm:grid-cols-2 gap-2.5">
        <Campo label="Ciudad de origen *" value={originCity} onChange={setOriginCity} placeholder="BOGOTA" />
        <Campo label="Bodega / punto de salida" value={originPlace} onChange={setOriginPlace} placeholder="MADRID" />
        <Campo label="Peso total del camión (kg)" value={weightKg} onChange={setWeightKg} placeholder="11000" tipo="number" />
        <Campo label="Valor del flete (COP)" value={freightAmount} onChange={setFreightAmount} placeholder="2500000" tipo="number" />
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Conductor</label>
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500">
            <option value="">Sin asignar</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Vehículo</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500">
            <option value="">Sin asignar</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.type}</option>)}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={isUrban} onChange={(e) => setIsUrban(e.target.checked)} />
        Acarreo urbano (se cobra el viaje, sin listar rollos ni metros)
      </label>

      <button
        disabled={guardando || !originCity.trim()}
        onClick={async () => {
          setGuardando(true)
          try {
            await onCrear({
              originCity: originCity.trim(),
              originPlace: originPlace.trim() || undefined,
              weightKg: weightKg ? Number(weightKg) : undefined,
              freightAmount: freightAmount ? Number(freightAmount) : undefined,
              isUrban,
              driverId: driverId || undefined,
              vehicleId: vehicleId || undefined,
            })
          } finally { setGuardando(false) }
        }}
        className="py-2 px-4 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
      >
        {guardando ? 'Creando…' : 'Crear viaje'}
      </button>
    </div>
  )
}

function FilaViaje({
  t, abierto, onToggle, onAccion, api,
}: {
  t: CargoTrip
  abierto: boolean
  onToggle: () => void
  onAccion: (fn: () => Promise<unknown>) => Promise<void>
  api: OperatorApi
}) {
  const origen = [t.originCity, t.originPlace].filter(Boolean).join(' ')
  const facturado = !!t.cobroId

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm">
            Viaje {String(t.number).padStart(2, '0')} · {origen}
            {t.isUrban && <span className="ml-1.5 text-[11px] text-slate-400">urbano</span>}
          </p>
          <p className="text-[11px] text-slate-500">
            {t.lines.length} {t.lines.length === 1 ? 'línea' : 'líneas'} ·{' '}
            {num(t.totalItems)} bultos · {num(t.totalMeasure)} medida
            {t.weightKg ? ` · ${num(t.weightKg)} kg` : ''}
            {t.freightAmount ? ` · ${cop(t.freightAmount)}` : ''}
            {t.driverName ? ` · ${t.driverName}` : ''}
            {t.vehiclePlate ? ` (${t.vehiclePlate})` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {facturado && (
            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold">
              Facturado
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_TONE[t.status] ?? 'bg-slate-100 text-slate-600'}`}>
            {STATUS_LABEL[t.status] ?? t.status}
          </span>
        </div>
      </div>

      {t.lines.length > 0 && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          {t.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600 truncate">
                <span className="font-semibold text-slate-800">{l.reference || l.code}</span>
                {' · '}{num(l.totalItems)} × {num(l.totalMeasure)}
                {' · '}{l.clientName}{l.clientCity ? ` → ${l.clientCity}` : ''}
                {l.deliveredOn ? ` · ${fecha(l.deliveredOn)}` : ''}
              </span>
              {!facturado && t.status === 'DRAFT' && (
                <button
                  title="Quitar del viaje"
                  onClick={() => void onAccion(() => api(`/operator/cargo-trips/${t.id}/lines/${l.id}`, { method: 'DELETE' }))}
                  className="text-slate-300 hover:text-red-600 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!facturado && t.status === 'DRAFT' && (
          <>
            <button onClick={onToggle} className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900">
              {abierto ? 'Cerrar' : 'Añadir línea'}
            </button>
            <button
              onClick={() => void onAccion(() => api(`/operator/cargo-trips/${t.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'dispatched' }) }))}
              className="text-[11px] font-semibold text-amber-700 hover:text-amber-900"
            >
              Despachar
            </button>
          </>
        )}
        {!facturado && (t.status === 'DRAFT' || t.status === 'DISPATCHED') && (
          <button
            onClick={() => void onAccion(() => api(`/operator/cargo-trips/${t.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'completed' }) }))}
            className="text-[11px] font-semibold text-slate-700 hover:text-slate-900"
          >
            Marcar entregado
          </button>
        )}
      </div>

      {(t.status === 'DISPATCHED' || t.status === 'COMPLETED') && (
        <a
          href={`/empresa/viaje/${t.id}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[11px] font-semibold text-slate-700 hover:text-slate-900 underline"
        >
          Ver informe del viaje (recorrido, gastos, tiempos y cobro)
        </a>
      )}

      {abierto && (
        <NuevaLinea
          onAgregar={async (dto) => {
            await onAccion(() => api(`/operator/cargo-trips/${t.id}/lines`, { method: 'POST', body: JSON.stringify(dto) }))
          }}
        />
      )}
    </div>
  )
}

/**
 * Alta de una línea. Las medidas se escriben seguidas —como se cantan en
 * bodega— y se numeran y suman solas; es el mismo patrón del remito.
 */
function NuevaLinea({ onAgregar }: { onAgregar: (dto: Record<string, unknown>) => Promise<void> }) {
  const [reference, setReference] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientCity, setClientCity] = useState('')
  const [deliveredOn, setDeliveredOn] = useState('')
  const [medidas, setMedidas] = useState('')
  const [unitLabel, setUnitLabel] = useState('rollo')
  const [measureLabel, setMeasureLabel] = useState('metros')
  const [guardando, setGuardando] = useState(false)

  // Acepta saltos de línea, comas y espacios: se teclea al dictado.
  const items = medidas
    .split(/[\n,;\s]+/)
    .map((x) => Number(x.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
  const total = items.reduce((s, n) => s + n, 0)

  return (
    <div className="border-t border-slate-100 pt-2.5 space-y-2.5">
      <div className="grid sm:grid-cols-2 gap-2.5">
        <Campo label="Referencia" value={reference} onChange={setReference} placeholder="706001 BLK BLK" />
        <Campo label="Destinatario *" value={clientName} onChange={setClientName} placeholder="PERALTEX" />
        <Campo label="Destino" value={clientCity} onChange={setClientCity} placeholder="BOGOTA" />
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha de entrega</label>
          <input type="date" value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
        <Campo label="Unidad" value={unitLabel} onChange={setUnitLabel} placeholder="rollo" />
        <Campo label="Medida" value={measureLabel} onChange={setMeasureLabel} placeholder="metros" />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
          Medidas, una por bulto
        </label>
        <textarea
          value={medidas}
          onChange={(e) => setMedidas(e.target.value)}
          rows={3}
          placeholder="113.1  90  104.5  98 …"
          className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500"
        />
        <p className="text-[11px] text-slate-500 mt-1">
          {items.length} {unitLabel}{items.length === 1 ? '' : 's'} · {num(total)} {measureLabel}
        </p>
      </div>

      <button
        disabled={guardando || !clientName.trim() || items.length === 0}
        onClick={async () => {
          setGuardando(true)
          try {
            await onAgregar({
              reference: reference.trim() || undefined,
              clientName: clientName.trim(),
              clientCity: clientCity.trim() || undefined,
              deliveredOn: deliveredOn ? new Date(`${deliveredOn}T12:00:00`).toISOString() : undefined,
              unitLabel: unitLabel.trim() || 'rollo',
              measureLabel: measureLabel.trim() || 'metros',
              items: items.map((measure) => ({ measure })),
            })
            setReference(''); setClientName(''); setClientCity(''); setMedidas(''); setDeliveredOn('')
          } finally { setGuardando(false) }
        }}
        className="py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        {guardando ? 'Añadiendo…' : 'Añadir línea'}
      </button>
    </div>
  )
}

function Campo({
  label, value, onChange, placeholder, tipo = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; tipo?: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      <input
        type={tipo}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500"
      />
    </div>
  )
}
