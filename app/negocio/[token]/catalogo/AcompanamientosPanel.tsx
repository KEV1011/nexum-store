'use client'

import { useMemo, useState } from 'react'
import { CupSoda, Loader2, X } from 'lucide-react'

import { formatCOP } from '../../../moneda'
import { TARJETA } from '../../../ui'
import { BACKEND_URL } from '../../../backend'

const INPUT =
  'w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

interface ProductoMin {
  id: string
  name: string
  price: number
  category: string
  isAvailable: boolean
  suggestAsAddon?: boolean
}

/**
 * Las bebidas y acompañamientos que el local ofrece antes de pagar.
 *
 * Cada uno es un PRODUCTO del catálogo, no una adición: descuenta existencias
 * y entra en el reporte de ventas. Lo único que lo distingue es que la app y
 * la carta del QR se lo proponen al cliente al cerrar el pedido («Acompaña tu
 * pedido»). Antes se marcaba de a uno, buscando cada producto en la lista y
 * tocando su botón; aquí se ven todos juntos y se añaden desde un buscador.
 */
export function AcompanamientosPanel({
  token,
  productos,
  onCambio,
}: {
  token: string
  productos: ProductoMin[]
  onCambio: (p: ProductoMin) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const marcados = useMemo(() => productos.filter((p) => p.suggestAsAddon), [productos])

  // Para añadir se ofrecen primero las secciones que suenan a bebida: es lo
  // que el dueño viene a buscar aquí, y en una carta de cuarenta platos la
  // gaseosa queda al fondo.
  const candidatos = useMemo(() => {
    const q = sinTildes(busqueda)
    return productos
      .filter((p) => !p.suggestAsAddon)
      .filter((p) => !q || sinTildes(`${p.name} ${p.category}`).includes(q))
      .sort((a, b) => Number(pareceBebida(b)) - Number(pareceBebida(a)) || a.name.localeCompare(b.name, 'es'))
      .slice(0, 8)
  }, [productos, busqueda])

  async function marcar(p: ProductoMin, valor: boolean) {
    setOcupado(p.id)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestAsAddon: valor }),
      })
      const json = (await res.json()) as { success: boolean; data?: ProductoMin; error?: string }
      if (json.success && json.data) {
        onCambio(json.data)
        if (valor) setBusqueda('')
      } else {
        setError(json.error ?? 'No se pudo guardar.')
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section className={`${TARJETA} p-5 space-y-3`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
          <CupSoda className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Bebidas y acompañamientos</h2>
          <p className="text-xs text-slate-500">
            Lo que se le ofrece al cliente antes de pagar. Son productos de tu
            catálogo: descuentan existencias y salen en tu reporte de ventas.
          </p>
        </div>
      </div>

      {marcados.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
          Todavía no ofreces ninguno. Busca abajo tus bebidas o acompañamientos
          (gaseosas, jugos, papas…) y añádelos.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {marcados.map((p) => (
            <li
              key={p.id}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-full bg-amber-50 pl-3.5 pr-1 text-sm text-amber-900 ring-1 ring-amber-200 ${
                p.isAvailable ? '' : 'opacity-60'
              }`}
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-amber-800/70">{formatCOP(p.price)}</span>
              {!p.isAvailable && <span className="text-xs text-amber-800/70">· agotado</span>}
              <button
                type="button"
                onClick={() => void marcar(p, false)}
                disabled={ocupado === p.id}
                aria-label={`Dejar de ofrecer ${p.name}`}
                className="grid h-8 w-8 place-items-center rounded-full text-amber-700 hover:bg-amber-100"
              >
                {ocupado === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <input
          className={INPUT}
          placeholder="Buscar en tu catálogo para añadir (ej: gaseosa)"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          maxLength={40}
        />
        {candidatos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {candidatos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void marcar(p, true)}
                disabled={ocupado === p.id}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white px-3.5 text-sm text-slate-700 ring-1 ring-slate-200 hover:ring-amber-300"
              >
                {ocupado === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span aria-hidden>+</span>}
                {p.name}
                <span className="text-xs text-slate-400">{formatCOP(p.price)}</span>
              </button>
            ))}
          </div>
        ) : busqueda ? (
          <p className="text-xs text-slate-500">
            Ningún producto de tu catálogo coincide con «{busqueda}». Créalo abajo
            y marca «Es una bebida o acompañamiento».
          </p>
        ) : null}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const PALABRAS_BEBIDA = ['bebida', 'gaseosa', 'jugo', 'limonada', 'agua', 'cerveza', 'malteada', 'cafe', 'te ', 'soda', 'refresco', 'acompan', 'papas', 'adicional']

/** ¿Suena a bebida o acompañamiento? Solo ordena la lista; nunca decide nada. */
export function pareceBebida(p: { name: string; category: string }): boolean {
  const t = ` ${sinTildes(`${p.category} ${p.name}`)} `
  return PALABRAS_BEBIDA.some((w) => t.includes(w))
}
