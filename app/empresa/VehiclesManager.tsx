'use client'

import { useCallback, useEffect, useState } from 'react'
import { Car, Plus, Loader2 } from 'lucide-react'
import type { OperatorApi } from './api'

interface OperatorVehicle {
  id: string
  driverId: string
  type: string // PARTICULAR | TAXI | MOTO
  brand: string
  model: string
  year: number
  plate: string
  color: string
  isActive: boolean
  internalCode: string | null
  operationCardNo: string | null
}

interface DriverOption {
  id: string
  name: string
  phone: string
}

const VEHICLE_TYPES: { code: string; label: string }[] = [
  { code: 'TAXI', label: 'Taxi' },
  { code: 'PARTICULAR', label: 'Particular' },
  { code: 'MOTO', label: 'Moto' },
]
const TYPE_LABEL: Record<string, string> = Object.fromEntries(VEHICLE_TYPES.map((t) => [t.code, t.label]))

const currentYear = new Date().getFullYear()

export default function VehiclesManager({ api, refreshKey }: { api: OperatorApi; refreshKey?: number }) {
  const [vehicles, setVehicles] = useState<OperatorVehicle[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Campos del formulario
  const [driverId, setDriverId] = useState('')
  const [type, setType] = useState('TAXI')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState(String(currentYear))
  const [plate, setPlate] = useState('')
  const [color, setColor] = useState('')
  const [internalCode, setInternalCode] = useState('')
  const [operationCardNo, setOperationCardNo] = useState('')

  const load = useCallback(async () => {
    try {
      const [vs, ds] = await Promise.all([
        api<OperatorVehicle[]>('/operator/vehicles'),
        api<DriverOption[]>('/operator/drivers'),
      ])
      setVehicles(Array.isArray(vs) ? vs : [])
      setDrivers(Array.isArray(ds) ? ds : [])
    } catch {
      /* el error puntual se muestra al accionar */
    } finally {
      setLoading(false)
    }
  }, [api])

  // refreshKey permite al padre forzar recarga (p. ej. tras afiliar un conductor).
  useEffect(() => { void load() }, [load, refreshKey])

  const driverName = useCallback(
    (id: string) => drivers.find((d) => d.id === id)?.name ?? 'Conductor',
    [drivers],
  )

  async function addVehicle() {
    setError(null)
    if (!driverId) { setError('Selecciona el conductor responsable del vehículo.'); return }
    const yearNum = Number(year)
    if (!brand.trim() || !model.trim() || !plate.trim() || !color.trim()) {
      setError('Marca, modelo, placa y color son obligatorios.')
      return
    }
    if (!Number.isInteger(yearNum) || yearNum < 1990 || yearNum > currentYear + 1) {
      setError(`El año debe estar entre 1990 y ${currentYear + 1}.`)
      return
    }
    setSaving(true)
    try {
      await api('/operator/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          driverId,
          type,
          brand: brand.trim(),
          model: model.trim(),
          year: yearNum,
          plate: plate.trim().toUpperCase(),
          color: color.trim(),
          internalCode: internalCode.trim() || undefined,
          operationCardNo: operationCardNo.trim() || undefined,
        }),
      })
      setBrand(''); setModel(''); setPlate(''); setColor(''); setInternalCode(''); setOperationCardNo('')
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el vehículo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <Car className="w-4 h-4 text-emerald-600" /> Vehículos
          <span className="text-slate-400 font-normal">({vehicles.length})</span>
        </h2>
        <button
          onClick={() => { setShowForm((v) => !v); setError(null) }}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {showForm ? 'Cerrar' : 'Registrar vehículo'}
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Registra los vehículos de tu flota asignando su conductor responsable (debe estar afiliado).
      </p>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Conductor responsable</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
              >
                <option value="">Selecciona un conductor…</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>)}
              </select>
            </div>
            <Field label="Tipo">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
              >
                {VEHICLE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Field>
            <Input label="Placa" value={plate} onChange={setPlate} placeholder="ABC123" />
            <Input label="Marca" value={brand} onChange={setBrand} placeholder="Chevrolet" />
            <Input label="Modelo" value={model} onChange={setModel} placeholder="Spark GT" />
            <Input label="Año" value={year} onChange={setYear} placeholder={String(currentYear)} numeric />
            <Input label="Color" value={color} onChange={setColor} placeholder="Blanco" />
            <Input label="Código interno (opcional)" value={internalCode} onChange={setInternalCode} placeholder="MOVIL-12" />
            <Input label="Tarjeta de operación (opcional)" value={operationCardNo} onChange={setOperationCardNo} placeholder="N.º tarjeta" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={addVehicle}
            disabled={saving}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar vehículo
          </button>
        </div>
      )}
      {!showForm && error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Cargando vehículos…</div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Car className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aún no has registrado vehículos.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {vehicles.map((v) => (
            <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 text-sm truncate">
                  <span className="tracking-widest">{v.plate}</span>
                  <span className="text-slate-400 font-normal"> · {v.brand} {v.model} {v.year}</span>
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {TYPE_LABEL[v.type] ?? v.type} · {v.color}
                  {v.internalCode ? ` · ${v.internalCode}` : ''} · {driverName(v.driverId)}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${v.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {v.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Input({ label, value, onChange, placeholder, numeric }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean
}) {
  return (
    <Field label={label}>
      <input
        value={value}
        onChange={(e) => onChange(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'numeric' : undefined}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
      />
    </Field>
  )
}
