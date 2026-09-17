'use client'

import { useCallback, useEffect, useState } from 'react'
import { PackagePlus, Loader2, RefreshCw, AlertTriangle, Bus } from 'lucide-react'
import type { OperatorApi } from './api'
import { useMunicipios } from './useMunicipios'
import { formatCOP, formatNumero } from './../moneda'

interface Encomienda {
  orderId: string
  orderRef: string
  createdAt: string
  businessName: string
  originCitySlug: string | null
  clientName: string
  clientPhone: string | null
  deliveryAddress: string
  destCitySlug: string | null
  intercityFee: number | null
  bultos: number
  items: Array<{ productName: string; quantity: number }>
}

interface ViajeBreve {
  id: string
  number: number
  status: string
  originCity: string | null
  destCity: string | null
}

/**
 * Encomiendas esperando bus.
 *
 * El tablero NO es de esta empresa: una encomienda no pertenece a nadie hasta
 * que alguien la sube a su despacho, igual que el tablero de fletes. Se filtra
 * por RUTA, que es lo que decide si le sirve — un despachador de Cúcuta no
 * quiere ver lo que sale de Bogotá.
 *
 * Al subirla se crea su remito, y desde ahí hereda todo lo que ya existe: el
 * acta firmada al recibir, la conciliación bulto por bulto y la cuenta de cobro.
 */
export function EncomiendasPanel({ api }: { api: OperatorApi }) {
  const { municipios } = useMunicipios()
  const [lista, setLista] = useState<Encomienda[] | null>(null)
  const [viajes, setViajes] = useState<ViajeBreve[]>([])
  const [fallo, setFallo] = useState<string | null>(null)
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const nombre = useCallback(
    (slug: string | null) => municipios.find((m) => m.slug === slug)?.name ?? slug ?? '—',
    [municipios],
  )

  const cargar = useCallback(async () => {
    setFallo(null)
    try {
      const q = new URLSearchParams()
      if (origen) q.set('origen', origen)
      if (destino) q.set('destino', destino)
      const [enc, vs] = await Promise.all([
        api<Encomienda[]>(`/operator/encomiendas?${q.toString()}`),
        api<ViajeBreve[]>('/operator/cargo-trips?limit=50'),
      ])
      setLista(enc)
      // Solo los despachos que aún admiten carga.
      setViajes(vs.filter((v) => v.status === 'DRAFT'))
    } catch (e) {
      // Distinguir «falló» de «no hay ninguna»: enseñar el estado vacío cuando
      // la petición se cayó diría que no hay encomiendas, y sí puede haberlas.
      setFallo(e instanceof Error ? e.message : 'No se pudo cargar el tablero')
      setLista(null)
    }
  }, [api, origen, destino])

  useEffect(() => { void cargar() }, [cargar])

  const subir = async (orderId: string, cargoTripId: string) => {
    setOcupado(orderId)
    setAviso(null)
    try {
      const r = await api<{ code: string; bultos: number }>(
        `/operator/cargo-trips/${cargoTripId}/encomiendas`,
        { method: 'POST', body: JSON.stringify({ orderId }) },
      )
      setAviso(`Remito ${r.code} creado con ${r.bultos} bulto(s).`)
      await cargar()
    } catch (e) {
      // El motivo del backend va tal cual: dice la ciudad y el problema
      // concreto («ese despacho va a bogota…»).
      setAviso(e instanceof Error ? e.message : 'No se pudo subir la encomienda')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <PackagePlus className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-slate-900 text-sm">Encomiendas esperando bus</h2>
          <p className="text-xs text-slate-500">
            Pedidos que un comercio manda a otra ciudad. Al subirlos a un despacho
            se crea su remito.
          </p>
        </div>
        <button
          onClick={() => void cargar()}
          aria-label="Actualizar"
          className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={origen}
          onChange={(e) => setOrigen(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          <option value="">Sale de: cualquiera</option>
          {municipios.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
        <select
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          <option value="">Llega a: cualquiera</option>
          {municipios.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
      </div>

      {aviso ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{aviso}</p>
      ) : null}

      {fallo ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>{fallo}</span>
        </p>
      ) : lista === null ? (
        <p className="flex items-center gap-2 py-4 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </p>
      ) : lista.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          No hay encomiendas esperando en esa ruta.
        </p>
      ) : (
        <ul className="space-y-2">
          {lista.map((e) => (
            <li key={e.orderId} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {e.orderRef} · {formatNumero(e.bultos, 0)} bulto(s)
                  </p>
                  <p className="text-xs text-slate-500">
                    {nombre(e.originCitySlug)} → {nombre(e.destCitySlug)} · {e.businessName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Para {e.clientName}
                    {e.clientPhone ? ` · ${e.clientPhone}` : ''} — {e.deliveryAddress}
                  </p>
                  {e.intercityFee != null ? (
                    <p className="text-xs text-slate-400">
                      El comercio cobró {formatCOP(e.intercityFee)} por el envío.
                    </p>
                  ) : null}
                </div>
              </div>

              <ul className="text-xs text-slate-500">
                {e.items.map((it, i) => (
                  <li key={i}>· {it.quantity} × {it.productName}</li>
                ))}
              </ul>

              {viajes.length === 0 ? (
                <p className="flex items-start gap-1.5 text-xs text-amber-700">
                  <Bus className="w-3.5 h-3.5 shrink-0 mt-px" />
                  {/* Sin esto el botón quedaría deshabilitado sin explicar por
                      qué, y el despachador no sabría que le falta crear el
                      despacho. */}
                  Crea un despacho en borrador para poder subirle encomiendas.
                </p>
              ) : (
                <select
                  disabled={ocupado === e.orderId}
                  defaultValue=""
                  onChange={(ev) => {
                    const id = ev.target.value
                    if (id) void subir(e.orderId, id)
                    ev.target.value = ''
                  }}
                  className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
                >
                  <option value="">Subir al despacho…</option>
                  {viajes.map((v) => (
                    <option key={v.id} value={v.id}>
                      Viaje {v.number}
                      {v.destCity ? ` → ${nombre(v.destCity)}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
