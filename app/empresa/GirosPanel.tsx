'use client'

// ── Lo que ZIPA le debe a la empresa, y lo que ya le giró ────────────────────
//
// Esta pantalla es la mitad que vuelve aceptable que la plataforma recaude.
// Pedirle a una empresa que nos deje cobrar SU plata solo funciona si puede
// ver en todo momento cuánto hay pendiente, de qué ventas sale y con qué
// referencia se le pagó. Un giro invisible obliga a revisar el banco a
// ciegas, y a la tercera vez se acaba la confianza.

import { useCallback, useEffect, useState } from 'react'
import { Banknote } from 'lucide-react'
import type { OperatorApi } from './api'
import { formatCOP } from '../moneda'
import { momento } from './fechas'

interface Credito {
  id: string
  source: string
  sourceId: string
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

const FUENTE: Record<string, string> = { order: 'Pedido', booking: 'Tiquete' }

export default function GirosPanel({ api }: { api: OperatorApi }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  // Tres estados, no dos: una lista vacía porque la consulta FALLÓ no es lo
  // mismo que no tener nada pendiente, y aquí se habla de plata.
  const [fallo, setFallo] = useState(false)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    try {
      const r = await api<Datos>('/giros')
      setDatos(r)
      setFallo(false)
    } catch {
      setFallo(true)
    } finally {
      setCargando(false)
    }
  }, [api])

  useEffect(() => { void cargar() }, [cargar])

  if (cargando) {
    return <p className="text-sm text-slate-500">Cargando tus giros…</p>
  }
  if (fallo || !datos) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          No pudimos consultar tus giros. Vuelve a intentarlo en un momento.
        </p>
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Banknote className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-slate-900">Pendiente de girar</h3>
        </div>
        <p className="text-3xl font-black text-slate-900">{formatCOP(saldo.disponible)}</p>
        <p className="text-sm text-slate-500 mt-1">
          {saldo.movimientos === 0
            ? 'Todavía no hay ventas cobradas por ZIPA.'
            : `De ${saldo.movimientos} venta${saldo.movimientos === 1 ? '' : 's'} que cobramos por ti.`}
        </p>
        {/* El motivo viene del servidor para que diga lo mismo que decidiría
            el backend si se pidiera el giro. Si lo redactara el portal,
            acabarían discrepando. */}
        {saldo.motivo && (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {saldo.motivo}
          </p>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-bold text-slate-900 mb-3">De qué ventas sale</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-medium">Venta</th>
                  <th className="py-2 pr-3 font-medium text-right">Cobrado</th>
                  <th className="py-2 pr-3 font-medium text-right">Comisión</th>
                  <th className="py-2 font-medium text-right">Te queda</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-800">
                        {FUENTE[c.source] ?? c.source}
                      </span>
                      <span className="block text-xs text-slate-400">{momento(c.createdAt)}</span>
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">{formatCOP(c.grossAmount)}</td>
                    <td className="py-2 pr-3 text-right text-slate-500">−{formatCOP(c.commission)}</td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {formatCOP(c.netAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900 mb-3">Giros</h3>
        {giros.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no se te ha hecho ningún giro.</p>
        ) : (
          <ul className="space-y-2">
            {giros.map((g) => {
              const e = ESTADO[g.status] ?? { label: g.status, cls: 'bg-slate-100 text-slate-700' }
              return (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{formatCOP(g.amount)}</p>
                    <p className="text-xs text-slate-500">
                      {g.creditos} venta{g.creditos === 1 ? '' : 's'} ·{' '}
                      {momento(g.processedAt ?? g.requestedAt)}
                    </p>
                    {/* La referencia es lo que le permite buscar la
                        transferencia en su banco. Sin ella, «te pagamos» no
                        se puede comprobar. */}
                    {g.reference && (
                      <p className="text-xs text-slate-400 truncate">Ref: {g.reference}</p>
                    )}
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
    </div>
  )
}
