'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Cobro } from '../../CobrosManager'

/**
 * Cuenta de cobro imprimible — reproduce el formato en papel del cliente:
 * «DETALLE DE ENTREGA CUENTA DE COBRO NNN · DETALLE VIAJES NACIONALES».
 *
 * Se imprime con Ctrl+P (o «Guardar como PDF»), sin depender de ninguna
 * librería. Existe para la transición: el cliente sigue recibiendo el documento
 * de siempre mientras el control ya es digital.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

function num(n: number | undefined): string {
  if (n == null) return ''
  return n.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

function fecha(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export default function CuentaCobroImprimible() {
  const params = useParams<{ id: string }>()
  const [c, setC] = useState<Cobro | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = sessionStorage.getItem('nx_operator_token')
    if (!token) {
      setError('Abre el portal e inicia sesión para ver la cuenta de cobro.')
      return
    }
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/operator/cobros/${params.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const json = (await res.json()) as { success: boolean; data?: Cobro; error?: string }
        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? 'No se pudo cargar la cuenta de cobro.')
          return
        }
        setC(json.data)
      } catch {
        setError('No se pudo cargar la cuenta de cobro.')
      }
    })()
  }, [params.id])

  if (error) {
    return <main className="p-8 text-sm text-slate-600">{error}</main>
  }
  if (!c) {
    return <main className="p-8 text-sm text-slate-400">Cargando…</main>
  }

  const t = c.totals

  return (
    <main className="bg-white text-black mx-auto p-6 print:p-0" style={{ maxWidth: '210mm' }}>
      {/* La barra de acciones no se imprime. */}
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="py-2 px-4 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800"
        >
          Imprimir o guardar como PDF
        </button>
        {c.status === 'DRAFT' && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Borrador — todavía se pueden añadir o quitar viajes.
          </span>
        )}
        {c.status === 'VOID' && (
          <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            Cuenta anulada.
          </span>
        )}
      </div>

      <header className="text-center mb-4">
        <h1 className="font-bold text-[15px] uppercase leading-tight">
          Detalle de entrega cuenta de cobro {c.number}
        </h1>
        <h2 className="font-bold text-[15px] uppercase leading-tight">Detalle viajes nacionales</h2>
        <p className="text-[11px] mt-1">
          {c.clientName} · {fecha(c.fromDate)} — {fecha(c.toDate)}
        </p>
      </header>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            {['VIAJE', 'ORIGEN', 'REFERENCIA', 'ROLLOS', 'METROS', 'PESO', 'FECHA DE ENTREGA', 'CLIENTE', 'DESTINO'].map((h) => (
              <th key={h} className="border border-black px-1 py-1 font-bold text-center align-middle">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.trips?.map((viaje) => {
            const origen = [viaje.originCity, viaje.originPlace].filter(Boolean).join(' ')
            // Acarreo urbano: se cobra el viaje aunque no liste mercancía; en el
            // papel la columna de peso dice URBANO.
            if (viaje.lines.length === 0) {
              return (
                <tr key={viaje.id}>
                  <td className="border border-black px-1 py-1 text-center font-bold">
                    {String(viaje.number).padStart(2, '0')}
                  </td>
                  <td className="border border-black px-1 py-1 text-center">{origen}</td>
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1 text-center">
                    {viaje.isUrban ? 'URBANO' : num(viaje.weightKg)}
                  </td>
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1" />
                </tr>
              )
            }
            return viaje.lines.map((l, i) => (
              <tr key={l.id}>
                {/* El número y el origen van solo en la primera línea del
                    viaje: repetirlos sugeriría viajes distintos. */}
                <td className="border border-black px-1 py-1 text-center font-bold">
                  {i === 0 ? String(viaje.number).padStart(2, '0') : ''}
                </td>
                <td className="border border-black px-1 py-1 text-center">{i === 0 ? origen : ''}</td>
                <td className="border border-black px-1 py-1 text-center">{l.reference ?? ''}</td>
                <td className="border border-black px-1 py-1 text-center">
                  {String(l.totalItems).padStart(2, '0')}
                </td>
                <td className="border border-black px-1 py-1 text-center">{num(l.totalMeasure)}</td>
                {/* El peso es del camión: se anota una sola vez, en la última
                    línea, igual que en el formato en papel. */}
                <td className="border border-black px-1 py-1 text-center">
                  {i === viaje.lines.length - 1 ? num(viaje.weightKg) : ''}
                </td>
                <td className="border border-black px-1 py-1 text-center">{fecha(l.deliveredOn)}</td>
                <td className="border border-black px-1 py-1 text-center">{l.clientName}</td>
                <td className="border border-black px-1 py-1 text-center">{l.clientCity ?? ''}</td>
              </tr>
            ))
          })}

          <tr className="font-bold">
            <td className="border border-black px-1 py-1 text-center" colSpan={3}>
              TOTALES · {t.trips} {t.trips === 1 ? 'viaje' : 'viajes'}
            </td>
            <td className="border border-black px-1 py-1 text-center">{num(t.items)}</td>
            <td className="border border-black px-1 py-1 text-center">{num(t.measure)}</td>
            <td className="border border-black px-1 py-1 text-center">{num(t.weightKg)}</td>
            <td className="border border-black px-1 py-1" colSpan={3} />
          </tr>
        </tbody>
      </table>

      <footer className="mt-10 text-[11px]">
        <p>Atentamente,</p>
        <div className="mt-12 border-t border-black inline-block min-w-[220px]" />
        <p className="font-bold mt-1">{c.signedBy ?? ''}</p>
        {c.issuedAt && <p className="text-[10px] mt-1">Emitida el {fecha(c.issuedAt)}</p>}
      </footer>
    </main>
  )
}
