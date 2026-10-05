'use client'

// ── Lo que ZIPA le debe al negocio, y lo que ya le giró ──────────────────────
//
// Pedirle a un comerciante que nos deje cobrar SU plata solo funciona si
// puede ver, en cualquier momento, cuánto hay pendiente, de qué pedidos sale
// y con qué referencia se le pagó. Un giro invisible obliga al dueño a
// revisar su banco a ciegas; a la tercera vez deja de confiar, y con razón.

import { useCallback, useEffect, useState } from 'react'
import { formatCOP } from '../../moneda'

interface Credito {
  id: string
  source: string
  grossAmount: number
  commission: number
  netAmount: number
  createdAt: string
}

interface Giro {
  id: string
  amount: number
  status: string
  reference: string | null
  requestedAt: string
  processedAt: string | null
  creditos: number
}

interface Datos {
  saldo: { disponible: number; movimientos: number; minimo: number; motivo: string | null }
  pendientes: Credito[]
  giros: Giro[]
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: 'Solicitado', cls: 'bg-slate-100 text-slate-700' },
  PROCESSING: { label: 'En proceso', cls: 'bg-amber-100 text-amber-800' },
  PAID: { label: 'Pagado', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Rechazado', cls: 'bg-red-100 text-red-800' },
}

function cuando(iso: string): string {
  // La zona del navegador a propósito: el dueño está en su local y la hora
  // que le sirve es la suya.
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export default function GirosNegocio({ token, backendUrl }: { token: string; backendUrl: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [fallo, setFallo] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${backendUrl}/business/${token}/giros`, { cache: 'no-store' })
      if (!r.ok) throw new Error('fallo')
      const j = (await r.json()) as { data?: Datos }
      if (!j.data) throw new Error('sin datos')
      setDatos(j.data)
      setFallo(false)
    } catch {
      setFallo(true)
    } finally {
      setCargando(false)
    }
  }, [backendUrl, token])

  useEffect(() => { void cargar() }, [cargar])

  if (cargando) return <p className="text-sm text-slate-500">Cargando tus pagos…</p>

  if (fallo || !datos) {
    // Cargando, falló y vacío son tres cosas distintas, y aquí se habla de
    // plata: decir «no tienes nada» cuando ni siquiera pudimos preguntar
    // sería la peor de las tres.
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">No pudimos consultar tus pagos.</p>
        <button
          onClick={() => { setCargando(true); void cargar() }}
          className="mt-2 text-sm font-semibold text-red-700 underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const { saldo, pendientes, giros } = datos

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold text-slate-900">Tus pagos</h2>
        <p className="mt-3 text-3xl font-black text-slate-900">{formatCOP(saldo.disponible)}</p>
        <p className="text-sm text-slate-500">
          {saldo.movimientos === 0
            ? 'Todavía no hay pedidos cobrados por ZIPA.'
            : `Pendiente de girarte, de ${saldo.movimientos} pedido${saldo.movimientos === 1 ? '' : 's'}.`}
        </p>
        {saldo.motivo && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {saldo.motivo}
          </p>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900 mb-2">De qué pedidos sale</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {pendientes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-500">{cuando(c.createdAt)}</span>
                <span className="text-slate-500">
                  {formatCOP(c.grossAmount)} − {formatCOP(c.commission)}
                </span>
                <span className="font-semibold text-slate-900">{formatCOP(c.netAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900 mb-2">Giros que te hemos hecho</h3>
        {giros.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía ninguno.</p>
        ) : (
          <ul className="space-y-2">
            {giros.map((g) => {
              const e = ESTADO[g.status] ?? { label: g.status, cls: 'bg-slate-100 text-slate-700' }
              return (
                <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{formatCOP(g.amount)}</p>
                    <p className="text-xs text-slate-500">
                      {g.creditos} pedido{g.creditos === 1 ? '' : 's'} · {cuando(g.processedAt ?? g.requestedAt)}
                    </p>
                    {/* La referencia es lo que le permite encontrar la
                        transferencia en su banco. Sin ella, «te pagamos» no
                        se puede comprobar, que es peor que no avisar. */}
                    {g.reference && <p className="text-xs text-slate-400 truncate">Ref: {g.reference}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${e.cls}`}>
                    {e.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
