'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, Clock, Loader2, Minus, Plus, ShoppingBag, Star, Utensils } from 'lucide-react'
import { formatCOP } from '../../moneda'
import {
  ApiError,
  etiquetaEstado,
  imagen,
  llamar,
  olvidarPedido,
  pedidoRecordado,
  recordarPedido,
  type Carta,
  type GrupoOpciones,
  type PedidoEnMesa,
  type Producto,
} from '../api'
import { LineaTiempo } from '../LineaTiempo'

/**
 * La carta del restaurante, abierta desde el QR de la mesa.
 *
 * POR QUÉ ESTO Y NO LA APP. El comensal ya está sentado. Pedirle que instale
 * algo para almorzar es perderlo: escanea, pide, y la cocina lo recibe escrito
 * con sus adiciones y su «sin cebolla». No hay cuenta, no hay dirección y no
 * hay domicilio que cobrar — el plato lo lleva el mesero.
 *
 * SE PAGA EN EL LOCAL, y se dice en pantalla. Por aquí no pasa un peso: si el
 * comensal creyera que ya pagó, la discusión sería en la caja.
 */
export default function CartaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = use(params)

  const [carta, setCarta] = useState<Carta | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mesa, setMesa] = useState<string | null>(null)
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [eligiendo, setEligiendo] = useState<Producto | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pedido, setPedido] = useState<PedidoEnMesa | null>(null)
  const [buscando, setBuscando] = useState('')

  // La mesa viaja en el QR (`?mesa=5`). Se lee de `window` y no con
  // `useSearchParams` a propósito: ese hook obliga a envolver la página en un
  // Suspense para poder compilarla, y aquí no aporta nada.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setMesa(p.get('mesa'))
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setCarta(await llamar<Carta>(`/carta/${encodeURIComponent(codigo)}`))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos cargar la carta.')
    } finally {
      setCargando(false)
    }
  }, [codigo])

  useEffect(() => { void cargar() }, [cargar])

  // Recuperar el pedido de este teléfono. Sin esto, recargar la página —o que
  // el navegador descarte la pestaña al cambiar de app, que es lo normal en un
  // celular— deja al comensal sin su pedido y sin forma de encontrarlo: no hay
  // cuenta, y el id solo lo tenía la pestaña que se cerró.
  useEffect(() => {
    const guardado = pedidoRecordado(codigo)
    if (!guardado) return
    void llamar<PedidoEnMesa>(`/carta/${encodeURIComponent(codigo)}/pedido/${guardado}`)
      .then(setPedido)
      // Si ya no existe (se limpió la base, o pasó demasiado), se olvida en vez
      // de dejar al comensal mirando un error que no puede arreglar.
      .catch(() => olvidarPedido(codigo))
  }, [codigo])

  // Con el pedido ya enviado, se sondea el estado: el comensal quiere saber si
  // la cocina lo aceptó y en cuántos minutos. Cada 10 s, y se para al servirse.
  useEffect(() => {
    if (!pedido || pedido.status === 'delivered' || pedido.status === 'cancelled') return
    const t = setInterval(() => {
      void llamar<PedidoEnMesa>(`/carta/${encodeURIComponent(codigo)}/pedido/${pedido.id}`)
        .then(setPedido)
        .catch(() => { /* un sondeo perdido no es un error que mostrar */ })
    }, 10_000)
    return () => clearInterval(t)
  }, [codigo, pedido])

  const total = useMemo(
    () => carrito.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0),
    [carrito],
  )

  const productos = useMemo(() => {
    const todos = (carta?.business.products ?? []).filter((p) => p.isAvailable)
    const q = buscando.trim().toLowerCase()
    if (!q) return todos
    return todos.filter((p) =>
      p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
  }, [carta, buscando])

  const porSeccion = useMemo(() => {
    const mapa = new Map<string, Producto[]>()
    for (const p of productos) {
      const k = p.category || 'General'
      if (!mapa.has(k)) mapa.set(k, [])
      mapa.get(k)!.push(p)
    }
    return [...mapa.entries()]
  }, [productos])

  function agregar(producto: Producto, opciones: string[], resumen: string, nota: string) {
    const recargo = producto.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => opciones.includes(o.id))
      .reduce((s, o) => s + o.priceDelta, 0)
    setCarrito((prev) => [...prev, {
      key: `${producto.id}-${Date.now()}`,
      productId: producto.id,
      nombre: producto.name,
      precioUnitario: Math.max(0, producto.price + recargo),
      cantidad: 1,
      optionIds: opciones,
      resumen,
      nota,
    }])
    setEligiendo(null)
  }

  async function enviar() {
    setEnviando(true)
    setError(null)
    try {
      const creado = await llamar<PedidoEnMesa>(`/carta/${encodeURIComponent(codigo)}/pedido`, {
        method: 'POST',
        body: {
          mesa,
          items: carrito.map((l) => ({
            productId: l.productId,
            quantity: l.cantidad,
            optionIds: l.optionIds,
            ...(l.nota ? { notes: l.nota } : {}),
          })),
        },
      })
      setPedido(creado)
      recordarPedido(codigo, creado.id)
      setCarrito([])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos enviar tu pedido.')
    } finally {
      setEnviando(false)
    }
  }

  // ── Estados de la pantalla ─────────────────────────────────────────────────

  if (cargando) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando la carta…
        </p>
      </main>
    )
  }

  if (error && !carta) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50 px-6">
        <div className="max-w-sm text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-3 font-bold text-slate-900">{error}</p>
          <p className="mt-1 text-sm text-slate-500">
            Vuelve a escanear el código de tu mesa, o pide con el mesero.
          </p>
          <button
            onClick={() => void cargar()}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Intentar de nuevo
          </button>
        </div>
      </main>
    )
  }

  const negocio = carta!.business

  // Pedido ya enviado: la pantalla pasa a ser su estado.
  if (pedido) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-emerald-200 bg-white p-5 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="mt-3 font-bold text-slate-900">{etiquetaEstado(pedido.status)}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Mesa {pedido.tableLabel} · #{pedido.orderRef}
            </p>
            {pedido.prepMinutes ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                <Clock className="h-3.5 w-3.5" /> Listo en unos {pedido.prepMinutes} min
              </p>
            ) : pedido.status === 'pending' ? (
              <p className="mt-3 text-xs text-slate-500">
                La cocina lo está viendo. Si pasan varios minutos sin respuesta,
                avísale al mesero.
              </p>
            ) : null}
          </div>

          {pedido.timeline && pedido.timeline.length > 0 && (
            <LineaTiempo pasos={pedido.timeline} />
          )}

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            {pedido.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 py-1 text-sm">
                <span className="text-slate-700">
                  <span className="font-semibold">{it.quantity}×</span> {it.productName}
                  {it.optionsSummary && (
                    <span className="block text-xs text-slate-500">{it.optionsSummary}</span>
                  )}
                  {it.notes && (
                    <span className="block text-xs font-medium text-amber-700">“{it.notes}”</span>
                  )}
                </span>
                <span className="shrink-0 text-slate-500">{formatCOP(it.subtotal)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
              <span>Total</span>
              <span>{formatCOP(pedido.total)}</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Se paga en el local, al mesero o en la caja. Por la app no se cobra nada.
            </p>
          </div>

          {pedido.status === 'delivered' && (
            <Estrellas
              codigo={codigo}
              pedido={pedido}
              onCalificado={(r) => setPedido({ ...pedido, rating: r })}
            />
          )}

          {pedido.status !== 'cancelled' && (
            <button
              onClick={() => { olvidarPedido(codigo); setPedido(null) }}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Pedir algo más
            </button>
          )}
        </div>
      </main>
    )
  }

  const sinMesa = !mesa
  const sinServicioEnMesa = carta!.tables.length === 0
  const puedePedir = !sinMesa && !sinServicioEnMesa && negocio.isOpen && carrito.length > 0

  return (
    <main className="min-h-screen bg-slate-50 pb-28">
      {/* Cabecera con la portada del local */}
      <header className="relative">
        {negocio.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagen(negocio.imageUrl)}
            alt={negocio.name}
            className="h-36 w-full object-cover"
          />
        ) : (
          <div className="h-24 w-full bg-gradient-to-br from-slate-800 to-slate-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className="text-lg font-bold text-white">{negocio.name}</h1>
          <p className="flex items-center gap-2 text-xs text-white/80">
            {negocio.rating != null ? (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {negocio.rating.toFixed(1)}
                <span className="text-white/60">({negocio.ratingCount})</span>
              </span>
            ) : (
              <span className="text-white/70">Nuevo</span>
            )}
            {mesa && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-semibold">
                <Utensils className="h-3 w-3" /> Mesa {mesa}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4">
        {/* Los tres motivos por los que no se puede pedir son distintos y se
            arreglan distinto: no hay mesa en el enlace, el local no tiene el
            servicio activado, o está cerrado. */}
        {sinMesa && (
          <Aviso tono="amber">
            No sabemos en qué mesa estás. Escanea el código que está en tu mesa
            para poder pedir desde aquí.
          </Aviso>
        )}
        {!sinMesa && sinServicioEnMesa && (
          <Aviso tono="amber">
            {negocio.name} todavía no tiene el pedido en mesa activado. Puedes
            ver la carta y pedir con el mesero.
          </Aviso>
        )}
        {!negocio.isOpen && (
          <Aviso tono="red">
            {negocio.cerradoMotivo
              ? `No está tomando pedidos: ${negocio.cerradoMotivo.toLowerCase()}.`
              : 'No está tomando pedidos en este momento.'}
          </Aviso>
        )}

        {negocio.products.length > 8 && (
          <input
            value={buscando}
            onChange={(e) => setBuscando(e.target.value)}
            placeholder="Buscar en la carta…"
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm"
          />
        )}

        {porSeccion.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">
            {buscando
              ? 'No encontramos nada con ese nombre.'
              : 'Este local todavía no tiene su carta publicada.'}
          </p>
        )}

        {porSeccion.map(([seccion, items]) => (
          <section key={seccion} className="mt-5">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">{seccion}</h2>
            <ul className="mt-2 space-y-2">
              {items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={sinMesa || sinServicioEnMesa || !negocio.isOpen}
                    onClick={() => {
                      if (p.optionGroups.length > 0) setEligiendo(p)
                      else agregar(p, [], '', '')
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left disabled:opacity-60"
                  >
                    {p.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagen(p.imageUrl)}
                        alt={p.name}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                      {p.description && (
                        <p className="line-clamp-2 text-xs text-slate-500">{p.description}</p>
                      )}
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {formatCOP(p.price)}
                        {p.compareAtPrice ? (
                          <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">
                            {formatCOP(p.compareAtPrice)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-white">
                      <Plus className="h-4 w-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {carrito.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Tu pedido</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {carrito.map((l) => (
                <li key={l.key} className="flex items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">{l.nombre}</p>
                    {l.resumen && <p className="text-xs text-slate-500">{l.resumen}</p>}
                    {l.nota && (
                      <p className="text-xs font-medium text-amber-700">“{l.nota}”</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Quitar uno"
                      onClick={() => setCarrito((prev) => prev.flatMap((x) =>
                        x.key !== l.key ? [x] : x.cantidad > 1 ? [{ ...x, cantidad: x.cantidad - 1 }] : []))}
                      className="grid h-7 w-7 place-items-center rounded-full border border-slate-300 text-slate-600"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold">{l.cantidad}</span>
                    <button
                      type="button"
                      aria-label="Agregar uno"
                      onClick={() => setCarrito((prev) => prev.map((x) =>
                        x.key === l.key ? { ...x, cantidad: x.cantidad + 1 } : x))}
                      className="grid h-7 w-7 place-items-center rounded-full border border-slate-300 text-slate-600"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold text-slate-800">
                    {formatCOP(l.precioUnitario * l.cantidad)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">
              Se paga en el local. Por la app no se cobra nada.
            </p>
          </section>
        )}

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {/* Barra de envío */}
      {carrito.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div>
              <p className="text-[11px] text-slate-500">Total</p>
              <p className="text-lg font-bold text-slate-900">{formatCOP(total)}</p>
            </div>
            <button
              onClick={() => void enviar()}
              disabled={!puedePedir || enviando}
              className="ml-auto inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {enviando
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                : <><ShoppingBag className="h-4 w-4" /> Enviar a la cocina</>}
            </button>
          </div>
        </div>
      )}

      {eligiendo && (
        <HojaOpciones
          producto={eligiendo}
          onCerrar={() => setEligiendo(null)}
          onAgregar={(ids, resumen, nota) => agregar(eligiendo, ids, resumen, nota)}
        />
      )}
    </main>
  )
}

interface LineaCarrito {
  key: string
  productId: string
  nombre: string
  precioUnitario: number
  cantidad: number
  optionIds: string[]
  resumen: string
  nota: string
}

/**
 * Las estrellas del comensal.
 *
 * POR QUÉ IMPORTA: hasta ahora la nota de un restaurante salía SOLO de sus
 * domicilios, porque calificar exigía tener cuenta y en la mesa no hay
 * ninguna. Para la mayoría de los restaurantes el salón es lo que más venden,
 * así que su reputación se estaba calculando sobre la parte pequeña.
 *
 * Se puede corregir: quien tocó la estrella equivocada no se queda con ella.
 */
function Estrellas({ codigo, pedido, onCalificado }: {
  codigo: string
  pedido: PedidoEnMesa
  onCalificado: (r: number) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const puesta = pedido.rating ?? 0

  async function calificar(estrellas: number) {
    setEnviando(true)
    setError(null)
    try {
      await llamar(`/carta/${encodeURIComponent(codigo)}/pedido/${pedido.id}/calificar`, {
        method: 'POST',
        body: { estrellas },
      })
      onCalificado(estrellas)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos guardar tu calificación.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <p className="text-sm font-semibold text-slate-800">
        {puesta > 0 ? '¡Gracias por calificar!' : '¿Qué tal estuvo?'}
      </p>
      <div className="mt-2 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={enviando}
            aria-label={`${n} estrella${n === 1 ? '' : 's'}`}
            onClick={() => void calificar(n)}
            className="p-1 disabled:opacity-50"
          >
            <Star
              className={`h-7 w-7 ${
                n <= puesta ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
              }`}
            />
          </button>
        ))}
      </div>
      {puesta > 0 && (
        <p className="mt-1 text-[11px] text-slate-400">Puedes cambiarla si te equivocaste.</p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function Aviso({ tono, children }: { tono: 'amber' | 'red'; children: React.ReactNode }) {
  const clases = tono === 'amber'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-red-200 bg-red-50 text-red-700'
  return (
    <p className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${clases}`}>
      <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Las opciones de un plato (tamaño, adiciones, quitar) y la nota para la cocina.
 *
 * El «sin cebolla» escrito aquí es media razón de ser de todo esto: dicho al
 * mesero se pierde por el camino, escrito llega a la plancha.
 *
 * El precio que se muestra es el del catálogo más los recargos, pero **el que
 * se cobra lo recalcula el servidor** con los mismos ids. Si no, bastaría con
 * editar lo que manda el navegador.
 */
function HojaOpciones({ producto, onCerrar, onAgregar }: {
  producto: Producto
  onCerrar: () => void
  onAgregar: (ids: string[], resumen: string, nota: string) => void
}) {
  const [elegidas, setElegidas] = useState<string[]>([])
  const [nota, setNota] = useState('')

  function alternar(grupo: GrupoOpciones, id: string) {
    setElegidas((prev) => {
      const delGrupo = grupo.options.map((o) => o.id)
      const yaEsta = prev.includes(id)
      if (yaEsta) return prev.filter((x) => x !== id)
      // Con un solo elegible el grupo se comporta como un radio: elegir el
      // segundo tamaño quita el primero en vez de sumar los dos.
      if (grupo.maxSelect === 1) return [...prev.filter((x) => !delGrupo.includes(x)), id]
      const cuantas = prev.filter((x) => delGrupo.includes(x)).length
      if (grupo.maxSelect > 0 && cuantas >= grupo.maxSelect) return prev
      return [...prev, id]
    })
  }

  // Un grupo obligatorio sin elegir bloquea el botón, y se dice CUÁL falta: un
  // botón apagado sin motivo se lee como que la app no funciona.
  const falta = producto.optionGroups.find((g) => {
    const minimo = g.required ? Math.max(1, g.minSelect) : g.minSelect
    return elegidas.filter((id) => g.options.some((o) => o.id === id)).length < minimo
  })

  const recargo = producto.optionGroups
    .flatMap((g) => g.options)
    .filter((o) => elegidas.includes(o.id))
    .reduce((s, o) => s + o.priceDelta, 0)

  const resumen = producto.optionGroups
    .flatMap((g) => g.options)
    .filter((o) => elegidas.includes(o.id))
    .map((o) => o.name)
    .join(', ')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40">
      <button type="button" aria-label="Cerrar" className="flex-1" onClick={onCerrar} />
      <div className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4">
        <button
          type="button"
          onClick={onCerrar}
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Volver a la carta
        </button>
        <h2 className="text-base font-bold text-slate-900">{producto.name}</h2>
        {producto.description && (
          <p className="mt-0.5 text-xs text-slate-500">{producto.description}</p>
        )}

        {producto.optionGroups.map((g) => (
          <section key={g.id} className="mt-4">
            <h3 className="text-sm font-semibold text-slate-800">
              {g.name}
              {g.required && <span className="ml-1 text-xs font-normal text-red-600">obligatorio</span>}
              {g.maxSelect > 1 && (
                <span className="ml-1 text-xs font-normal text-slate-400">
                  elige hasta {g.maxSelect}
                </span>
              )}
            </h3>
            <ul className="mt-1 divide-y divide-slate-100">
              {g.options.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={!o.isAvailable}
                    onClick={() => alternar(g, o.id)}
                    className="flex w-full items-center gap-2 py-2 text-left disabled:opacity-40"
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center border ${
                      g.maxSelect === 1 ? 'rounded-full' : 'rounded'
                    } ${elegidas.includes(o.id) ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
                      {elegidas.includes(o.id) && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="flex-1 text-sm text-slate-700">
                      {o.name}
                      {!o.isAvailable && <span className="ml-1 text-xs text-slate-400">agotado</span>}
                    </span>
                    {o.priceDelta !== 0 && (
                      <span className="text-xs text-slate-500">
                        {o.priceDelta > 0 ? `+${formatCOP(o.priceDelta)}` : `−${formatCOP(-o.priceDelta)}`}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <label className="mt-4 block text-sm font-semibold text-slate-800">
          Algo para la cocina
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 140))}
            placeholder="Sin cebolla, término medio…"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
          />
        </label>

        <button
          type="button"
          disabled={!!falta}
          onClick={() => onAgregar(elegidas, resumen, nota.trim())}
          className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {falta
            ? `Elige ${falta.name.toLowerCase()}`
            : `Agregar · ${formatCOP(Math.max(0, producto.price + recargo))}`}
        </button>
      </div>
    </div>
  )
}
