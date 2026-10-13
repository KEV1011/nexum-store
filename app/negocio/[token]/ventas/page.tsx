'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2, AlertCircle } from 'lucide-react'
import { PortalTabs } from '../PortalTabs'
import { BOTON, CONTENEDOR, TARJETA } from '../../../ui'
import { formatCOP, formatNumero } from '../../../moneda'
import { BACKEND_URL } from '../../../backend'

/**
 * El reporte de ventas del negocio.
 *
 * LO QUE PEDÍAN LOS DUEÑOS: «toda la facturación de lo que se pide». El portal
 * solo tenía el panel de HOY, así que no se podía cerrar una semana ni un mes.
 *
 * NO SE LLAMA FACTURA, y no es un detalle de redacción: una factura electrónica
 * en Colombia la emite un facturador autorizado por la DIAN, con su resolución
 * de numeración y su CUFE. Llamar «factura» a esto le daría al dueño la idea de
 * que ya está cumpliendo, y quien responde ante la DIAN es él. Esto es con lo
 * que cuadra la caja y lo que le pide el contador.
 */


interface Reporte {
  pedidos: number
  tuyo: number
  descuentos: number
  domicilios: number
  fletes: number
  propinas: number
  enMesa: number
  aDomicilio: number
  ticketPromedio: number | null
  porDia: Array<{ fecha: string; pedidos: number; tuyo: number }>
  porProducto: Array<{ nombre: string; unidades: number; tuyo: number }>
  porMedio: Array<{
    medio: string
    etiqueta: string
    cobraLaPlataforma: boolean
    pedidos: number
    tuyo: number
  }>
}

/** `YYYY-MM-DD` de hoy y del primer día de este mes, en hora local. */
function hoyISO(d = new Date()): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function inicioDeMes(): string {
  const d = new Date()
  return hoyISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

function mesPasado(): { from: string; to: string } {
  const d = new Date()
  return {
    from: hoyISO(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    to: hoyISO(new Date(d.getFullYear(), d.getMonth(), 0)),
  }
}

export default function VentasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [from, setFrom] = useState(inicioDeMes())
  const [to, setTo] = useState(hoyISO())
  const [data, setData] = useState<Reporte | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(
        `${BACKEND_URL}/business/${token}/ventas?from=${from}&to=${to}`,
        { cache: 'no-store' },
      )
      const json = (await res.json()) as { success: boolean; data?: Reporte; error?: string }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos cargar el reporte.')
        setData(null)
        return
      }
      setData(json.data)
    } catch {
      setError('No se pudo conectar con el servidor.')
      setData(null)
    } finally {
      setCargando(false)
    }
  }, [token, from, to])

  useEffect(() => { void cargar() }, [cargar])

  // La barra del día más vendido marca la escala: con todas al mismo alto no se
  // ve nada, y con una escala absoluta un negocio pequeño vería la semana plana.
  const tope = Math.max(1, ...(data?.porDia ?? []).map((d) => d.tuyo))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sm:sticky sm:top-0 sm:z-20">
        <div className={`${CONTENEDOR} flex items-center gap-3 py-3`}>
          <Link href={`/negocio/${token}`} className={BOTON.icono} aria-label="Volver a pedidos">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900">Reporte de ventas</h1>
            <p className="text-xs text-slate-500">Para cuadrar tu caja y para tu contador</p>
          </div>
        </div>
      </header>
      <PortalTabs token={token} activa="ventas" />

      <main className={`${CONTENEDOR} py-5 space-y-4`}>
        {/* Rango */}
        <section className={`${TARJETA} p-4`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Desde
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Hasta
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => { const m = mesPasado(); setFrom(m.from); setTo(m.to) }}
              className={BOTON.secundario}
            >
              Mes pasado
            </button>
            <a
              href={`${BACKEND_URL}/business/${token}/ventas.csv?from=${from}&to=${to}`}
              className={BOTON.principal}
            >
              <Download className="w-4 h-4" /> Descargar Excel
            </a>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Este reporte <strong>no es una factura electrónica</strong>: esa la emite un
            facturador autorizado por la DIAN. Aquí tienes lo que vendiste, de qué y cuándo.
          </p>
        </section>

        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Armando el reporte…
          </div>
        ) : error ? (
          <div className={`${TARJETA} p-4 flex items-start gap-2 text-sm text-red-700`}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              {error}
              <button type="button" onClick={() => void cargar()} className="ml-2 underline">
                Reintentar
              </button>
            </div>
          </div>
        ) : data == null ? null : data.pedidos === 0 ? (
          <div className={`${TARJETA} p-6 text-center`}>
            <p className="text-sm font-semibold text-slate-700">
              No vendiste nada en estas fechas.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Solo cuentan los pedidos entregados o servidos: lo cancelado no lo pagó nadie y
              lo que está en curso todavía puede caerse.
            </p>
          </div>
        ) : (
          <>
            {/* Lo tuyo, grande y solo. */}
            <section className={`${TARJETA} p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tu venta
              </p>
              <p className="mt-1 text-3xl font-extrabold text-slate-900">
                {formatCOP(data.tuyo)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {formatNumero(data.pedidos)} pedido{data.pedidos === 1 ? '' : 's'}
                {data.ticketPromedio != null
                  ? ` · ${formatCOP(data.ticketPromedio)} de ticket promedio`
                  : ''}
                {' · '}
                {formatNumero(data.enMesa)} en mesa, {formatNumero(data.aDomicilio)} a domicilio
              </p>
              {/* Lo que NO es suyo va aquí, dicho con esas palabras: sumarlo a
                  «tu venta» le prometería una plata que no le llega. */}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-2">
                  <dt className="text-slate-500">Descuentos que diste</dt>
                  <dd className="font-semibold text-slate-800">{formatCOP(data.descuentos)}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <dt className="text-slate-500">Domicilios (del repartidor)</dt>
                  <dd className="font-semibold text-slate-800">{formatCOP(data.domicilios)}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <dt className="text-slate-500">Fletes (del transportador)</dt>
                  <dd className="font-semibold text-slate-800">{formatCOP(data.fletes)}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <dt className="text-slate-500">Propinas (del repartidor)</dt>
                  <dd className="font-semibold text-slate-800">{formatCOP(data.propinas)}</dd>
                </div>
              </dl>
            </section>

            {/* Día por día. Los días en cero se dibujan: un martes sin ventas
                es información, un día que no aparece es un hueco. */}
            <section className={`${TARJETA} p-4`}>
              <h2 className="text-sm font-bold text-slate-900">Día por día</h2>
              <ul className="mt-3 space-y-1.5">
                {data.porDia.map((d) => (
                  <li key={d.fecha} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 tabular-nums text-slate-500">{d.fecha}</span>
                    <span className="h-3 flex-1 rounded-full bg-slate-100">
                      <span
                        className="block h-3 rounded-full bg-emerald-500"
                        style={{ width: `${Math.round((d.tuyo / tope) * 100)}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-slate-700">
                      {formatCOP(d.tuyo)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Qué sostiene el negocio. */}
            <section className={`${TARJETA} p-4`}>
              <h2 className="text-sm font-bold text-slate-900">Lo que más vendiste</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-1 font-semibold">Producto</th>
                      <th className="pb-1 font-semibold w-20 text-right">Unidades</th>
                      <th className="pb-1 font-semibold w-28 text-right">Venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porProducto.map((p) => (
                      <tr key={p.nombre} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-800">{p.nombre}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">
                          {formatNumero(p.unidades)}
                        </td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-slate-800">
                          {formatCOP(p.tuyo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Quién cobró: es la pregunta con la que se cuadra la caja. */}
            <section className={`${TARJETA} p-4`}>
              <h2 className="text-sm font-bold text-slate-900">Cómo te pagaron</h2>
              <ul className="mt-3 space-y-2">
                {data.porMedio.map((m) => (
                  <li key={m.medio} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-800">
                      {m.etiqueta}
                      <span className="ml-2 text-slate-500">
                        {m.cobraLaPlataforma ? 'lo recaudó ZIPA' : 'lo cobraste tú'}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums text-slate-800">
                      {formatCOP(m.tuyo)}
                      <span className="ml-2 font-normal text-slate-500">
                        {formatNumero(m.pedidos)} ped.
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
