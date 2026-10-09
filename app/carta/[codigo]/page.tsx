'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, Clock, Loader2, Minus, Plus, Search, ShoppingBag, Star, Utensils } from 'lucide-react'
import { formatCOP } from '../../moneda'
import { BARRA_FIJA, BOTON, ESTADO, PASO, TARJETA } from '../../ui'
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
import { agruparVale, idDeSeccion, seccionConFotos } from '../reglas'

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

  // Unidades, no líneas: dos hamburguesas iguales son una línea del carrito y
  // «1 producto» en la barra se leería como que se perdió una.
  const unidades = useMemo(() => carrito.reduce((s, l) => s + l.cantidad, 0), [carrito])

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

  // ¿Vale la pena agrupar? Un local había puesto cada plato en su propia
  // categoría: los chips llevaban a UN producto y el encabezado repetía el
  // nombre del plato que tenía debajo. Sin agrupación útil, lista plana.
  const agrupar = useMemo(
    () => agruparVale(porSeccion.map(([, items]) => ({ items }))),
    [porSeccion],
  )


  // La sección que se está mirando, para resaltar su chip en la barra.
  //
  // Se observa con `IntersectionObserver` y no con el evento de scroll a
  // propósito: el scroll dispara decenas de veces por segundo y obliga a medir
  // cada encabezado en cada disparo, que en un teléfono de gama baja —el que
  // más probablemente tiene el comensal— se siente como un menú que se traba.
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null)
  const barraSecciones = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!agrupar) return
    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setSeccionActiva(visible.target.id)
      },
      // El margen de arriba descuenta la barra pegajosa: sin él, la sección se
      // marcaría como activa cuando su título ya está TAPADO por la barra.
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    )
    for (const [nombre] of porSeccion) {
      const el = document.getElementById(idDeSeccion(nombre))
      if (el) observador.observe(el)
    }
    return () => observador.disconnect()
  }, [porSeccion, agrupar])

  // El chip activo se trae a la vista dentro de su propia fila: con ocho
  // secciones, la que se está leyendo puede quedar fuera de la pantalla y la
  // barra parecería no responder.
  useEffect(() => {
    if (!seccionActiva || !barraSecciones.current) return
    const chip = barraSecciones.current.querySelector(`[data-seccion="${seccionActiva}"]`)
    chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [seccionActiva])

  function irASeccion(nombre: string) {
    const el = document.getElementById(idDeSeccion(nombre))
    if (!el) return
    // `scrollIntoView` dejaría el título debajo de la barra pegajosa, así que se
    // resta su alto a mano.
    const y = el.getBoundingClientRect().top + window.scrollY - 92
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

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
      <main className="min-h-screen grid place-items-center bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-50">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando la carta…
        </p>
      </main>
    )
  }

  if (error && !carta) {
    return (
      <main className="min-h-screen grid place-items-center bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-50 px-6">
        <div className="max-w-sm text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-3 font-bold text-slate-900">{error}</p>
          <p className="mt-1 text-sm text-slate-500">
            Vuelve a escanear el código de tu mesa, o pide con el mesero.
          </p>
          <button
            onClick={() => void cargar()}
            className={`${BOTON.principal} mt-4`}
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
      <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-50 px-4 py-6">
        <div className="mx-auto max-w-md">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800
                          p-6 text-center shadow-[0_8px_24px_rgba(5,150,105,0.18)]">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/15
                            ring-1 ring-inset ring-white/25">
              <Check className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-3 text-xl font-extrabold tracking-tight text-white">
              {etiquetaEstado(pedido.status)}
            </h1>
            <p className="mt-1 text-sm font-medium text-emerald-50/90">
              Mesa {pedido.tableLabel} · #{pedido.orderRef}
            </p>
            {pedido.prepMinutes ? (
              // `violet` no decía nada aquí: «la cocina lo tomó y va en N
              // minutos» es el estado «en curso», que en todo ZIPA es esmeralda.
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5
                            text-xs font-bold text-white ring-1 ring-inset ring-white/25">
                <Clock className="h-3.5 w-3.5" /> Listo en unos {pedido.prepMinutes} min
              </p>
            ) : pedido.status === 'pending' ? (
              <p className="mt-3 text-xs leading-relaxed text-emerald-50/80">
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
              className={`${BOTON.secundario} mt-3 w-full`}
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
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-50 pb-[max(7rem,calc(6rem+env(safe-area-inset-bottom)))]">
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
          // Sin portada no se deja un degradado vacío: la inicial del local
          // ocupa el sitio y la cabecera se lee como suya y no como un hueco.
          <div className="grid h-36 w-full place-items-center bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900">
            <span className="select-none text-6xl font-black text-white/15">
              {negocio.name.trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">{negocio.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/85">
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

        {/* La barra de navegar la carta: buscador y secciones.
            PEGAJOSA a propósito. Antes el buscador era un campo suelto que se
            iba con el scroll, y las secciones eran etiquetas grises de 10 px:
            con ocho secciones y cincuenta platos no había forma de llegar a las
            bebidas sin recorrerlo todo. `-mx-4 px-4` la saca a todo el ancho
            dentro del contenedor con relleno, para que la línea de abajo cruce
            la pantalla y se lea como una barra y no como una tarjeta más. */}
        {(negocio.products.length > 8 || agrupar) && (
          <div className="sticky top-0 z-20 -mx-4 mt-4 border-b border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur">
            {negocio.products.length > 8 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={buscando}
                  onChange={(e) => setBuscando(e.target.value)}
                  placeholder="Buscar en la carta…"
                  aria-label="Buscar en la carta"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm
                             placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white
                             focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {buscando && (
                  <button
                    type="button"
                    aria-label="Limpiar la búsqueda"
                    onClick={() => setBuscando('')}
                    className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center
                               rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <Plus className="h-4 w-4 rotate-45" />
                  </button>
                )}
              </div>
            )}

            {/* Con una sola sección los chips no filtrarían nada: no se dibujan.
                Misma regla que las píldoras de categoría del home del cliente. */}
            {agrupar && (
              <div
                ref={barraSecciones}
                className="-mx-4 flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {porSeccion.map(([seccion]) => {
                  const id = idDeSeccion(seccion)
                  const activa = seccionActiva === id
                  return (
                    <button
                      key={seccion}
                      type="button"
                      data-seccion={id}
                      onClick={() => irASeccion(seccion)}
                      aria-current={activa ? 'true' : undefined}
                      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                        activa
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {seccion}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {porSeccion.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">
            {buscando
              ? 'No encontramos nada con ese nombre.'
              : 'Este local todavía no tiene su carta publicada.'}
          </p>
        )}

        {porSeccion.map(([seccion, items], i) => (
          <section
            key={seccion}
            id={idDeSeccion(seccion)}
            className="mt-5 scroll-mt-24 animate-[entrar_.45s_ease-out_backwards]"
            style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
          >
            {/* Sin agrupación útil no hay encabezado: repetiría el nombre del
                único plato que tiene debajo. */}
            {agrupar && (
              <h2 className="mb-2 flex items-baseline gap-2 px-0.5">
                <span className="text-[17px] font-extrabold tracking-tight text-slate-900">
                  {seccion}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-400">
                  {items.length}
                </span>
              </h2>
            )}
            <ul className="space-y-2.5">
              {items.map((p) => (
                <li key={p.id}>
                  <Plato
                    producto={p}
                    conFoto={seccionConFotos(items)}
                    deshabilitado={sinMesa || sinServicioEnMesa || !negocio.isOpen}
                    // La hoja se abre SIEMPRE, tenga opciones o no.
                    //
                    // Antes solo se abría con `optionGroups.length > 0`, y la
                    // hoja es el único sitio donde se escribe la nota para la
                    // cocina. En una carta corriente casi ningún plato tiene
                    // variantes configuradas, así que en la práctica no había
                    // dónde poner «sin salsa» NUNCA — que es justo lo que se
                    // reportó. La app del cliente ya lo hacía bien; este menú
                    // se quedó atrás.
                    onElegir={() => setEligiendo(p)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {carrito.length > 0 && (
          <section id="tu-pedido" className={`mt-6 scroll-mt-24 p-4 ${TARJETA}`}>
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
                      className={PASO}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-slate-900">{l.cantidad}</span>
                    <button
                      type="button"
                      aria-label="Agregar uno"
                      onClick={() => setCarrito((prev) => prev.map((x) =>
                        x.key === l.key ? { ...x, cantidad: x.cantidad + 1 } : x))}
                      className={PASO}
                    >
                      <Plus className="h-4 w-4" />
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
        <div className={BARRA_FIJA}>
          <div className="mx-auto flex max-w-md items-center gap-3">
            {/* El total LLEVA al carrito. Antes era texto muerto y las
                cantidades solo se cambiaban en una tarjeta al final de la
                página: con una carta larga había que recorrerla entera para
                quitar un plato. */}
            <button
              type="button"
              onClick={() => document.getElementById('tu-pedido')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="shrink-0 rounded-lg px-1 text-left"
            >
              <p className="text-[11px] font-medium text-slate-500">
                {unidades} {unidades === 1 ? 'producto' : 'productos'}
              </p>
              <p className="text-lg font-bold leading-tight text-slate-900">{formatCOP(total)}</p>
            </button>
            <button
              onClick={() => void enviar()}
              disabled={!puedePedir || enviando}
              className={`${BOTON.principal} ml-auto flex-1 text-[15px]`}
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

function Plato({ producto: p, conFoto, deshabilitado, onElegir }: {
  producto: Producto
  conFoto: boolean
  deshabilitado: boolean
  onElegir: () => void
}) {
  return (
    <button
      type="button"
      disabled={deshabilitado}
      onClick={onElegir}
      className={`group flex w-full items-stretch gap-3 overflow-hidden text-left
                  transition-[transform,box-shadow] duration-150 active:scale-[0.985]
                  disabled:opacity-60 disabled:active:scale-100
                  ${TARJETA} hover:shadow-[0_2px_10px_rgba(15,23,42,0.07)]`}
    >
      {conFoto && (
        <div className="relative h-[88px] w-[88px] shrink-0 bg-slate-100">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagen(p.imageUrl)}
              alt={p.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            // El plato sin foto en una sección que sí las tiene no se deja en
            // blanco ni se le inventa una imagen: va su inicial.
            <span className="grid h-full w-full place-items-center text-2xl font-black text-slate-300">
              {p.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          {p.descuentoPct ? (
            <span className="absolute left-1 top-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              −{p.descuentoPct}%
            </span>
          ) : null}
        </div>
      )}

      {/* Con foto, el `gap-3` del contenedor ya separa; sin ella hay que dar el
          relleno a mano o el texto queda pegado al borde de la tarjeta. */}
      <div className={`min-w-0 flex-1 py-2.5 ${conFoto ? '' : 'pl-3.5'}`}>
        {p.masPedidoPuesto ? (
          <p className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
            #{p.masPedidoPuesto} más pedido
          </p>
        ) : null}
        <p className="truncate text-[15px] font-semibold leading-snug text-slate-900">{p.name}</p>
        {p.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{p.description}</p>
        )}
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[15px] font-bold text-slate-900">{formatCOP(p.price)}</span>
          {p.compareAtPrice ? (
            <span className="text-xs font-normal text-slate-400 line-through">
              {formatCOP(p.compareAtPrice)}
            </span>
          ) : null}
          {!conFoto && p.descuentoPct ? (
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
              −{p.descuentoPct}%
            </span>
          ) : null}
        </p>
      </div>

      {/* 44 px, no 32: es el objetivo táctil de `BOTON` y este botón se toca
          con el pulgar, de pie, con el teléfono en una mano. */}
      <span className="flex shrink-0 items-center pr-2.5">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white
                         transition-colors group-hover:bg-emerald-700 group-disabled:bg-slate-300">
          <Plus className="h-5 w-5" />
        </span>
      </span>
    </button>
  )
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
            // `p-1` sobre un icono de 28 px daba 36. Con cinco botones pegados,
            // tocar la cuarta y poner la tercera es el error típico — y una
            // calificación es justo lo que no conviene equivocar.
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg transition-transform active:scale-95 disabled:opacity-50"
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50">
      <button type="button" aria-label="Cerrar" className="flex-1" onClick={onCerrar} />
      <div className="max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* La foto del plato, que antes solo estaba en el listado a 56 px. Es
            lo que se está decidiendo comprar: aquí es donde tiene que verse. */}
        {producto.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagen(producto.imageUrl)}
            alt={producto.name}
            className="max-h-56 w-full rounded-t-3xl object-cover"
            style={{ aspectRatio: '16 / 10' }}
          />
        )}
        {/* El asa de arrastre: dice que esto se cierra tirando hacia abajo, que
            es lo que la mano intenta antes de buscar un botón. */}
        <div className="sticky top-0 z-10 bg-white/95 px-4 pt-3 backdrop-blur">
          <div className="mx-auto h-1 w-10 rounded-full bg-slate-300" />
          <button
            type="button"
            onClick={onCerrar}
            className="mt-2 inline-flex min-h-[40px] items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" /> Volver a la carta
          </button>
        </div>
        <div className="px-4">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{producto.name}</h2>
        {producto.description && (
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{producto.description}</p>
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
                    className="flex min-h-[44px] w-full items-center gap-2.5 py-2 text-left disabled:opacity-40"
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

        <label className="mt-5 block text-sm font-semibold text-slate-800">
          Algo para la cocina
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 140))}
            placeholder="Sin cebolla, término medio…"
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm
                       font-normal placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white
                       focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-400">
            Llega escrito a la plancha, no de boca en boca.
          </span>
        </label>

        {/* Esmeralda, no negro. Era el único botón principal de todo el flujo
            que iba en `slate-900`: dos primarios en la misma pantalla —este y
            «Enviar a la cocina»— no se leen como una decisión. */}
        <button
          type="button"
          disabled={!!falta}
          onClick={() => onAgregar(elegidas, resumen, nota.trim())}
          className={`${BOTON.principal} mt-5 w-full text-[15px]`}
        >
          {falta
            ? `Elige ${falta.name.toLowerCase()}`
            : `Agregar · ${formatCOP(Math.max(0, producto.price + recargo))}`}
        </button>
        </div>
      </div>
    </div>
  )
}
