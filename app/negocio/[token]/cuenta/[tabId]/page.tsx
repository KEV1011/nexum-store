'use client'

/**
 * La cuenta de una mesa, lista para imprimir.
 *
 * ESTO NO ES UNA FACTURA, y el pie lo dice. La factura electrónica con CUFE
 * la emite un proveedor autorizado por la DIAN y quien responde ante ella es
 * el dueño del restaurante; llamar «factura» a este papel le haría creer que
 * ya cumple, y no cumple. Lo que es: la cuenta que se lleva a la mesa para
 * que el cliente revise y pague.
 *
 * MAQUETADO PARA PAPEL ESTRECHO. Casi ningún restaurante tiene impresora
 * láser en la caja; tienen una térmica de 80 mm o imprimen desde el móvil.
 * Por eso el ancho fijo de 80 mm en `@media print`, el fondo blanco sin
 * degradados —una térmica no imprime color y un fondo gris sale como una
 * mancha— y la tipografía monoespaciada en los números, que es lo que deja
 * los precios alineados en columna.
 */

import { use, useCallback, useEffect, useState } from 'react'
import { Printer, Loader2, AlertTriangle } from 'lucide-react'

import { BACKEND_URL } from '../../../../backend'
import { formatCOP } from '../../../../moneda'

interface LineaImpresa {
  nombre: string
  detalle: string
  cantidad: number
  unitario: number
  subtotal: number
}

interface Cuenta {
  id: string
  numero: number
  tableLabel: string
  openedAt: string
  closedAt: string | null
  total: number
  rondas: number
  paymentMethod: string | null
  lineas: LineaImpresa[]
}

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

export default function CuentaPage({
  params,
}: {
  params: Promise<{ token: string; tabId: string }>
}) {
  const { token, tabId } = use(params)
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [negocio, setNegocio] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/cuentas/${tabId}`)
      const json = (await res.json()) as {
        success: boolean
        data?: { cuenta: Cuenta; business: { name: string } }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos cargar la cuenta.')
        return
      }
      setCuenta(json.data.cuenta)
      setNegocio(json.data.business.name)
      setError(null)
    } catch {
      setError('Sin conexión con el servidor.')
    }
  }, [token, tabId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (error) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      </main>
    )
  }

  if (!cuenta) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md bg-white p-4 text-slate-900 print:max-w-none print:p-0">
      {/* El botón no se imprime: en el papel sería un recuadro vacío. */}
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </button>
        <a
          href={`/negocio/${token}/cuentas`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Volver
        </a>
      </div>

      <article className="font-mono text-[13px] leading-snug print:w-[80mm] print:text-[11px]">
        <header className="text-center">
          <h1 className="text-base font-bold uppercase">{negocio}</h1>
          <p className="mt-1">Cuenta {cuenta.numero} · Mesa {cuenta.tableLabel}</p>
          <p className="text-[11px]">
            {fechaLarga(cuenta.openedAt)} · {horaCorta(cuenta.openedAt)}
            {cuenta.closedAt && ` – ${horaCorta(cuenta.closedAt)}`}
          </p>
        </header>

        <hr className="my-2 border-dashed border-slate-400" />

        <table className="w-full">
          <tbody>
            {cuenta.lineas.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="w-6 pr-1 text-right">{l.cantidad}</td>
                <td className="pr-2">
                  {l.nombre}
                  {/* Lo que distingue este plato de otro igual. Va debajo y
                      más pequeño: es lo que el cliente revisa cuando algo no
                      le cuadra, no lo primero que lee. */}
                  {l.detalle && (
                    <span className="block text-[10px] text-slate-600">{l.detalle}</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">
                  {formatCOP(l.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr className="my-2 border-dashed border-slate-400" />

        <div className="flex justify-between text-base font-bold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatCOP(cuenta.total)}</span>
        </div>

        {cuenta.paymentMethod && (
          <p className="mt-1 text-[11px]">Pagado con: {cuenta.paymentMethod}</p>
        )}

        <footer className="mt-4 text-center text-[10px] leading-tight text-slate-600">
          <p>¡Gracias por su visita!</p>
          {/* La línea que impide que este papel se tome por lo que no es.
              Pequeña pero presente: un restaurante que crea estar facturando
              a la DIAN con esto se lleva la sorpresa en una visita. */}
          <p className="mt-2">
            Documento interno de cobro. No es factura electrónica ni
            documento equivalente ante la DIAN.
          </p>
        </footer>
      </article>
    </main>
  )
}
