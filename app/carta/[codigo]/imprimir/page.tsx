'use client'

import { use, useEffect, useState } from 'react'
import { llamar, type Carta } from '../../api'
import { dibujarQr, useLibreriaQr } from '../../qr'
import { BOTON } from '../../../ui'

/**
 * La hoja para imprimir: un código QR por mesa, para recortar y poner encima.
 *
 * EL QR SE DIBUJA EN EL NAVEGADOR con una librería por CDN, igual que el mapa
 * del portal de empresa carga Leaflet. Si el CDN no responde **se imprime el
 * enlace y el código en texto grande**: una hoja con cuadros vacíos no sirve
 * para nada, y el código escrito a mano sí deja pedir (por eso su alfabeto no
 * tiene 0/O ni 1/I).
 */
export default function ImprimirPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = use(params)
  const [carta, setCarta] = useState<Carta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const qrListo = useLibreriaQr()

  useEffect(() => {
    void llamar<Carta>(`/carta/${encodeURIComponent(codigo)}`)
      .then(setCarta)
      .catch(() => setError('No pudimos cargar tus mesas.'))
  }, [codigo])


  const base = typeof window === 'undefined' ? '' : window.location.origin
  const enlaceDe = (mesa: string) =>
    `${base}/carta/${encodeURIComponent(codigo)}?mesa=${encodeURIComponent(mesa)}`

  if (error) return <main className="p-8 text-sm text-red-700">{error}</main>
  if (!carta) return <main className="p-8 text-sm text-slate-500">Cargando…</main>

  if (carta.tables.length === 0) {
    return (
      <main className="p-8">
        <p className="text-sm font-semibold text-slate-800">
          Todavía no tienes mesas creadas.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Agrégalas desde Ajustes → Pedido en la mesa y vuelve aquí a imprimirlas.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl bg-white p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Códigos de mesa · {carta.business.name}
          </h1>
          <p className="text-xs text-slate-500">
            Recorta cada tarjeta y ponla en su mesa. Si cambias las mesas, vuelve
            a imprimir.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className={`${BOTON.principal} print:hidden`}
        >
          Imprimir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {carta.tables.map((mesa) => (
          <TarjetaMesa
            key={mesa}
            mesa={mesa}
            negocio={carta.business.name}
            enlace={enlaceDe(mesa)}
            codigo={codigo}
            qrListo={qrListo}
          />
        ))}
      </div>
    </main>
  )
}

function TarjetaMesa({ mesa, negocio, enlace, codigo, qrListo }: {
  mesa: string
  negocio: string
  enlace: string
  codigo: string
  qrListo: boolean
}) {
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!nodo || !qrListo) return
    dibujarQr(nodo, enlace, 160)
  }, [nodo, qrListo, enlace])

  return (
    <div className="break-inside-avoid rounded-xl border border-dashed border-slate-400 p-4 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{negocio}</p>
      <p className="text-2xl font-black text-slate-900">Mesa {mesa}</p>
      <div ref={setNodo} className="mx-auto mt-2 grid h-[160px] w-[160px] place-items-center">
        {!qrListo && (
          <span className="px-2 text-[10px] leading-tight text-slate-400">
            Sin conexión para dibujar el código. Usa el enlace de abajo.
          </span>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-tight text-slate-500">
        Escanea y pide desde tu celular
      </p>
      <p className="mt-1 break-all text-[9px] text-slate-400">{enlace}</p>
      <p className="mt-1 font-mono text-xs font-bold tracking-widest text-slate-700">{codigo}</p>
    </div>
  )
}
