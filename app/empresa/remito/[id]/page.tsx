'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { Manifest } from '../../ManifestsManager'

/**
 * Remito imprimible — misma estructura que el formato en papel del cliente.
 *
 * Existe para la transición: la bodega y el destinatario siguen viendo el
 * documento de siempre mientras el control ya es digital. Se imprime con
 * Ctrl+P (o "Guardar como PDF"), sin depender de ninguna librería.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

/** El papel tiene 100 casillas numeradas; se conserva la retícula. */
const CASILLAS = 100

function fmt(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}

export default function RemitoImprimible() {
  const params = useParams<{ id: string }>()
  const [m, setM] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = sessionStorage.getItem('nx_operator_token')
    if (!token) {
      setError('Abre el portal e inicia sesión para ver el remito.')
      return
    }
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/operator/manifests/${params.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const json = (await res.json()) as { data?: Manifest; error?: string }
        if (!res.ok || !json.data) throw new Error(json.error ?? 'No se pudo cargar')
        setM(json.data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar el remito.')
      }
    })()
  }, [params.id])

  if (error) {
    return <p className="p-8 text-center text-sm text-slate-600">{error}</p>
  }
  if (!m) {
    return <p className="p-8 text-center text-sm text-slate-400">Cargando remito…</p>
  }

  const porPosicion = new Map(m.items.map((it) => [it.position, it]))
  const conciliado = m.status === 'RECEIVED'

  return (
    <div className="bg-white text-black mx-auto max-w-[820px] p-6 print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: letter portrait; margin: 12mm; }
        }
        .celda { border: 1px solid #000; height: 34px; position: relative; }
        .celda .num {
          position: absolute; top: 1px; left: 2px;
          font-size: 8px; line-height: 1; color: #444;
        }
        .celda .val {
          display: flex; align-items: center; justify-content: center;
          height: 100%; font-size: 12px; padding-top: 6px;
        }
        .marco { border: 1px solid #000; }
        .marco td { border: 1px solid #000; padding: 3px 6px; font-size: 12px; }
      `}</style>

      <div className="no-print mb-4 flex gap-2">
        <button
          onClick={() => window.print()}
          className="py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700"
        >
          Imprimir / Guardar PDF
        </button>
        <a
          href="/empresa"
          className="py-2 px-4 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Volver al portal
        </a>
      </div>

      <h1 className="text-center font-bold text-[15px] tracking-wide mb-3">
        SALIDA DE MERCANCÍA {m.warehouse ? m.warehouse.toUpperCase() : ''}
      </h1>

      {/* Encabezado, igual que el formato en papel */}
      <table className="marco w-full mb-1">
        <tbody>
          <tr>
            <td className="font-bold w-[70px]">FECHA</td>
            <td>{new Date(m.dispatchedAt ?? m.createdAt).toLocaleDateString('es-CO')}</td>
            <td className="font-bold w-[90px]">REFERENCIA</td>
            <td>{m.reference ?? ''}</td>
          </tr>
        </tbody>
      </table>
      <table className="marco w-full mb-3">
        <tbody>
          <tr>
            <td className="font-bold w-[70px]">CLIENTE</td>
            <td>{m.clientName}</td>
            <td className="font-bold w-[90px]">CONDUCTOR</td>
            <td>{m.driverName ?? ''}</td>
          </tr>
          <tr>
            <td className="font-bold">DIRECCION</td>
            <td>{m.clientAddress ?? ''}</td>
            <td className="font-bold">C.C.</td>
            <td>{m.driverIdNumber ?? ''}</td>
          </tr>
          <tr>
            <td className="font-bold">CIUDAD</td>
            <td>{m.clientCity ?? ''}</td>
            <td className="font-bold">PLACA VEHICULO</td>
            <td>{m.vehiclePlate ?? ''}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-[11px] mb-1">
        Cada casilla está numerada y cada número equivale a un {m.unitLabel}. Al frente
        se detalla la medida exacta por {m.unitLabel} ({m.measureLabel}):
      </p>

      {/* Retícula de 100 casillas */}
      <div className="grid grid-cols-10 mb-2">
        {Array.from({ length: CASILLAS }, (_, i) => {
          const pos = i + 1
          const it = porPosicion.get(pos)
          return (
            <div key={pos} className="celda">
              <span className="num">{pos}</span>
              <span className="val">{it ? fmt(it.measure) : ''}</span>
            </div>
          )
        })}
      </div>

      <table className="marco w-full mb-3">
        <tbody>
          <tr>
            <td className="font-bold w-[130px]">Total {m.unitLabel}s</td>
            <td>{m.totalItems}</td>
          </tr>
          <tr>
            <td className="font-bold">Total {m.measureLabel}</td>
            <td>{fmt(m.totalMeasure)}</td>
          </tr>
        </tbody>
      </table>

      {/* Conciliación: lo que el papel no tenía */}
      {conciliado && m.discrepancyCount > 0 && (
        <div className="mb-3">
          <p className="font-bold text-[12px] mb-1">
            DIFERENCIAS EN LA ENTREGA ({m.discrepancyCount})
          </p>
          <table className="marco w-full">
            <tbody>
              <tr>
                <td className="font-bold">{m.unitLabel} N°</td>
                <td className="font-bold">Declarado</td>
                <td className="font-bold">Recibido</td>
                <td className="font-bold">Novedad</td>
              </tr>
              {m.items
                .filter((it) => it.status && it.status !== 'OK' && it.status !== 'PENDING')
                .map((it) => (
                  <tr key={it.position}>
                    <td>{it.position}</td>
                    <td>{fmt(it.measure)}</td>
                    <td>{it.receivedMeasure !== undefined ? fmt(it.receivedMeasure) : '—'}</td>
                    <td>
                      {it.status === 'MISSING' ? 'No llegó'
                        : it.status === 'SHORT' ? 'Faltó medida'
                        : 'Averiado'}
                      {it.receivedNote ? ` · ${it.receivedNote}` : ''}
                    </td>
                  </tr>
                ))}
              <tr>
                <td className="font-bold" colSpan={2}>Total recibido</td>
                <td className="font-bold" colSpan={2}>
                  {m.receivedMeasure !== undefined ? fmt(m.receivedMeasure) : '—'} {m.measureLabel}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] mb-1">
        Mercancía se recibe a satisfacción en las cantidades y condiciones acordadas,
        como constancia firma:
      </p>
      <table className="marco w-full">
        <tbody>
          <tr>
            <td className="font-bold w-[110px]">Firma Recibe</td>
            <td className="h-[42px]">{conciliado ? m.receivedByName ?? '' : ''}</td>
            <td className="font-bold w-[90px]">Autoriza</td>
            <td>{m.authorizedBy ?? ''}</td>
          </tr>
          <tr>
            <td className="font-bold">Cédula</td>
            <td className="h-[34px]">{conciliado ? m.receivedByIdNumber ?? '' : ''}</td>
            <td className="font-bold">Firma</td>
            <td className="h-[34px]" />
          </tr>
          <tr>
            <td className="font-bold">Observaciones</td>
            <td className="h-[46px]" colSpan={3}>{m.notes ?? ''}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-[9px] text-center mt-2 text-slate-500">
        {m.code} · Generado por ZIPA
        {conciliado && m.receivedAt
          ? ` · Entrega registrada ${new Date(m.receivedAt).toLocaleString('es-CO')}`
          : ''}
      </p>
    </div>
  )
}
