'use client'

/**
 * Las mesas con cuenta abierta: una tarjeta por mesa, con lo que lleva.
 *
 * EL PROBLEMA QUE RESUELVE. En el portal cada ronda salía como una fila
 * suelta: «Mesa 1 · $68.000», «Mesa 1 · $12.000», «Mesa 1 · $8.000». Con
 * afluencia eso no es incómodo, es caro — nadie sabe cuánto debe la mesa 1 y
 * es facilísimo cobrar una ronda y olvidar las otras dos. Aquí la mesa 1 es
 * UNA tarjeta con su total.
 */

import { use, useCallback, useEffect, useState } from 'react'
import {
  Receipt, Printer, Loader2, AlertTriangle, Check, Clock, RotateCcw,
} from 'lucide-react'

import { BACKEND_URL, BACKEND_WS } from '../../../backend'
import { formatCOP } from '../../../moneda'
import { BOTON, TARJETA } from '../../../ui'

interface Cuenta {
  id: string
  numero: number
  tableLabel: string
  openedAt: string
  total: number
  rondas: number
  lineas: Array<{ nombre: string; detalle: string; cantidad: number; subtotal: number }>
  pedidos: Array<{ id: string; orderRef: string; status: string; total: number; createdAt: string }>
}

/** Respaldo por si el socket se cae; lo que mueve la pantalla es el WS. */
const RESPALDO_MS = 20000

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })

export default function CuentasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/cuentas`)
      const json = (await res.json()) as {
        success: boolean
        data?: { cuentas: Cuenta[] }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos cargar las cuentas.')
        return
      }
      setCuentas(json.data.cuentas)
      setError(null)
    } catch {
      setError('Sin conexión con el servidor.')
    }
  }, [token])

  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), RESPALDO_MS)
    return () => clearInterval(t)
  }, [cargar])

  // El mismo socket del portal y de la cocina: una ronda nueva tiene que
  // sumarse a la vista del mesero sin que él refresque nada.
  useEffect(() => {
    let vivo = true
    let ws: WebSocket | null = null
    let reconexion: ReturnType<typeof setTimeout> | null = null

    function conectar() {
      if (!vivo) return
      try {
        ws = new WebSocket(BACKEND_WS)
        ws.onopen = () => ws?.send(JSON.stringify({ type: 'business_auth', token }))
        ws.onmessage = (evt) => {
          try {
            const t = (JSON.parse(evt.data as string) as Record<string, unknown>)['type']
            if (t === 'new_order' || t === 'order_update') void cargar()
          } catch {
            // Un mensaje mal formado no puede tumbar la pantalla del salón.
          }
        }
        ws.onclose = () => {
          ws = null
          if (vivo) reconexion = setTimeout(conectar, 5000)
        }
        ws.onerror = () => ws?.close()
      } catch {
        if (vivo) reconexion = setTimeout(conectar, 5000)
      }
    }
    conectar()
    return () => {
      vivo = false
      if (reconexion) clearTimeout(reconexion)
      ws?.close()
    }
  }, [token, cargar])

  async function cerrar(c: Cuenta) {
    // Confirmar con el TOTAL dentro: cerrar es cobrar, y un «¿seguro?» sin
    // la cifra no deja comprobar que es la mesa correcta — que es justo el
    // error que se comete con prisa en un salón lleno.
    if (!window.confirm(
      `¿Cobrar la cuenta ${c.numero} de la mesa ${c.tableLabel} por ${formatCOP(c.total)}?`,
    )) return

    setCerrando(c.id)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/cuentas/${c.id}/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'No pudimos cerrar la cuenta.')
        return
      }
      await cargar()
    } catch {
      setError('Sin conexión con el servidor.')
    } finally {
      setCerrando(null)
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Receipt className="h-6 w-6 text-emerald-600" />
        <h1 className="text-lg font-bold text-slate-900">Mesas abiertas</h1>
        {cuentas && cuentas.length > 0 && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
            {formatCOP(cuentas.reduce((s, c) => s + c.total, 0))} en el salón
          </span>
        )}
        <a
          href={`/negocio/${token}`}
          className={`${BOTON.secundario} ml-auto`}
        >
          Volver al portal
        </a>
      </header>

      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {cuentas === null && !error && (
        <p className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      )}

      {cuentas !== null && cuentas.length === 0 && (
        <div className={`${TARJETA} text-center`}>
          <Receipt className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 font-semibold text-slate-600">No hay mesas abiertas</p>
          <p className="mt-1 text-sm text-slate-500">
            La cuenta se abre sola cuando una mesa hace su primer pedido.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(cuentas ?? []).map((c) => (
          <article key={c.id} className={TARJETA}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-base font-bold text-slate-900">Mesa {c.tableLabel}</h2>
              <span className="text-xs font-semibold text-slate-500">Cuenta {c.numero}</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" /> desde {hora(c.openedAt)}
              </span>
            </div>

            <p className="mt-0.5 text-xs text-slate-500">
              {c.rondas} {c.rondas === 1 ? 'pedido' : 'pedidos'}
            </p>

            <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
              {c.lineas.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right font-semibold">{l.cantidad}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.nombre}
                    {l.detalle && <span className="text-slate-400"> · {l.detalle}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatCOP(l.subtotal)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
              <span className="text-sm font-bold text-slate-900">Total</span>
              <span className="text-lg font-black tabular-nums text-slate-900">
                {formatCOP(c.total)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void cerrar(c)}
                disabled={cerrando === c.id}
                className={`${BOTON.principal} flex-1`}
              >
                {cerrando === c.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><Check className="h-4 w-4" /> Cobrar</>}
              </button>
              <a
                href={`/negocio/${token}/cuenta/${c.id}`}
                className={BOTON.secundario}
              >
                <Printer className="h-4 w-4" /> Imprimir
              </a>
            </div>
          </article>
        ))}
      </div>

      {/* Que el papel NO es una factura se dice también aquí, no solo en el
          impreso: el dueño toma la decisión de qué entregar en esta pantalla. */}
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        La cuenta es un documento interno de cobro para que el cliente revise y
        pague. No es factura electrónica ante la DIAN.
      </p>
    </main>
  )
}
