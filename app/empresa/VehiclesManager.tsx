'use client'

import { useCallback, useEffect, useState } from 'react'
import { Car, Plus, Loader2, Pencil, Trash2, Power } from 'lucide-react'
import type { OperatorApi } from './api'

interface OperatorVehicle {
  id: string
  driverId: string
  type: string // PARTICULAR | TAXI | MOTO | TURBO | CAMION | MULA
  brand: string
  model: string
  year: number
  plate: string
  color: string
  isActive: boolean
  internalCode: string | null
  operationCardNo: string | null
  capacityKg: number | null
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
  { code: 'TURBO', label: 'Turbo (carga)' },
  { code: 'CAMION', label: 'Camión (carga)' },
  { code: 'MULA', label: 'Mula (carga)' },
]
const TYPE_LABEL: Record<string, string> = Object.fromEntries(VEHICLE_TYPES.map((t) => [t.code, t.label]))
// Tipos de carga: para ellos se pide la capacidad en kg.
const CARGO_TYPES = new Set(['TURBO', 'CAMION', 'MULA'])

const currentYear = new Date().getFullYear()

const EMPTY = {
  driverId: '', type: 'TAXI', brand: '', model: '', year: String(currentYear),
  plate: '', color: '', internalCode: '', operationCardNo: '', capacityKg: '',
}

export default function VehiclesManager({ api, refreshKey }: { api: OperatorApi; refreshKey?: number }) {
  const [vehicles, setVehicles] = useState<OperatorVehicle[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Campos del formulario (compartidos por alta y edición).
  const [f, setF] = useState({ ...EMPTY })
  const set = (patch: Partial<typeof EMPTY>) => setF((prev) => ({ ...prev, ...patch }))

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

  useEffect(() => { void load() }, [load, refreshKey])

  const driverName = useCallback(
    (id: string) => drivers.find((d) => d.id === id)?.name ?? 'Conductor',
    [drivers],
  )

  function openCreate() {
    setEditingId(null)
    setF({ ...EMPTY })
    setError(null)
    setShowForm(true)
  }

  function openEdit(v: OperatorVehicle) {
    setEditingId(v.id)
    setF({
      driverId: v.driverId,
      type: v.type,
      brand: v.brand,
      model: v.model,
      year: String(v.year),
      plate: v.plate,
      color: v.color,
      internalCode: v.internalCode ?? '',
      operationCardNo: v.operationCardNo ?? '',
      capacityKg: v.capacityKg ? String(v.capacityKg) : '',
    })
    setError(null)
    setShowForm(true)
  }

  async function submit() {
    setError(null)
    if (!f.driverId) { setError('Selecciona el conductor responsable del vehículo.'); return }
    const yearNum = Number(f.year)
    if (!f.brand.trim() || !f.model.trim() || !f.plate.trim() || !f.color.trim()) {
      setError('Marca, modelo, placa y color son obligatorios.')
      return
    }
    if (!Number.isInteger(yearNum) || yearNum < 1990 || yearNum > currentYear + 1) {
      setError(`El año debe estar entre 1990 y ${currentYear + 1}.`)
      return
    }
    setSaving(true)
    try {
      const body = JSON.stringify({
        driverId: f.driverId,
        type: f.type,
        brand: f.brand.trim(),
        model: f.model.trim(),
        year: yearNum,
        plate: f.plate.trim().toUpperCase(),
        color: f.color.trim(),
        internalCode: f.internalCode.trim() || undefined,
        operationCardNo: f.operationCardNo.trim() || undefined,
        capacityKg: CARGO_TYPES.has(f.type) && Number(f.capacityKg) > 0 ? Number(f.capacityKg) : undefined,
      })
      if (editingId) {
        await api(`/operator/vehicles/${editingId}`, { method: 'PATCH', body })
      } else {
        await api('/operator/vehicles', { method: 'POST', body })
      }
      setF({ ...EMPTY })
      setShowForm(false)
      setEditingId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el vehículo.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(v: OperatorVehicle) {
    setBusyId(v.id)
    setError(null)
    try {
      await api(`/operator/vehicles/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !v.isActive }),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(v: OperatorVehicle) {
    if (!confirm(`¿Eliminar el vehículo ${v.plate} de la flota?`)) return
    setBusyId(v.id)
    setError(null)
    try {
      await api(`/operator/vehicles/${v.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el vehículo.')
    } finally {
      setBusyId(null)
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
          onClick={() => (showForm ? (setShowForm(false), setEditingId(null)) : openCreate())}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {showForm ? 'Cerrar' : 'Registrar vehículo'}
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Registra, edita o da de baja los vehículos de tu flota y asígnales su conductor responsable (afiliado).
      </p>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-3 space-y-3">
          {editingId && (
            <p className="text-xs font-semibold text-emerald-700">Editando vehículo</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Conductor responsable</label>
              <select
                value={f.driverId}
                onChange={(e) => set({ driverId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
              >
                <option value="">Selecciona un conductor…</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>)}
              </select>
            </div>
            <Field label="Tipo">
              <select
                value={f.type}
                onChange={(e) => set({ type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
              >
                {VEHICLE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </Field>
            <Input label="Placa" value={f.plate} onChange={(v) => set({ plate: v })} placeholder="ABC123" />
            <Input label="Marca" value={f.brand} onChange={(v) => set({ brand: v })} placeholder="Chevrolet" />
            <Input label="Modelo" value={f.model} onChange={(v) => set({ model: v })} placeholder="Spark GT" />
            <Input label="Año" value={f.year} onChange={(v) => set({ year: v })} placeholder={String(currentYear)} numeric />
            <Input label="Color" value={f.color} onChange={(v) => set({ color: v })} placeholder="Blanco" />
            <Input label="Código interno (opcional)" value={f.internalCode} onChange={(v) => set({ internalCode: v })} placeholder="MOVIL-12" />
            <Input label="Tarjeta de operación (opcional)" value={f.operationCardNo} onChange={(v) => set({ operationCardNo: v })} placeholder="N.º tarjeta" />
            {CARGO_TYPES.has(f.type) && (
              <div className="col-span-2">
                <Input label="Capacidad de carga (kg)" value={f.capacityKg} onChange={(v) => set({ capacityKg: v })} placeholder="Ej: 8000" numeric />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={submit}
            disabled={saving}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editingId ? 'Guardar cambios' : 'Guardar vehículo'}
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
            <div key={v.id} className={`bg-white border rounded-xl p-3.5 flex items-center gap-3 ${
              v.isActive ? 'border-slate-200' : 'border-slate-200 opacity-70'
            }`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 text-sm truncate">
                  <span className="tracking-widest">{v.plate}</span>
                  <span className="text-slate-400 font-normal"> · {v.brand} {v.model} {v.year}</span>
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {TYPE_LABEL[v.type] ?? v.type} · {v.color}
                  {v.capacityKg ? ` · ${v.capacityKg.toLocaleString('es-CO')} kg` : ''}
                  {v.internalCode ? ` · ${v.internalCode}` : ''} · {driverName(v.driverId)}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${v.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {v.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => toggleActive(v)} disabled={busyId === v.id}
                  title={v.isActive ? 'Desactivar' : 'Activar'}
                  className={`p-1.5 rounded-lg transition-colors ${v.isActive ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                  {busyId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                </button>
                <button onClick={() => openEdit(v)} title="Editar"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => remove(v)} disabled={busyId === v.id} title="Eliminar"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
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
