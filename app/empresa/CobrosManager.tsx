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
  amount: number
}

export interface CobroBalance {
  total: number
  paid: number
  balance: number
  advance: number
  payments: number
  status: 'SIN_PAGOS' | 'PARCIAL' | 'PAGADA' | 'SOBREPAGADA'
  pct: number
}

export interface Payment {
  id: string
  amount: number
  kind: 'ANTICIPO' | 'ABONO' | 'SALDO'
  method?: string
  reference?: string
  notes?: string
  paidAt: string
  voidedAt?: string
}

const PAY_LABEL: Record<string, string> = {
  ANTICIPO: 'Anticipo', ABONO: 'Abono', SALDO: 'Saldo',
}

const BALANCE_TONE: Record<string, string> = {
  SIN_PAGOS: 'bg-slate-100 text-slate-600',
  PARCIAL: 'bg-amber-100 text-amber-700',
  PAGADA: 'bg-emerald-100 text-emerald-700',
  SOBREPAGADA: 'bg-blue-100 text-blue-700',
}
const BALANCE_LABEL: Record<string, string> = {
  SIN_PAGOS: 'Sin pagos', PARCIAL: 'Pago parcial', PAGADA: 'Pagada', SOBREPAGADA: 'Pagada de más',
}

function cop(n: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
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
  balance: CobroBalance
  payments: Payment[]
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
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${BALANCE_TONE[c.balance.status] ?? ''}`}>
                    {BALANCE_LABEL[c.balance.status] ?? c.balance.status}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_TONE[c.status] ?? ''}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </div>
              </div>

              <SaldoCuenta c={c} onAccion={accion} api={api} />

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

/**
 * Estado de pago de la cuenta: cuánto se facturó, cuánto entró y qué queda
 * debiendo, con la lista de pagos y el alta de uno nuevo. El saldo lo calcula
 * el backend a partir de los viajes y los pagos, nunca se guarda.
 */
function SaldoCuenta({
  c, onAccion, api,
}: {
  c: Cobro
  onAccion: (fn: () => Promise<unknown>) => Promise<void>
  api: OperatorApi
}) {
  const [abierto, setAbierto] = useState(false)
  const b = c.balance
  const vigentes = c.payments.filter((p) => !p.voidedAt)

  return (
    <div className="border-t border-slate-100 pt-2 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Cifra label="Facturado" valor={cop(b.total)} />
        <Cifra label="Pagado" valor={cop(b.paid)} tono="emerald" />
        <Cifra
          label={b.balance < 0 ? 'A favor del cliente' : 'Saldo'}
          valor={cop(Math.abs(b.balance))}
          tono={b.balance > 0 ? 'amber' : 'slate'}
        />
      </div>

      {b.total > 0 && (
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full ${b.status === 'PAGADA' || b.status === 'SOBREPAGADA' ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${b.pct}%` }}
          />
        </div>
      )}

      {b.total === 0 && (
        <p className="text-[11px] text-amber-700">
          Los viajes de esta cuenta todavía no tienen valor. Ponles precio para poder registrar pagos.
        </p>
      )}

      {vigentes.length > 0 && (
        <ul className="space-y-1">
          {vigentes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600 truncate">
                <span className="font-semibold text-slate-800">{PAY_LABEL[p.kind] ?? p.kind}</span>
                {' · '}{cop(p.amount)}
                {' · '}{fecha(p.paidAt)}
                {p.method ? ` · ${p.method}` : ''}
                {p.reference ? ` · ${p.reference}` : ''}
              </span>
              <button
                title="Anular pago"
                onClick={() => {
                  if (!window.confirm('¿Anular este pago? Queda la constancia de que existió.')) return
                  void onAccion(() => api(`/operator/cobros/${c.id}/payments/${p.id}`, { method: 'DELETE' }))
                }}
                className="text-slate-300 hover:text-red-600 shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {c.status !== 'VOID' && b.total > 0 && (
        <>
          <button
            onClick={() => setAbierto((v) => !v)}
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
          >
            {abierto ? 'Cerrar' : 'Registrar pago'}
          </button>
          {abierto && (
            <NuevoPago
              saldo={b.balance}
              onPagar={async (dto) => {
                await onAccion(() => api(`/operator/cobros/${c.id}/payments`, {
                  method: 'POST', body: JSON.stringify(dto),
                }))
                setAbierto(false)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function Cifra({ label, valor, tono = 'slate' }: { label: string; valor: string; tono?: string }) {
  const color = tono === 'emerald' ? 'text-emerald-700' : tono === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
      <p className={`text-sm font-bold leading-tight ${color}`}>{valor}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  )
}

function NuevoPago({
  saldo, onPagar,
}: {
  saldo: number
  onPagar: (dto: Record<string, unknown>) => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState('ANTICIPO')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [guardando, setGuardando] = useState(false)

  const monto = Number(amount)
  const excede = Number.isFinite(monto) && monto > saldo

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Monto (COP) *</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder={String(Math.max(0, saldo))}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tipo</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500">
            <option value="ANTICIPO">Anticipo</option>
            <option value="ABONO">Abono parcial</option>
            <option value="SALDO">Saldo (cierra la cuenta)</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Medio</label>
          <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Transferencia"
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Comprobante</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° de consignación"
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha del pago</label>
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)}
            className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-emerald-500" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAmount(String(Math.max(0, saldo)))}
          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline"
        >
          Pagar el saldo completo ({cop(Math.max(0, saldo))})
        </button>
      </div>

      {excede && (
        <p className="text-[11px] text-amber-700">
          El monto supera el saldo pendiente. Si el cliente está adelantando para la
          próxima cuenta, márcalo abajo; si no, revisa la cifra.
        </p>
      )}

      <button
        disabled={guardando || !(monto > 0)}
        onClick={async () => {
          setGuardando(true)
          try {
            await onPagar({
              amount: monto,
              kind,
              method: method.trim() || undefined,
              reference: reference.trim() || undefined,
              paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
              allowOverpay: excede,
            })
          } finally { setGuardando(false) }
        }}
        className="py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        {guardando ? 'Registrando…' : 'Registrar pago'}
      </button>
    </div>
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
