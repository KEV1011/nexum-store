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
import { puede, puedeVer } from '../../acceso'
import { useAcceso } from '../useAcceso'
import { TomarPedido } from './TomarPedido'

interface Cuenta {
  id: string
  numero: number
  tableLabel: string
  openedAt: string
  total: number
  rondas: number
  reopenCount: number
  reopenedFrom: number | null
  lineas: Array<{ nombre: string; detalle: string; cantidad: number; subtotal: number }>
  pedidos: Array<{ id: string; orderRef: string; status: string; total: number; createdAt: string }>
}

/** Respaldo por si el socket se cae; lo que mueve la pantalla es el WS. */
const RESPALDO_MS = 20000

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })

export default function CuentasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  // El mesero ve las mesas y toma pedidos, pero cobrar es de la caja: el
  // botón no se le enseña (el servidor se lo negaría igual).
  const { acceso } = useAcceso(token)
  const rol = acceso?.rol ?? null
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

  async function cancelarRonda(c: Cuenta, orderId: string, total: number) {
    // Cancelar quita plata de la cuenta: se confirma con la cifra dentro,
    // porque en un salón lleno el dedo va más rápido que la cabeza.
    if (!window.confirm(
      `¿Cancelar este pedido de ${formatCOP(total)} de la mesa ${c.tableLabel}?`
      + '\nSe descuenta de la cuenta y vuelve al inventario.',
    )) return

    setCerrando(orderId)
    try {
      const res = await fetch(
        `${BACKEND_URL}/business/${token}/cuentas/ronda/${orderId}/cancelar`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'No pudimos cancelar el pedido.')
        return
      }
      await cargar()
    } catch {
      setError('Sin conexión con el servidor.')
    } finally {
      setCerrando(null)
    }
  }

  async function cerrar(c: Cuenta) {
    // Confirmar con el TOTAL dentro: cerrar es cobrar, y un «¿seguro?» sin
    // la cifra no deja comprobar que es la mesa correcta — que es justo el
    // error que se comete con prisa en un salón lleno.
    // La mesa va PRIMERO, sola y en mayúsculas, antes que el importe:
    // cobrar la mesa equivocada es el error caro, y se comete cuando el
    // aviso es una línea corrida que nadie lee entera en un salón lleno.
    if (!window.confirm(
      `MESA ${c.tableLabel.toUpperCase()}\n\n`
      + `Cuenta ${c.numero} · ${c.rondas} ${c.rondas === 1 ? 'pedido' : 'pedidos'}\n`
      + `Total a cobrar: ${formatCOP(c.total)}\n\n`
      + '¿Es esta la mesa que estás cobrando?',
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
      {/* La cifra del salón es el dato que el dueño viene a mirar, así que
          va GRANDE y sola, no como una píldora más de la fila. Antes era un
          chip del mismo tamaño que el título y se perdía entre los botones. */}
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight text-slate-900">Mesas abiertas</h1>
            <p className="text-xs text-slate-500">
              {cuentas === null
                ? 'Cargando…'
                : cuentas.length === 0
                  ? 'Ninguna mesa está consumiendo'
                  : `${cuentas.length} ${cuentas.length === 1 ? 'mesa' : 'mesas'} con cuenta abierta`}
            </p>
          </div>
          {puedeVer(rol, 'pedidos') && (
            <a href={`/negocio/${token}`} className={`${BOTON.secundario} ml-auto`}>
              Volver al portal
            </a>
          )}
        </div>

        {cuentas && cuentas.length > 0 && (
          <div className="mt-3 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 px-4 py-3 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
              Sin cobrar en el salón
            </p>
            <p className="text-3xl font-black tabular-nums leading-tight">
              {formatCOP(cuentas.reduce((s, c) => s + c.total, 0))}
            </p>
          </div>
        )}
      </header>

      {acceso && puede(rol, 'tomarPedido') && <TomarPedido token={token} rol={rol} />}

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
            {/* El número de MESA en grande: es lo que el mesero busca de un
                vistazo en un salón lleno, y con todo al mismo tamaño había
                que leer la tarjeta entera para saber de cuál era. */}
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 min-w-[2.75rem] shrink-0 items-center justify-center rounded-xl bg-slate-900 px-2 text-lg font-black text-white">
                {c.tableLabel}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold leading-tight text-slate-900">
                  Mesa {c.tableLabel}
                </h2>
                <p className="text-xs text-slate-500">
                  Cuenta {c.numero} · {c.rondas} {c.rondas === 1 ? 'pedido' : 'pedidos'}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" /> {hora(c.openedAt)}
              </span>
            </div>

            {/* Si esta cuenta ya se cobró y alguien la volvió a abrir, se
                dice AQUÍ con la cifra anterior al lado: es la comparación
                que delata que se volvió a cerrar por menos. */}
            {c.reopenCount > 0 && (
              <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                Se reabrió {c.reopenCount === 1 ? 'una vez' : `${c.reopenCount} veces`}
                {c.reopenedFrom != null && ` · estaba cobrada por ${formatCOP(c.reopenedFrom)}`}
              </p>
            )}

            <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
              {c.lineas.map((l, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded bg-slate-100 px-1 text-xs font-bold text-slate-600">
                    {l.cantidad}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.nombre}
                    {l.detalle && <span className="text-slate-400"> · {l.detalle}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {formatCOP(l.subtotal)}
                  </span>
                </li>
              ))}
            </ul>

            {/* Las rondas, para poder quitar una. Antes NO había forma de
                cancelar nada: el plato se caía y había que cobrarlo igual. */}
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-500">
                Ver los {c.rondas} pedidos
              </summary>
              <ul className="mt-1 space-y-1">
                {c.pedidos.filter((p) => p.status !== 'CANCELLED').map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="text-slate-400">{hora(p.createdAt)}</span>
                    <span className="flex-1 tabular-nums">{formatCOP(p.total)}</span>
                    <button
                      type="button"
                      onClick={() => void cancelarRonda(c, p.id, p.total)}
                      disabled={cerrando === p.id}
                      className="rounded-lg border border-red-200 px-2 py-1 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {cerrando === p.id ? '…' : 'Cancelar'}
                    </button>
                  </li>
                ))}
              </ul>
            </details>

            <div className="mt-2 flex items-baseline justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-sm font-bold text-slate-700">Total</span>
              <span className="text-2xl font-black tabular-nums text-slate-900">
                {formatCOP(c.total)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {puede(rol, 'cerrarCuenta') && (
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
              )}
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
