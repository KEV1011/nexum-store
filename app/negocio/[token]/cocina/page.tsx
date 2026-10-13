'use client'

/**
 * El tablero de la cocina. Pensado para una tablet apoyada junto a la plancha.
 *
 * NO es el portal del dueño con otra pintura. Quien mira esta pantalla tiene
 * las manos ocupadas y la mira de lejos, así que:
 *
 *   * letra grande y pocas cosas — el plato, la cantidad y lo que va sin
 *     cebolla; nada de direcciones, totales ni cifras del día,
 *   * un solo botón por pedido, del tamaño de una mano con guante,
 *   * y mesa y domicilio en la MISMA lista, porque para cocinar da igual el
 *     destino y dos listas obligan a decidir cuál va antes.
 *
 * Fondo oscuro a propósito: una cocina tiene luz fuerte y la pantalla se
 * mira de reojo; el blanco a toda página deslumbra y lava los colores que
 * avisan de la demora.
 */

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ChefHat, Clock, Check, RotateCcw, Loader2, AlertTriangle, Wifi, WifiOff, Volume2, BellRing,
} from 'lucide-react'

import { BACKEND_URL, BACKEND_WS } from '../../../backend'
import { useOrderAlert } from '../useOrderAlert'

interface LineaCocina {
  productName: string
  quantity: number
  optionsSummary: string | null
  notes: string | null
}

interface PedidoCocina {
  id: string
  orderRef: string
  status: string
  mode: string
  tableLabel: string | null
  acceptedAt: string | null
  readyAt: string | null
  etaMinutes: number | null
  lineas: LineaCocina[]
}

/**
 * El respaldo por si el WebSocket se cae, no el canal principal.
 *
 * Lo que mueve esta pantalla es el socket del negocio (`business_auth`), que
 * es el mismo que ya usa el portal: así un plato marcado en el portal aparece
 * aquí al instante y al revés. La consulta periódica solo cubre el rato en
 * que el socket está reconectando — con el wifi de un local eso pasa — y por
 * eso puede ser lenta sin que se note.
 */
const RESPALDO_MS = 20000

/**
 * Los minutos que lleva, con las MISMAS reglas que el servidor: desde que
 * entró a cocina, congelado al marcarlo listo, y `null` cuando no se sabe.
 */
function minutosEnCocina(p: PedidoCocina, ahora: number): number | null {
  if (!p.acceptedAt) return null
  const desde = new Date(p.acceptedAt).getTime()
  const hasta = p.readyAt ? new Date(p.readyAt).getTime() : ahora
  const ms = hasta - desde
  if (ms < 0) return null
  return Math.floor(ms / 60000)
}

function demorado(p: PedidoCocina, ahora: number): boolean {
  if (p.etaMinutes == null || p.etaMinutes <= 0) return false
  const m = minutosEnCocina(p, ahora)
  return m != null && m > p.etaMinutes
}

function destino(p: PedidoCocina): string {
  if (p.mode === 'DINE_IN') return p.tableLabel ? `Mesa ${p.tableLabel}` : 'En el local'
  return 'Domicilio'
}

export default function CocinaPage({ params }: { params: Promise<{ token: string }> }) {
  // En Next 16 `params` es una Promise y hay que desenvolverla con `use()`.
  // Escrito como objeto plano, `token` sale `undefined` y la página pide
  // `/business/undefined/cocina` — que es exactamente el «Business not found
  // for token: undefined» con el que salió a producción. Las otras páginas
  // del portal ya lo hacían así.
  const { token } = use(params)
  const [pedidos, setPedidos] = useState<PedidoCocina[] | null>(null)
  const [platos, setPlatos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [conectado, setConectado] = useState(false)
  // El reloj avanza aunque no llegue nada del servidor: si solo se moviera
  // con cada carga, los minutos irían a saltos de ocho segundos.
  const [ahora, setAhora] = useState(() => Date.now())

  // ── Modo pase, para el mesero ────────────────────────────────────────────
  //
  // La misma pantalla sirve a dos personas con avisos OPUESTOS: al cocinero
  // le interesa que suene cuando ENTRA un plato, y al mesero cuando algo pasa
  // a LISTO. La misma campana para los dos suena el doble de veces y a los
  // dos días está quitada, así que el mesero abre esta URL con `?pase=1` en
  // su teléfono.
  //
  // NO hay cuentas de mesero ni modelo de personal, a propósito: en un local
  // de tres mesas eso es burocracia, y el enlace ya está protegido por el
  // token del negocio igual que el resto del portal.
  const buscar = useSearchParams()
  const esPase = buscar.get('pase') === '1'

  // Lo que había la vez anterior, para saber qué CAMBIÓ. `null` mientras no
  // se ha cargado nada: en la primera carga no suena, o abrir la pantalla con
  // ocho pedidos dentro sonaría ocho veces seguidas.
  const anterior = useRef<Map<string, boolean> | null>(null)
  const { avisarPedido, sonidoBloqueado, activarSonido } = useOrderAlert(
    // El contador del título: en el pase, lo que falta por recoger; en la
    // cocina, lo que falta por hacer.
    esPase
      ? (pedidos ?? []).filter((p) => p.readyAt).length
      : (pedidos ?? []).filter((p) => !p.readyAt).length,
  )

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/cocina`)
      const json = (await res.json()) as {
        success: boolean
        data?: { pedidos: PedidoCocina[]; platos: number }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos cargar la cocina.')
        return
      }
      setPedidos(json.data.pedidos)
      setPlatos(json.data.platos)
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

  // ── El socket del negocio, que es el MISMO del portal ─────────────────────
  //
  // Con esto un plato marcado en el portal aparece aquí al instante y al
  // revés. No se intenta aplicar el pedido que llega: se vuelve a pedir la
  // lista entera, que es barata y no puede desincronizarse —componer el
  // estado a partir de mensajes sueltos obliga a acertar con el orden de
  // llegada, y una cocina que se queda con un plato fantasma es peor que una
  // que tarda medio segundo.
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
            const msg = JSON.parse(evt.data as string) as Record<string, unknown>
            const t = msg['type']
            if (t === 'new_order' || t === 'order_update') void cargar()
            else if (t === 'business_auth_ok') setConectado(true)
            else if (t === 'business_auth_error') ws?.close()
          } catch {
            // Un mensaje mal formado no puede tumbar la cocina.
          }
        }
        ws.onclose = () => {
          setConectado(false)
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

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Suena cuando algo CAMBIA, no en cada carga.
  useEffect(() => {
    if (pedidos === null) return
    const ahoraMapa = new Map(pedidos.map((p) => [p.id, !!p.readyAt]))
    const antes = anterior.current
    anterior.current = ahoraMapa
    // Primera carga: se guarda el estado y no se avisa de nada.
    if (antes === null) return

    if (esPase) {
      // Al mesero: lo que acaba de quedar listo. Solo la transición, no los
      // que ya estaban listos cuando abrió la pantalla.
      const reciencito = pedidos.filter((p) => p.readyAt && antes.get(p.id) === false)
      if (reciencito.length > 0) {
        const p = reciencito[0]!
        avisarPedido('Plato listo', `${destino(p)} · ${p.orderRef}`)
      }
    } else {
      // Al cocinero: lo que acaba de entrar a la plancha.
      const nuevos = pedidos.filter((p) => !p.readyAt && !antes.has(p.id))
      if (nuevos.length > 0) {
        const p = nuevos[0]!
        const platos = p.lineas.reduce((s, l) => s + l.quantity, 0)
        avisarPedido('Pedido nuevo', `${destino(p)} · ${platos} plato(s)`)
      }
    }
  }, [pedidos, esPase, avisarPedido])

  async function marcar(p: PedidoCocina) {
    setMarcando(p.id)
    try {
      // Marcar va por la ruta que YA existe, que además avisa al repartidor
      // por WS y manda push al cliente. Deshacer es lo único propio de aquí:
      // esa ruta no permite volver atrás, y en una cocina el botón se toca
      // con prisa y con la mano ocupada.
      const res = p.readyAt
        ? await fetch(`${BACKEND_URL}/business/${token}/cocina/${p.id}/listo`, {
            method: 'DELETE',
          })
        : await fetch(`${BACKEND_URL}/business/${token}/client-orders/${p.id}/ready`, {
            method: 'POST',
          })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'No pudimos marcar el plato.')
        return
      }
      await cargar()
    } catch {
      setError('Sin conexión con el servidor.')
    } finally {
      setMarcando(null)
    }
  }

  const enCocina = (pedidos ?? []).filter((p) => !p.readyAt)
  const listos = (pedidos ?? []).filter((p) => p.readyAt)

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <ChefHat className="h-6 w-6 text-amber-400" />
        <h1 className="text-lg font-bold">{esPase ? 'Pase' : 'Cocina'}</h1>
        {/* Si el socket se cayó, la pantalla deja de ser «en vivo» y pasa a
            depender de la consulta de respaldo. Decirlo: una cocina que cree
            estar al día y lleva veinte segundos de retraso es peor que una
            que sabe que está reconectando. */}
        <span
          title={conectado ? 'En vivo' : 'Reconectando…'}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
            conectado ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/20 text-slate-400'
          }`}
        >
          {conectado ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {conectado ? 'En vivo' : 'Reconectando'}
        </span>
        {/* La carga real son PLATOS, no pedidos: «3 pedidos» y «11 platos»
            son cosas muy distintas para quien cocina. */}
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-300">
          {platos} {platos === 1 ? 'plato' : 'platos'} por hacer
        </span>
        {/* El navegador no deja sonar hasta que alguien toca la página. Sin
            este botón, el aviso fallaría EN SILENCIO y nadie sabría por qué
            no suena — que es justo lo que no puede pasar en una cocina. */}
        {sonidoBloqueado && (
          <button
            type="button"
            onClick={activarSonido}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-slate-950"
          >
            <Volume2 className="h-4 w-4" /> Activar el sonido
          </button>
        )}
        <a
          href={`/negocio/${token}/cocina${esPase ? '' : '?pase=1'}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5"
        >
          <BellRing className="h-4 w-4" />
          {esPase ? 'Ver como cocina' : 'Abrir el pase'}
        </a>
        <a
          href={`/negocio/${token}`}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-white/5"
        >
          Volver al portal
        </a>
      </header>

      {error && (
        <p className="flex items-center gap-2 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {pedidos === null && !error && (
        <p className="flex items-center gap-2 px-4 py-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
        </p>
      )}

      {pedidos !== null && pedidos.length === 0 && (
        <div className="px-4 py-16 text-center">
          <ChefHat className="mx-auto h-12 w-12 text-slate-700" />
          <p className="mt-3 text-lg font-semibold text-slate-400">
            No hay nada en la cocina
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Los pedidos aparecen aquí en cuanto los aceptas en el portal.
          </p>
        </div>
      )}

      {pedidos !== null && pedidos.length > 0 && (
        // En el pase la columna que importa es la de LISTOS: el mesero viene
        // a recoger, no a vigilar la plancha. Por eso van primero, que en un
        // teléfono es lo único que se ve sin desplazar.
        <div className={`grid gap-4 p-4 lg:grid-cols-2 ${esPase ? '[&>*:first-child]:order-2' : ''}`}>
          <Columna titulo="En la plancha" pedidos={enCocina} vacio="Todo hecho.">
            {enCocina.map((p) => (
              <Tarjeta
                key={p.id}
                pedido={p}
                ahora={ahora}
                ocupado={marcando === p.id}
                onMarcar={() => void marcar(p)}
              />
            ))}
          </Columna>
          <Columna
            titulo="Listos para salir"
            pedidos={listos}
            vacio="Nada listo todavía."
          >
            {listos.map((p) => (
              <Tarjeta
                key={p.id}
                pedido={p}
                ahora={ahora}
                ocupado={marcando === p.id}
                onMarcar={() => void marcar(p)}
              />
            ))}
          </Columna>
        </div>
      )}
    </main>
  )
}

function Columna({
  titulo,
  pedidos,
  vacio,
  children,
}: {
  titulo: string
  pedidos: PedidoCocina[]
  vacio: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        {titulo}
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{pedidos.length}</span>
      </h2>
      {pedidos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
          {vacio}
        </p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  )
}

function Tarjeta({
  pedido,
  ahora,
  ocupado,
  onMarcar,
}: {
  pedido: PedidoCocina
  ahora: number
  ocupado: boolean
  onMarcar: () => void
}) {
  const min = minutosEnCocina(pedido, ahora)
  const tarde = demorado(pedido, ahora)
  const listo = !!pedido.readyAt

  return (
    <article
      className={`rounded-2xl border p-4 ${
        tarde ? 'border-red-500/50 bg-red-500/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-white/10 px-2.5 py-1 text-sm font-bold">
          {destino(pedido)}
        </span>
        <span className="text-xs font-semibold text-slate-400">{pedido.orderRef}</span>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-sm font-bold ${
            tarde ? 'text-red-300' : 'text-slate-300'
          }`}
        >
          <Clock className="h-4 w-4" />
          {/* Sin reloj no se escribe un número: estos pedidos son de antes de
              que se registrara la hora de entrada, y un «0 min» se leería
              como que acaba de llegar. */}
          {min == null ? 'sin hora' : `${min} min`}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {pedido.lineas.map((l, i) => (
          <li key={i} className="flex gap-3">
            <span className="min-w-[2.2rem] rounded-lg bg-amber-500/20 px-2 py-0.5 text-center text-lg font-black text-amber-300">
              {l.quantity}
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold leading-tight">{l.productName}</span>
              {l.optionsSummary && (
                <span className="block text-sm text-slate-300">{l.optionsSummary}</span>
              )}
              {/* Lo que el cliente pidió de viva voz. En ámbar y no en gris:
                  es lo único de la tarjeta que, si se pasa por alto, obliga a
                  rehacer el plato. */}
              {l.notes && (
                <span className="mt-0.5 block rounded-md bg-amber-500/15 px-2 py-1 text-sm font-semibold text-amber-200">
                  {l.notes}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onMarcar}
        disabled={ocupado}
        className={`mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors disabled:opacity-60 ${
          listo
            ? 'border border-white/15 text-slate-300 hover:bg-white/5'
            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
        }`}
      >
        {ocupado ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : listo ? (
          <>
            <RotateCcw className="h-5 w-5" /> Volver a la plancha
          </>
        ) : (
          <>
            <Check className="h-5 w-5" /> Listo
          </>
        )}
      </button>
    </article>
  )
}
