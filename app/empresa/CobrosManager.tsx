'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, Plus, Printer, Download } from 'lucide-react'
import type { OperatorApi } from './api'
import type { CargoTrip } from './CargoTripsManager'

// Cuenta de cobro: el documento con el que la empresa le factura a su cliente
// un período. Agrupa viajes y, viaje por viaje, lista cada línea con su
// referencia, rollos, metros, destinatario y fecha de entrega.

export interface CobroTotals {
  trips: number
  lines: number
  items: number
  measure: number
  weightKg: number
}

export interface Cobro {
  id: string
  number: string
  clientName: string
  fromDate: string
  toDate: string
  status: string
  issuedAt?: string
  signedBy?: string
  notes?: string
  totals: CobroTotals
  trips?: CargoTrip[]
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', ISSUED: 'Emitida', VOID: 'Anulada',
}
const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  ISSUED: 'bg-emerald-100 text-emerald-700',
  VOID: 'bg-red-100 text-red-700',
}

function num(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}
function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso))
}

const HTTP_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

export default function CobrosManager({ api, token }: { api: OperatorApi; token: string }) {
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  const load = useCallback(async () => {
    try {
      const cs = await api<Cobro[]>('/operator/cobros')
      setCobros(Array.isArray(cs) ? cs : [])
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

  async function descargarCsv(c: Cobro) {
    // El CSV va autenticado, así que se baja con fetch y se entrega como blob:
    // un <a href> directo no lleva el token.
    try {
      const res = await fetch(`${HTTP_BASE}/operator/cobros/${c.id}/export.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('No se pudo descargar el CSV')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cuenta-cobro-${c.number}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el CSV')
    }
  }

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-2">
        <FileText className="w-4 h-4 text-emerald-600" /> Cuentas de cobro
        <span className="text-slate-400 font-normal">({cobros.length})</span>
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Agrupa los viajes de un período y arma el detalle de entrega que se le
        factura al cliente. Al emitirla queda sellada y sus viajes no se pueden mover.
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
        <Plus className="w-4 h-4" /> {creando ? 'Cerrar' : 'Nueva cuenta de cobro'}
      </button>

      {creando && (
        <NuevaCuenta
          onCrear={async (dto) => {
            await accion(() => api('/operator/cobros', { method: 'POST', body: JSON.stringify(dto) }))
            setCreando(false)
          }}
        />
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
          Cargando cuentas…
        </div>
      ) : cobros.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <FileText className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aún no has creado cuentas de cobro.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {cobros.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">
                    Cuenta de cobro {c.number} · {c.clientName}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {fecha(c.fromDate)} — {fecha(c.toDate)} ·{' '}
                    {c.totals.trips} {c.totals.trips === 1 ? 'viaje' : 'viajes'} ·{' '}
                    {c.totals.lines} líneas · {num(c.totals.items)} bultos ·{' '}
                    {num(c.totals.measure)} medida
                    {c.totals.weightKg > 0 ? ` · ${num(c.totals.weightKg)} kg` : ''}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_TONE[c.status] ?? ''}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                {c.status === 'DRAFT' && (
                  <>
                    <button
                      onClick={() => void accion(() => api(`/operator/cobros/${c.id}/fill`, { method: 'POST' }))}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
                    >
                      Traer viajes del período
                    </button>
                    <button
                      onClick={() => {
                        const firma = window.prompt('¿Quién firma la cuenta?', c.signedBy ?? '')
                        if (firma === null) return
                        void accion(() => api(`/operator/cobros/${c.id}/issue`, {
                          method: 'POST', body: JSON.stringify({ signedBy: firma }),
                        }))
                      }}
                      className="text-[11px] font-semibold text-slate-900 hover:underline"
                    >
                      Emitir
                    </button>
                  </>
                )}
                <a
                  href={`/empresa/cobro/${c.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900"
                >
                  <Printer className="w-3.5 h-3.5" /> Ver e imprimir
                </a>
                <button
                  onClick={() => void descargarCsv(c)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                {c.status === 'ISSUED' && (
                  <button
                    onClick={() => {
                      if (!window.confirm('Anular la cuenta liberará sus viajes para refacturarlos. ¿Continuar?')) return
                      void accion(() => api(`/operator/cobros/${c.id}/void`, { method: 'POST' }))
                    }}
                    className="text-[11px] font-semibold text-slate-400 hover:text-red-600"
                  >
                    Anular
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function NuevaCuenta({ onCrear }: { onCrear: (dto: Record<string, unknown>) => Promise<void> }) {
  const [number, setNumber] = useState('')
  const [clientName, setClientName] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [guardando, setGuardando] = useState(false)

  const listo = number.trim() && clientName.trim() && fromDate && toDate

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-4 space-y-2.5">
      <div className="grid sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Número *</label>
          <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="066"
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Cliente *</label>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="A quién se le cobra"
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Desde *</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Hasta *</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
      </div>
      <button
        disabled={guardando || !listo}
        onClick={async () => {
          setGuardando(true)
          try {
            await onCrear({
              number: number.trim(),
              clientName: clientName.trim(),
              fromDate: new Date(`${fromDate}T00:00:00`).toISOString(),
              toDate: new Date(`${toDate}T00:00:00`).toISOString(),
            })
          } finally { setGuardando(false) }
        }}
        className="py-2 px-4 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
      >
        {guardando ? 'Creando…' : 'Crear cuenta'}
      </button>
    </div>
  )
}
