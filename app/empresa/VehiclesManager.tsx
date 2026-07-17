'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Car, Plus, Loader2, Pencil, Trash2, Power, Camera, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import type { OperatorApi } from './api'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://nexum-api-trxr.onrender.com')

function resolveImg(url?: string | null): string | undefined {
  if (!url) return undefined
  return url.startsWith('http') ? url : `${BACKEND_URL}${url}`
}

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
  photoUrl: string | null
  soatExpiry: string | null
  rtmExpiry: string | null
  operationCardExpiry: string | null
}

// Estado de un documento según su fecha de vencimiento.
type DocState = 'ok' | 'soon' | 'expired' | 'none'
function docState(iso: string | null): DocState {
  if (!iso) return 'none'
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'soon'
  return 'ok'
}
const DOC_STYLE: Record<DocState, { label: string; cls: string }> = {
  ok: { label: 'Vigente', cls: 'bg-emerald-100 text-emerald-700' },
  soon: { label: 'Por vencer', cls: 'bg-amber-100 text-amber-700' },
  expired: { label: 'Vencido', cls: 'bg-rose-100 text-rose-700' },
  none: { label: 'Sin registrar', cls: 'bg-slate-100 text-slate-500' },
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
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
  soatExpiry: '', rtmExpiry: '', operationCardExpiry: '',
}

export default function VehiclesManager({ api, token, refreshKey }: { api: OperatorApi; token: string; refreshKey?: number }) {
  const [vehicles, setVehicles] = useState<OperatorVehicle[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const [photoTarget, setPhotoTarget] = useState<string | null>(null)

  // Campos del formulario (compartidos por alta y edición).
  const [f, setF] = useState({ ...EMPTY })
  const set = (patch: Partial<typeof EMPTY>) => setF((prev) => ({ ...prev, ...patch }))

  async function uploadPhoto(vehicleId: string, file: File) {
    setBusyId(vehicleId)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BACKEND_URL}/operator/vehicles/${vehicleId}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'No se pudo subir la foto.')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setBusyId(null)
    }
  }

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

  // Resumen de cumplimiento: vehículos con algún documento vencido o por vencer.
  const expiredCount = vehicles.filter((v) =>
    [v.soatExpiry, v.rtmExpiry, v.operationCardExpiry].some((d) => docState(d) === 'expired'),
  ).length
  const soonCount = vehicles.filter((v) =>
    [v.soatExpiry, v.rtmExpiry, v.operationCardExpiry].some((d) => docState(d) === 'soon') &&
    ![v.soatExpiry, v.rtmExpiry, v.operationCardExpiry].some((d) => docState(d) === 'expired'),
  ).length
  const complianceAlert =
    expiredCount > 0 || soonCount > 0
      ? [
          expiredCount > 0 ? `${expiredCount} con documentos vencidos` : null,
          soonCount > 0 ? `${soonCount} por vencer (≤30 días)` : null,
        ].filter(Boolean).join(' · ')
      : null

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
      soatExpiry: v.soatExpiry ? v.soatExpiry.slice(0, 10) : '',
      rtmExpiry: v.rtmExpiry ? v.rtmExpiry.slice(0, 10) : '',
      operationCardExpiry: v.operationCardExpiry ? v.operationCardExpiry.slice(0, 10) : '',
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
        // En edición mandamos '' → null (limpia la fecha); en alta, '' → undefined.
        soatExpiry: f.soatExpiry || (editingId ? null : undefined),
        rtmExpiry: f.rtmExpiry || (editingId ? null : undefined),
        operationCardExpiry: f.operationCardExpiry || (editingId ? null : undefined),
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

          {/* Documentos: vencimientos para el control de cumplimiento */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Vencimiento de documentos</p>
            <div className="grid grid-cols-3 gap-2">
              <DateField label="SOAT" value={f.soatExpiry} onChange={(v) => set({ soatExpiry: v })} />
              <DateField label="Tecnomecánica" value={f.rtmExpiry} onChange={(v) => set({ rtmExpiry: v })} />
              <DateField label="T. operación" value={f.operationCardExpiry} onChange={(v) => set({ operationCardExpiry: v })} />
            </div>
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
          {complianceAlert && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-amber-800 font-medium">{complianceAlert}</span>
            </div>
          )}
          {vehicles.map((v) => {
            const docs: { label: string; iso: string | null }[] = [
              { label: 'SOAT', iso: v.soatExpiry },
              { label: 'Tecnomec.', iso: v.rtmExpiry },
              { label: 'T. oper.', iso: v.operationCardExpiry },
            ]
            const photo = resolveImg(v.photoUrl)
            return (
              <div key={v.id} className={`bg-white border rounded-xl p-3.5 ${
                v.isActive ? 'border-slate-200' : 'border-slate-200 opacity-70'
              }`}>
                <div className="flex items-center gap-3">
                  {/* Foto del vehículo (tocar para subir/cambiar) */}
                  <button
                    onClick={() => { setPhotoTarget(v.id); photoRef.current?.click() }}
                    disabled={busyId === v.id}
                    title={photo ? 'Cambiar foto' : 'Subir foto'}
                    className="relative w-14 h-14 shrink-0 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center group"
                  >
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={v.plate} className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-300" />
                    )}
                    <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-4 h-4 text-white" />
                    </span>
                  </button>
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

                {/* Cumplimiento: estado de cada documento */}
                <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100">
                  {docs.map((doc) => {
                    const st = docState(doc.iso)
                    const style = DOC_STYLE[st]
                    const icon = st === 'ok' ? ShieldCheck : st === 'expired' ? ShieldX : st === 'soon' ? ShieldAlert : null
                    const Icon = icon
                    return (
                      <span key={doc.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${style.cls}`} title={doc.iso ? `Vence ${fmtDate(doc.iso)}` : 'Sin fecha registrada'}>
                        {Icon && <Icon className="w-3 h-3" />}
                        {doc.label}: {st === 'none' ? 'Sin registrar' : `${style.label}${doc.iso ? ` · ${fmtDate(doc.iso)}` : ''}`}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Input oculto para subir la foto del vehículo enfocado */}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && photoTarget) void uploadPhoto(photoTarget, file)
          e.target.value = ''
          setPhotoTarget(null)
        }}
      />
    </section>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-2 rounded-lg border border-slate-200 text-xs text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
      />
    </Field>
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
