'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardList, Plus, Send, Printer, XCircle, Loader2, AlertTriangle, CheckCircle2, Pencil,
} from 'lucide-react'
import type { OperatorApi } from './api'

/**
 * Remitos de salida de mercancía — reemplazo del formato en papel.
 *
 * La bodega escribía a mano 17 renglones y sumaba el total con calculadora.
 * Aquí la suma es automática (que es donde se colaban los errores) y, sobre
 * todo, la entrega se concilia: el papel solo decía "recibido a satisfacción".
 */

export interface ManifestItem {
  id?: string
  position: number
  measure: number
  code?: string
  note?: string
  receivedMeasure?: number
  status?: 'PENDING' | 'OK' | 'SHORT' | 'MISSING' | 'DAMAGED'
  receivedNote?: string
}

export interface Manifest {
  id: string
  code: string
  reference?: string
  warehouse?: string
  clientName: string
  clientAddress?: string
  clientCity?: string
  driverName?: string
  driverIdNumber?: string
  vehiclePlate?: string
  unitLabel: string
  measureLabel: string
  status: 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED'
  totalItems: number
  totalMeasure: number
  receivedMeasure?: number
  discrepancyCount: number
  receivedByName?: string
  receivedByIdNumber?: string
  receivedAt?: string
  authorizedBy?: string
  notes?: string
  createdAt: string
  dispatchedAt?: string
  items: ManifestItem[]
}

interface DriverRow { id: string; name: string }
interface VehicleRow { id: string; plate: string; brand?: string; model?: string }

const ESTADO: Record<Manifest['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'Borrador', cls: 'bg-slate-100 text-slate-600' },
  DISPATCHED: { label: 'En ruta', cls: 'bg-amber-100 text-amber-700' },
  RECEIVED: { label: 'Entregado', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Anulado', cls: 'bg-red-100 text-red-700' },
}

const ITEM_ESTADO: Record<string, { label: string; cls: string }> = {
  OK: { label: 'Conforme', cls: 'text-emerald-700' },
  SHORT: { label: 'Faltó medida', cls: 'text-amber-700' },
  MISSING: { label: 'No llegó', cls: 'text-red-700' },
  DAMAGED: { label: 'Averiado', cls: 'text-red-700' },
  PENDING: { label: 'Sin conciliar', cls: 'text-slate-400' },
}

function fmt(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

/**
 * Las medidas se escriben seguidas, como se cantan en bodega con el bulto en la
 * mano: separadas por espacios, saltos de línea o puntos y comas.
 *
 * La coma entre dígitos es DECIMAL, no separador. Antes se partía por comas, así
 * que quien escribía "124,5" —que es como se escribe un decimal en Colombia—
 * creaba dos bultos, uno de 124 y otro de 5, y el remito salía de bodega con dos
 * renglones de más sin que nadie lo notara.
 *
 * Lo que no se entiende se devuelve aparte en vez de descartarse en silencio: un
 * bulto que desaparece del remito es justo el error que este formato existe para
 * evitar.
 */
function parsearMedidas(texto: string): { medidas: number[]; ignorados: string[] } {
  const medidas: number[] = []
  const ignorados: string[] = []
  const normalizado = texto.replace(/(\d),(\d)/g, '$1.$2')
  for (const t of normalizado.split(/[\s,;]+/)) {
    if (!t) continue
    const n = Number(t)
    if (Number.isFinite(n) && n > 0) medidas.push(n)
    else ignorados.push(t)
  }
  return { medidas, ignorados }
}

export default function ManifestsManager({ api }: { api: OperatorApi }) {
  const [manifests, setManifests] = useState<Manifest[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [ms, ds, vs] = await Promise.all([
        api<Manifest[]>('/operator/manifests'),
        api<DriverRow[]>('/operator/drivers').catch(() => []),
        api<VehicleRow[]>('/operator/vehicles').catch(() => []),
      ])
      setManifests(Array.isArray(ms) ? ms : [])
      setDrivers(Array.isArray(ds) ? ds : [])
      setVehicles(Array.isArray(vs) ? vs : [])
    } catch {
      /* el error puntual se muestra al accionar */
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-emerald-600" /> Remitos de salida
        <span className="text-slate-400 font-normal">({manifests.length})</span>
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Cada remito lista la mercancía bulto por bulto. El conductor la concilia al
        entregar, así que un faltante queda registrado con evidencia en el momento —
        no semanas después, en el reclamo.
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
        <Plus className="w-4 h-4" /> {creando ? 'Cerrar' : 'Nuevo remito'}
      </button>

      {creando && (
        <NuevoRemito
          api={api}
          onCreado={() => { setCreando(false); void load() }}
          onError={setError}
        />
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
          Cargando remitos…
        </div>
      ) : manifests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <ClipboardList className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aún no has creado remitos.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {manifests.map((m) => (
            <FilaRemito
              key={m.id}
              m={m}
              api={api}
              drivers={drivers}
              vehicles={vehicles}
              abierto={abierto === m.id}
              onToggle={() => setAbierto(abierto === m.id ? null : m.id)}
              onCambio={load}
              onError={setError}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Alta ──────────────────────────────────────────────────────────────────────

function NuevoRemito({
  api, onCreado, onError,
}: {
  api: OperatorApi
  onCreado: () => void
  onError: (e: string | null) => void
}) {
  const [clientName, setClientName] = useState('')
  const [clientCity, setClientCity] = useState('')
  const [reference, setReference] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [unitLabel, setUnitLabel] = useState('rollo')
  const [measureLabel, setMeasureLabel] = useState('metros')
  const [authorizedBy, setAuthorizedBy] = useState('')
  // Las medidas se escriben seguidas, una por línea o separadas por espacios:
  // es como se cuenta en bodega, con el bulto en la mano.
  const [medidas, setMedidas] = useState('')
  const [saving, setSaving] = useState(false)

  const { medidas: items, ignorados } = useMemo(() => parsearMedidas(medidas), [medidas])
  const total = items.reduce((s, n) => s + n, 0)

  async function crear() {
    onError(null)
    if (!clientName.trim()) { onError('Indica a quién va dirigida la mercancía.'); return }
    if (items.length === 0) { onError('Escribe la medida de al menos un bulto.'); return }
    setSaving(true)
    try {
      await api('/operator/manifests', {
        method: 'POST',
        body: JSON.stringify({
          clientName, clientCity, reference, warehouse, unitLabel, measureLabel,
          authorizedBy,
          items: items.map((measure) => ({ measure })),
        }),
      })
      onCreado()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo crear el remito.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo label="Cliente / destinatario" value={clientName} onChange={setClientName} />
        <Campo label="Ciudad" value={clientCity} onChange={setClientCity} />
        <Campo label="Referencia del lote" value={reference} onChange={setReference} />
        <Campo label="Bodega de salida" value={warehouse} onChange={setWarehouse} />
        <Campo label="Cada bulto es un…" value={unitLabel} onChange={setUnitLabel} />
        <Campo label="Se mide en" value={measureLabel} onChange={setMeasureLabel} />
        <Campo label="Autoriza" value={authorizedBy} onChange={setAuthorizedBy} />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
          Medida de cada {unitLabel} ({measureLabel})
        </label>
        <textarea
          value={medidas}
          onChange={(e) => setMedidas(e.target.value)}
          rows={4}
          placeholder={'124.5  124.1  84  82.6  84.5 …'}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
        />
        <p className="text-xs text-slate-400 mt-1">
          Escríbelas seguidas, separadas por espacios o saltos de línea — como las
          cantas en bodega. Se numeran solas. Los decimales van con coma o con punto.
        </p>
        <AvisoIgnorados ignorados={ignorados} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-semibold text-slate-900">{items.length}</span>
          <span className="text-slate-500"> {unitLabel}s · </span>
          <span className="font-semibold text-slate-900">{fmt(total)}</span>
          <span className="text-slate-500"> {measureLabel}</span>
        </div>
        <button
          onClick={crear}
          disabled={saving}
          className="ml-auto py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Crear remito
        </button>
      </div>
    </div>
  )
}

function AvisoIgnorados({ ignorados }: { ignorados: string[] }) {
  if (ignorados.length === 0) return null
  return (
    <p className="text-xs text-amber-700 mt-1 flex items-start gap-1">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>
        No se entienden y quedarán fuera del remito:{' '}
        <span className="font-mono font-semibold">{ignorados.join('  ')}</span>
      </span>
    </p>
  )
}

function Campo({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
      />
    </label>
  )
}

// ── Fila + detalle ────────────────────────────────────────────────────────────

function FilaRemito({
  m, api, drivers, vehicles, abierto, onToggle, onCambio, onError,
}: {
  m: Manifest
  api: OperatorApi
  drivers: DriverRow[]
  vehicles: VehicleRow[]
  abierto: boolean
  onToggle: () => void
  onCambio: () => Promise<void>
  onError: (e: string | null) => void
}) {
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // Corregir la lista de bultos sin tirar el remito entero. En bodega se
  // equivoca una medida al dictarla y hasta ahora la única salida era anular y
  // volver a escribir los diecisiete renglones.
  const [editando, setEditando] = useState(false)
  const [medidas, setMedidas] = useState('')
  const est = ESTADO[m.status]
  const faltante = m.receivedMeasure !== undefined
    ? Math.round((m.totalMeasure - m.receivedMeasure) * 10) / 10
    : 0
  const editados = useMemo(() => parsearMedidas(medidas).medidas, [medidas])
  const totalEditado = editados.reduce((s, n) => s + n, 0)

  async function accion(path: string, body?: unknown) {
    onError(null)
    setOcupado(true)
    try {
      await api(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) })
      await onCambio()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo completar la acción.')
    } finally {
      setOcupado(false)
    }
  }

  function abrirEdicion() {
    setMedidas(m.items.map((it) => it.measure).join('  '))
    setEditando(true)
  }

  async function guardarBultos() {
    const { medidas: nuevos } = parsearMedidas(medidas)
    if (nuevos.length === 0) {
      onError('Escribe la medida de al menos un bulto.')
      return
    }
    onError(null)
    setOcupado(true)
    try {
      await api(`/operator/manifests/${m.id}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items: nuevos.map((measure) => ({ measure })) }),
      })
      setEditando(false)
      await onCambio()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudieron guardar los bultos.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-3.5 flex items-center gap-3 hover:bg-slate-50">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 text-sm">
            {m.code}
            {m.reference && <span className="text-slate-400 font-normal"> · {m.reference}</span>}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {m.clientName}{m.clientCity ? ` · ${m.clientCity}` : ''} — {m.totalItems} {m.unitLabel}s · {fmt(m.totalMeasure)} {m.measureLabel}
          </p>
        </div>
        {m.status === 'RECEIVED' && m.discrepancyCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 shrink-0">
            <AlertTriangle className="w-3 h-3" /> {m.discrepancyCount} diferencia{m.discrepancyCount > 1 ? 's' : ''}
          </span>
        )}
        {m.status === 'RECEIVED' && m.discrepancyCount === 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 shrink-0">
            <CheckCircle2 className="w-3 h-3" /> Completo
          </span>
        )}
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${est.cls}`}>
          {est.label}
        </span>
      </button>

      {abierto && (
        <div className="border-t border-slate-100 p-3.5 space-y-3">
          {/* Datos del transporte */}
          {m.driverName && (
            <p className="text-xs text-slate-500">
              Conductor: <span className="text-slate-800 font-medium">{m.driverName}</span>
              {m.driverIdNumber ? ` · C.C. ${m.driverIdNumber}` : ''}
              {m.vehiclePlate ? ` · Placa ${m.vehiclePlate}` : ''}
            </p>
          )}
          {m.status === 'RECEIVED' && (
            <p className="text-xs text-slate-500">
              Recibió: <span className="text-slate-800 font-medium">{m.receivedByName}</span>
              {m.receivedAt ? ` · ${new Date(m.receivedAt).toLocaleString('es-CO')}` : ''}
              {faltante > 0 && (
                <span className="text-red-600 font-semibold"> · faltaron {fmt(faltante)} {m.measureLabel}</span>
              )}
            </p>
          )}

          {/* Corregir bultos (solo en borrador) */}
          {editando ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-500">
                Medida de cada {m.unitLabel} ({m.measureLabel})
              </label>
              <textarea
                value={medidas}
                onChange={(e) => setMedidas(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
              />
              <AvisoIgnorados ignorados={parsearMedidas(medidas).ignorados} />
              <p className="text-xs text-slate-500">
                Reemplaza la lista completa: quedarán{' '}
                <span className="font-semibold text-slate-900">{editados.length}</span> {m.unitLabel}s ·{' '}
                <span className="font-semibold text-slate-900">{fmt(totalEditado)}</span> {m.measureLabel}
                {' '}(ahora hay {m.totalItems} · {fmt(m.totalMeasure)}).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void guardarBultos()}
                  disabled={ocupado}
                  className="py-2 px-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                >
                  {ocupado ? 'Guardando…' : 'Guardar bultos'}
                </button>
                <button
                  onClick={() => setEditando(false)}
                  className="py-2 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-white"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {/* Tabla de bultos */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="py-1 pr-3 font-semibold">#</th>
                  <th className="py-1 pr-3 font-semibold">Declarado</th>
                  {m.status === 'RECEIVED' && <th className="py-1 pr-3 font-semibold">Recibido</th>}
                  {m.status === 'RECEIVED' && <th className="py-1 font-semibold">Estado</th>}
                </tr>
              </thead>
              <tbody>
                {m.items.map((it) => {
                  const e = ITEM_ESTADO[it.status ?? 'PENDING']!
                  const mal = it.status && it.status !== 'OK' && it.status !== 'PENDING'
                  return (
                    <tr key={it.position} className={mal ? 'bg-red-50' : ''}>
                      <td className="py-1 pr-3 text-slate-500">{it.position}</td>
                      <td className="py-1 pr-3 text-slate-800 font-mono">{fmt(it.measure)}</td>
                      {m.status === 'RECEIVED' && (
                        <td className="py-1 pr-3 text-slate-800 font-mono">
                          {it.receivedMeasure !== undefined ? fmt(it.receivedMeasure) : '—'}
                        </td>
                      )}
                      {m.status === 'RECEIVED' && (
                        <td className={`py-1 font-medium ${e.cls}`}>
                          {e.label}
                          {it.receivedNote && <span className="text-slate-400 font-normal"> · {it.receivedNote}</span>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-end gap-2 pt-1">
            {m.status === 'DRAFT' && (
              <>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-1">Conductor</span>
                  <select
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white"
                  >
                    <option value="">Elige…</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-slate-500 mb-1">Vehículo</span>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white"
                  >
                    <option value="">Sin asignar</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.plate}{v.brand ? ` · ${v.brand}` : ''}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => {
                    if (!driverId) { onError('Elige el conductor que lleva la mercancía.'); return }
                    void accion(`/operator/manifests/${m.id}/dispatch`, { driverId, vehicleId: vehicleId || undefined })
                  }}
                  disabled={ocupado}
                  className="py-2 px-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" /> Despachar
                </button>
                <button
                  onClick={() => (editando ? setEditando(false) : abrirEdicion())}
                  disabled={ocupado}
                  className="py-2 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-1.5"
                >
                  <Pencil className="w-4 h-4" /> Corregir bultos
                </button>
              </>
            )}

            <a
              href={`/empresa/remito/${m.id}`}
              target="_blank"
              rel="noreferrer"
              className="py-2 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </a>

            {m.status !== 'RECEIVED' && m.status !== 'CANCELLED' && (
              <button
                onClick={() => void accion(`/operator/manifests/${m.id}/cancel`)}
                disabled={ocupado}
                className="py-2 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" /> Anular
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
