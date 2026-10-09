'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import { ZipaLogo, ZipaLoading } from '../../ZipaLogo'
import { useOrderAlert } from './useOrderAlert'
import { PortalTabs } from './PortalTabs'
import Link from 'next/link'
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  Activity,
  ChevronRight,
  Wifi,
  WifiOff,
  ShoppingBag,
  Bell,
  UtensilsCrossed,
  Utensils,
  Settings,
} from 'lucide-react'

import { formatCOP } from '../../moneda'
import { BOTON, CONTENEDOR, ESTADO, TARJETA, TARJETA_NUEVA, TINTE_ESTADO, type Estado } from '../../ui'
// ─── Types ────────────────────────────────────────────────────────────────────

type DeliveryOrderStatus = 'pending' | 'at_pickup' | 'in_transit' | 'delivered'
type ClientOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'driverToPickup' | 'atPickup' | 'inTransit' | 'delivered' | 'cancelled'

interface Order {
  id: string
  ref: string
  customerName: string
  customerAddress: string
  status: DeliveryOrderStatus
  fare: number
  createdAt: string
  hasPickupProof: boolean
  hasSignature: boolean
  hasFullCustody: boolean
  custodyEvents: Array<{ type: string; timestamp: string; hasProof: boolean }>
  driverName: string
  driverPhone: string
}

interface ClientOrder {
  id: string
  orderRef: string
  businessId: string
  businessName: string
  status: ClientOrderStatus
  /** Cómo se sirve. Ausente = domicilio (pedidos anteriores a esta función). */
  mode?: 'DELIVERY' | 'DINE_IN'
  /** La mesa, en los pedidos del salón. Es lo que la cocina tiene que ver. */
  tableLabel?: string
  subtotal: number
  deliveryFee: number
  total: number
  /** «Nequi», «Llave Bre-B», «Efectivo»… lo redacta el servidor. */
  paymentLabel?: string
  /** Si el dinero lo recibe el repartidor en la puerta o ya está cobrado. */
  cobraElRepartidor?: boolean
  etaMinutes: number
  items: Array<{
    productName: string; quantity: number; unitPrice: number; subtotal: number
    // Compuesto por el servidor desde el catálogo: es lo que se cobró.
    optionsSummary?: string
    // Lo que el cliente le dijo a la cocina.
    notes?: string
  }>
  deliveryAddress: string
  driverName?: string
  driverPhone?: string
  hasSignature: boolean
  createdAt: string
  pickedUpAt?: string
  deliveredAt?: string
  pickupPhotoUrl?: string
  deliveryPhotoUrl?: string
  signatureUrl?: string
  signedByName?: string
  /** PIN que el negocio dicta al repartidor para entregarle el pedido. */
  pickupPin?: string
  prepMinutes?: number
  acceptedAt?: string
  readyAt?: string
}

interface BusinessStats {
  total: number
  inTransit: number
  delivered: number
  custodyPct: number
  // ── Salón. Van aparte de los de domicilio a propósito: un pedido en mesa no
  // tiene repartidor, así que mezclarlo en «En tránsito» o en la custodia no
  // significaría nada.
  enMesa?: number
  servidosEnMesa?: number
  enMesaEnCurso?: number
  ventaSalon?: number
  ventaDomicilio?: number
}

interface ApiResponse {
  business?: { name: string; token: string }
  orders: Order[]
  stats: BusinessStats
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Producción (Render) sin NEXT_PUBLIC_BACKEND_URL → backend real, no localhost
// (Next.js hornea este valor en el bundle del navegador en tiempo de build).
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

const WS_URL = (() => {
  try {
    const u = new URL(BACKEND_URL)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return u.toString()
  } catch {
    return 'wss://nexum-api-trxr.onrender.com'
  }
})()

// Las fotos de prueba llegan como ruta relativa (/uploads/…) en modo disco;
// con R2 llegan absolutas y pasan intactas.
function resolveImg(url?: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
}

// ─── Client Order Badge ───────────────────────────────────────────────────────

/**
 * El estado del pedido, en los cuatro que SIGNIFICAN algo.
 *
 * Antes eran seis tintes decorativos —naranja, ámbar, violeta, azul, esmeralda,
 * slate— y entre ellos no había ninguna jerarquía: un pedido entregado gritaba
 * igual que uno recién llegado. Ahora solo el que PIDE ACCIÓN usa el ámbar, lo
 * que va bien es verde y lo terminado se apaga a gris, de modo que la vista se
 * va sola a lo único que hay que atender.
 *
 * «Driver en camino» y «Driver en local» decían *driver*, que en el mostrador
 * de un local no significa nada; ahora dicen repartidor.
 */
const CLIENT_STATUS: Record<ClientOrderStatus, { label: string; className: string }> = {
  pending:        { label: 'Nuevo · acepta',        className: ESTADO.nuevo },
  confirmed:      { label: 'Confirmado',            className: ESTADO.enCurso },
  preparing:      { label: 'En preparación',        className: ESTADO.enCurso },
  driverToPickup: { label: 'Repartidor en camino',  className: ESTADO.enCurso },
  atPickup:       { label: 'Repartidor en el local', className: ESTADO.enCurso },
  inTransit:      { label: 'En camino',             className: ESTADO.enCurso },
  delivered:      { label: 'Entregado',             className: ESTADO.listo },
  cancelled:      { label: 'Cancelado',             className: ESTADO.listo },
}

function ClientStatusBadge({ status }: { status: ClientOrderStatus }) {
  const { label, className } = CLIENT_STATUS[status] ?? CLIENT_STATUS.pending
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}>
      {label}
    </span>
  )
}

// ─── Client Order Card ────────────────────────────────────────────────────────

function ClientOrderCard({ order, token, onChanged }: {
  order: ClientOrder
  token: string
  onChanged: (updated: ClientOrder) => void
}) {
  const isNew = order.status === 'pending'
  const [prep, setPrep] = useState('20')
  const [busy, setBusy] = useState<null | 'accept' | 'reject' | 'ready' | 'servido'>(null)
  // Un pedido del salón: no hay repartidor, ni domicilio, ni dirección.
  const enMesa = order.mode === 'DINE_IN'
  const [actionError, setActionError] = useState<string | null>(null)

  async function act(kind: 'accept' | 'reject' | 'ready' | 'servido') {
    setBusy(kind)
    setActionError(null)
    try {
      const body = kind === 'accept' ? { prepMinutes: Number(prep) } : {}
      const res = await fetch(`${BACKEND_URL}/business/${token}/client-orders/${order.id}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { success: boolean; data?: ClientOrder; error?: string }
      if (!res.ok || !json.success || !json.data) {
        setActionError(json.error ?? 'No se pudo completar la acción')
        return
      }
      onChanged(json.data)
    } catch {
      setActionError('Error de conexión')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={`${isNew ? TARJETA_NUEVA : TARJETA} p-4 transition-all`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-bold text-slate-900 text-sm">#{order.orderRef}</p>
          <p className="text-xs text-slate-400 mt-0.5">{formatTime(order.createdAt)}</p>
        </div>
        <ClientStatusBadge status={order.status} />
      </div>

      {enMesa ? (
        /* Lo único que la cocina necesita para servir el plato. Grande, porque
           es el dato que se busca de un vistazo con el salón lleno. */
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Utensils className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="text-sm font-bold text-slate-900">Mesa {order.tableLabel}</span>
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            En el local
          </span>
        </div>
      ) : (
        <div className="text-xs text-slate-500 mb-3 flex items-start gap-1.5">
          <span className="shrink-0 mt-0.5">📍</span>
          <span className="truncate">{order.deliveryAddress}</span>
        </div>
      )}

      {/* PIN de recogida: el dueño se lo dicta al repartidor al entregarle el
          pedido. Sin él, el repartidor no puede marcarlo como recogido. Se
          oculta cuando ya salió del negocio (deja de tener utilidad). */}
      {order.pickupPin && !order.pickedUpAt && !enMesa && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            PIN de recogida
          </p>
          <p className="font-mono text-2xl font-bold tracking-[0.3em] text-emerald-900">
            {order.pickupPin}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-700">
            Dícteselo al repartidor solo al entregarle el pedido.
          </p>
        </div>
      )}

      <div className="space-y-1 mb-3 bg-slate-50 rounded-lg p-2.5">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between items-baseline text-xs">
            <span className="text-slate-600">
              <span className="font-semibold text-slate-800">{item.quantity}×</span> {item.productName}
              {/* Sin esto la cocina no sabe si la pizza es grande ni que va sin
                  cebolla: prepararía otro plato. */}
              {item.optionsSummary && (
                <span className="block text-slate-500">{item.optionsSummary}</span>
              )}
              {item.notes && (
                <span className="block font-medium text-amber-700">“{item.notes}”</span>
              )}
            </span>
            <span className="text-slate-500 shrink-0 ml-2">{formatCOP(item.subtotal)}</span>
          </div>
        ))}
      </div>

      {(order.pickupPhotoUrl || order.deliveryPhotoUrl || order.signatureUrl) && (
        <div className="flex gap-2 mb-3">
          {order.pickupPhotoUrl && (
            <a
              href={resolveImg(order.pickupPhotoUrl)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 min-w-0"
              title="Ver prueba de recogida"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImg(order.pickupPhotoUrl)}
                alt="Prueba de recogida"
                className="h-16 w-full object-cover rounded-lg border border-slate-200"
              />
              <p className="text-[10px] text-slate-400 mt-0.5 text-center">Recogida ✓</p>
            </a>
          )}
          {order.deliveryPhotoUrl && (
            <a
              href={resolveImg(order.deliveryPhotoUrl)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 min-w-0"
              title="Ver prueba de entrega"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImg(order.deliveryPhotoUrl)}
                alt="Prueba de entrega"
                className="h-16 w-full object-cover rounded-lg border border-slate-200"
              />
              <p className="text-[10px] text-slate-400 mt-0.5 text-center">Entrega ✓</p>
            </a>
          )}
          {order.signatureUrl && (
            <a
              href={resolveImg(order.signatureUrl)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 min-w-0"
              title="Ver la firma de quien recibió"
            >
              {/* `object-contain` y fondo blanco, no `cover`: una firma
                  recortada deja de servir como prueba. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImg(order.signatureUrl)}
                alt="Firma de quien recibió"
                className="h-16 w-full object-contain rounded-lg border border-slate-200 bg-white"
              />
              <p className="text-[10px] text-slate-400 mt-0.5 text-center truncate">
                {order.signedByName ? `Firmó ${order.signedByName}` : 'Firma ✓'}
              </p>
            </a>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-3 h-3" />
          {/* En mesa el tiempo lo fija la cocina al aceptar; antes de eso no
              hay ninguno, y enseñar un «~30 min» del domicilio sería inventarlo. */}
          <span>{order.etaMinutes > 0 ? `~${order.etaMinutes} min` : 'Sin confirmar'}</span>
          {order.deliveryFee > 0 && !enMesa && (
            <span className="text-slate-400">· Domicilio {formatCOP(order.deliveryFee)}</span>
          )}
          {enMesa && <span className="text-slate-400">· Se paga en el local</span>}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800">{formatCOP(order.total)}</p>
          {/* Con qué paga. La cocina lo necesita para saber si el repartidor
              va a recoger plata o si el pedido ya está cobrado; hasta ahora
              esa elección no salía del teléfono del cliente. */}
          {order.paymentLabel && (
            <p className={`text-[11px] font-semibold ${
              order.cobraElRepartidor ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              {order.cobraElRepartidor
                ? `Cobrar: ${order.paymentLabel}`
                : `Pagado · ${order.paymentLabel}`}
            </p>
          )}
        </div>
      </div>

      {/* Estado de cocina */}
      {order.readyAt && (
        <p className="mt-2 text-xs font-semibold text-emerald-600">✓ Listo para recoger · {formatTime(order.readyAt)}</p>
      )}
      {order.status === 'preparing' && !order.readyAt && order.prepMinutes && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <UtensilsCrossed className="h-3.5 w-3.5" />
          Preparación: {order.prepMinutes} min
        </p>
      )}

      {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}

      {/* Acciones del restaurante */}
      {order.status === 'pending' && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Tiempo de preparación</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={prep}
              onChange={(e) => setPrep(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-center"
            />
            <span className="text-xs text-slate-500">min</span>
            <button
              onClick={() => act('accept')}
              disabled={busy !== null || !prep || Number(prep) <= 0}
              className="ml-auto flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white
                         hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === 'accept' ? 'Aceptando…' : 'Aceptar pedido'}
            </button>
            <button
              onClick={() => act('reject')}
              disabled={busy !== null}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600
                         hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === 'reject' ? '…' : 'Rechazar'}
            </button>
          </div>
        </div>
      )}
      {order.status === 'preparing' && !order.readyAt && !enMesa && (
        <button
          onClick={() => act('ready')}
          disabled={busy !== null}
          className={`${BOTON.principal} mt-3 w-full`}
        >
          {busy === 'ready' ? 'Marcando…' : 'Marcar listo para recoger'}
        </button>
      )}
      {/* En el salón no hay repartidor que recoja: «listo» y «entregado» son el
          mismo momento, cuando el plato sale a la mesa. */}
      {enMesa && (order.status === 'pending' || order.status === 'preparing') && (
        <button
          onClick={() => act('servido')}
          disabled={busy !== null}
          className={`${BOTON.principal} mt-3 w-full`}
        >
          {busy === 'servido' ? 'Marcando…' : `Servido en la mesa ${order.tableLabel}`}
        </button>
      )}
    </div>
  )
}

// ─── Delivery Order Card (existing) ──────────────────────────────────────────

const DELIVERY_STATUS_LABELS: Record<DeliveryOrderStatus, string> = {
  pending: 'Pendiente', at_pickup: 'En recogida', in_transit: 'En camino', delivered: 'Entregado',
}
const DELIVERY_STATUS_CLASSES: Record<DeliveryOrderStatus, string> = {
  pending: ESTADO.listo, at_pickup: ESTADO.enCurso,
  in_transit: 'bg-emerald-100 text-emerald-700', delivered: 'bg-emerald-100 text-emerald-700',
}

function DeliveryOrderCard({ order, token }: { order: Order; token: string }) {
  return (
    <Link
      href={`/negocio/${token}/pedido/${order.id}`}
      className={`${TARJETA} group block transition-all duration-200
                   hover:border-emerald-300 hover:shadow-md`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 text-sm truncate">#{order.ref}</p>
            <p className="text-slate-500 text-xs mt-0.5 truncate">{order.customerName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${DELIVERY_STATUS_CLASSES[order.status]}`}>
              {DELIVERY_STATUS_LABELS[order.status]}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-colors" />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400 truncate">{order.customerAddress}</p>
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">{formatTime(order.createdAt)}</span>
          <p className="text-xs font-semibold text-slate-700">{formatCOP(order.fare)}</p>
        </div>
      </div>
    </Link>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

/**
 * Una cifra del día.
 *
 * El `estado` sustituye al color suelto que recibía antes: así una tarjeta no
 * puede pintarse de violeta porque sí. En el teléfono el icono va al lado del
 * número en vez de encima — apilado, cuatro tarjetas se comían media pantalla
 * antes de llegar al primer pedido, que es lo que el dueño viene a ver.
 */
function StatCard({ icon: Icon, label, value, estado }: {
  icon: React.ElementType; label: string; value: string | number; estado: Estado
}) {
  return (
    <div className={`${TARJETA} p-3 sm:p-4`}>
      <div className="flex items-center gap-2.5 sm:block">
        <div className={`inline-flex shrink-0 rounded-lg p-2 sm:mb-3 ${TINTE_ESTADO[estado]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl">{value}</p>
          <p className="mt-0.5 text-[11px] leading-tight text-slate-500 sm:text-xs">{label}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ order, onDismiss }: { order: ClientOrder; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 right-4 z-50 max-w-xs w-full bg-white border-2 border-amber-300 rounded-2xl shadow-xl p-4 animate-slide-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4 text-amber-700" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-900 text-sm">¡Nuevo pedido!</p>
          <p className="text-xs text-slate-500 mt-0.5">
            #{order.orderRef} · {formatCOP(order.total)}
          </p>
          <p className="text-xs text-slate-400 truncate">{order.deliveryAddress}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'delivery' | 'online'

export default function PortalDashboard({
  params,
}: {
  // Next 15+: params llega como Promise incluso en client components; hay que
  // desenvolverlo con `use()`. Leerlo como objeto plano daba `token: undefined`
  // en el primer render → fetch a `/business/undefined/orders` (404 fantasma)
  // antes de que el valor real llegara.
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)

  const [data, setData] = useState<ApiResponse | null>(null)
  const [clientOrders, setClientOrders] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('online')
  const [wsConnected, setWsConnected] = useState(false)
  const [toast, setToast] = useState<ClientOrder | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pedidos que todavía esperan una decisión del negocio. Mientras haya alguno
  // el título de la pestaña parpadea: el aviso no se pierde aunque el dueño se
  // haya alejado del computador justo cuando sonó.
  // Pedido que se quedó sin repartidor tras los reintentos del backend.
  const [sinRepartidor, setSinRepartidor] = useState<string | null>(null)
  const pendientesCount = clientOrders.filter((o) => o.status === 'pending').length
  const { avisarPedido, sonidoBloqueado, activarSonido } = useOrderAlert(pendientesCount)

  // ── REST fetch ──────────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const [deliveryRes, clientRes] = await Promise.all([
        fetch(`${BACKEND_URL}/business/${token}/orders`, { cache: 'no-store' }),
        fetch(`${BACKEND_URL}/business/${token}/client-orders`, { cache: 'no-store' }),
      ])

      if (deliveryRes.status === 404) {
        // 404 real del backend: este token no existe en ESTA base de datos.
        // Caso típico: probar un enlace de negocio semilla (solo existe en
        // desarrollo local) contra producción.
        setError(
          `El negocio "${token}" no está registrado en este servidor. ` +
          'Los negocios de prueba (semillas) solo existen en desarrollo. ' +
          'Registra tu negocio real y usa el enlace que te entrega el registro.',
        )
        return
      }
      if (!deliveryRes.ok) { setError('Error al cargar los pedidos. Intenta de nuevo.'); return }

      const deliveryJson = await deliveryRes.json() as { success: boolean; data: ApiResponse }
      const deliveryData: ApiResponse = (deliveryJson.data ?? deliveryJson) as ApiResponse

      if (clientRes.ok) {
        const clientJson = await clientRes.json() as { success: boolean; data: ClientOrder[] }
        setClientOrders((clientJson.data ?? clientJson) as ClientOrder[])
      }

      setData(deliveryData)
      setError(null)
      setLastRefresh(new Date())
    } catch {
      setError('No se pudo conectar al servidor.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [token])

  // ── WebSocket ───────────────────────────────────────────────────────────────

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'business_auth', token }))
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as Record<string, unknown>
          if (msg['type'] === 'business_auth_ok') {
            setWsConnected(true)
          } else if (msg['type'] === 'new_order') {
            const order = msg['order'] as ClientOrder
            setClientOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)])
            setToast(order)
            setActiveTab('online')
            avisarPedido(
              '¡Pedido nuevo!',
              `${order.items?.length ?? 0} producto(s) · ${formatCOP(order.total)}`,
            )
          } else if (msg['type'] === 'order_no_driver') {
            // El backend insistió 10 minutos y no apareció repartidor. El
            // negocio tiene la comida hecha: es quien debe decidir.
            setSinRepartidor(String(msg['orderRef'] ?? ''))
            avisarPedido(
              'Sin repartidor',
              `No encontramos repartidor para el pedido ${String(msg['orderRef'] ?? '')}.`,
            )
          } else if (msg['type'] === 'business_auth_error') {
            ws.close()
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        wsRef.current = null
        reconnectTimer.current = setTimeout(connectWs, 5000)
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      // ignore connection errors — onclose will trigger reconnect
    }
  }, [token, avisarPedido])

  useEffect(() => {
    fetchOrders()
    connectWs()
    const pollInterval = setInterval(() => fetchOrders(), 60_000)

    return () => {
      clearInterval(pollInterval)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [fetchOrders, connectWs])

  // ─── Derived ────────────────────────────────────────────────────────────────

  const activeDeliveryCount = data?.orders.filter((o) => o.status !== 'delivered').length ?? 0
  const newOnlineCount = pendientesCount
  const preparingCount = clientOrders.filter((o) => ['pending', 'preparing', 'driverToPickup'].includes(o.status)).length

  // La marca dibujándose mientras llega el pedido del día: la misma entrada
  // que el splash de las apps, para que ZIPA se sienta igual en todas partes.
  if (loading) return <ZipaLoading label="Abriendo tu portal" />

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white border border-red-100 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="font-bold text-slate-900 text-lg mb-2">Acceso no disponible</h1>
          <p className="text-slate-500 text-sm leading-relaxed">{error}</p>
          {/* Un enlace viejo o mal copiado no puede ser un callejón sin salida:
              con el teléfono del registro se recupera el enlace correcto. */}
          <a href="/negocio"
            className="mt-6 block w-full py-2.5 px-4 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors">
            Recuperar mi enlace
          </a>
          <a href="/negocio/registro"
            className="mt-2 block w-full py-2.5 px-4 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Registrar mi negocio
          </a>
          <button onClick={() => fetchOrders(true)}
            className="mt-2 w-full py-2.5 px-4 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { orders, stats } = data
  // Defensa: si el backend no incluyera `business`, el header no debe tumbar
  // toda la página (antes: "Cannot read properties of undefined reading 'name'").
  const businessName = data.business?.name ?? 'Mi negocio'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast */}
      {toast && <Toast order={toast} onDismiss={() => setToast(null)} />}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sm:sticky sm:top-0 z-10">
        <div className={`${CONTENEDOR} flex items-center justify-between py-3 sm:py-4`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center">
              <ZipaLogo size={24} />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">{businessName}</p>
              <p className="text-xs text-slate-400">Portal de pedidos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* WS indicator */}
            <div className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 border ${
              wsConnected
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-slate-400 bg-slate-50 border-slate-200'
            }`}>
              {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{wsConnected ? 'En vivo' : 'Offline'}</span>
            </div>
            {/*
              Cuántos pedidos hay en curso. Estaba `hidden sm:flex`, así que en
              el teléfono —que es como se usa este portal casi siempre—
              desaparecía justo el número que el dueño quiere de un vistazo.
              Ahora se ve en los dos: en móvil solo la cifra, que es lo único
              que cabe al lado de la marca sin empujarla.
            */}
            {(activeDeliveryCount + preparingCount) > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-200
                              bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <Activity className="h-3 w-3 animate-pulse" />
                {activeDeliveryCount + preparingCount}
                <span className="hidden sm:inline">
                  {' '}activo{(activeDeliveryCount + preparingCount) !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <Link href={`/negocio/${token}/catalogo`}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700
                         bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-100 transition-colors">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              Catálogo
            </Link>
            <Link href={`/negocio/${token}/ajustes`}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600
                         bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 transition-colors">
              <Settings className="w-3.5 h-3.5" />
              Ajustes
            </Link>
            <button onClick={() => fetchOrders(true)} disabled={refreshing}
              aria-label="Actualizar pedidos"
              className={BOTON.icono}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <PortalTabs token={token} activa="pedidos" />

      <div className={`${CONTENEDOR} space-y-6 py-5 sm:py-6`}>

        {/* El navegador no deja sonar hasta que el usuario toca la página. Sin
            este aviso, el dueño creería que el portal avisa cuando en realidad
            está mudo. */}
        {sonidoBloqueado && (
          <button
            onClick={() => void activarSonido()}
            className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <Bell className="w-4.5 h-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-amber-900 text-sm">Activar el sonido de pedidos</span>
              <span className="block text-xs text-amber-800/80">
                Tócalo una vez y sonará una campana cada vez que entre un pedido, aunque tengas otra pestaña abierta.
              </span>
            </span>
          </button>
        )}

        {sinRepartidor && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
              <AlertCircle className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-red-900 text-sm">
                Sin repartidor para el pedido {sinRepartidor}
              </p>
              <p className="text-xs text-red-800/80">
                Estuvimos buscando 10 minutos y no apareció ninguno cerca. Puedes
                llevarlo tú o cancelarlo desde el pedido.
              </p>
            </div>
            <button
              onClick={() => setSinRepartidor(null)}
              className="shrink-0 text-xs font-semibold text-red-700 hover:text-red-900"
            >
              Entendido
            </button>
          </div>
        )}

        {/* Stats */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={ShoppingBag} label="Pedidos online" value={clientOrders.length} estado="enCurso" />
            <StatCard icon={UtensilsCrossed} label="En preparación" value={preparingCount} estado="enCurso" />
            <StatCard icon={Truck} label="En tránsito" value={stats.inTransit} estado="enCurso" />
            {/* «Entregados» cuenta lo de domicilio Y lo servido en mesa. Contar
                solo domicilio fue el defecto: «En preparación» sí incluía los de
                mesa, así que el dueño veía dos números del mismo día que no
                cuadraban entre sí. */}
            <StatCard
              icon={CheckCircle2}
              label="Entregados"
              value={stats.delivered + (stats.servidosEnMesa ?? 0)}
              estado="listo"
            />
          </div>

          {/* Lo que el dueño de verdad quiere saber al cerrar el día. Solo se
              pinta cuando hay servicio en mesa: en un local que no lo usa, dos
              tarjetas con «$0» solo estorban. */}
          {(stats.enMesa ?? 0) > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatCard
                icon={Utensils}
                label={`Salón · ${stats.servidosEnMesa ?? 0} servido${(stats.servidosEnMesa ?? 0) === 1 ? '' : 's'}`}
                value={formatCOP(stats.ventaSalon)}
                estado="listo"
              />
              <StatCard
                icon={Truck}
                label={`Domicilio · ${stats.delivered} entregado${stats.delivered === 1 ? '' : 's'}`}
                value={formatCOP(stats.ventaDomicilio)}
                estado="listo"
              />
            </div>
          )}
        </section>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('online')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'online'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Pedidos online
            {newOnlineCount > 0 && (
              <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {newOnlineCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('delivery')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'delivery'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Truck className="w-4 h-4" />
            Entregas
            {activeDeliveryCount > 0 && (
              <span className="bg-emerald-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {activeDeliveryCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'online' && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-600" />
                Pedidos de clientes
                <span className="text-slate-400 font-normal">({clientOrders.length})</span>
              </h2>
              {lastRefresh && <p className="text-xs text-slate-400">Act. {formatTime(lastRefresh.toISOString())}</p>}
            </div>
            {clientOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center">
                <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-600">Sin pedidos online por ahora</p>
                <p className="text-slate-400 text-sm mt-1">Los pedidos aparecerán aquí en tiempo real.</p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
                {clientOrders.map((order) => (
                  <ClientOrderCard
                    key={order.id}
                    order={order}
                    token={token}
                    onChanged={(updated) =>
                      setClientOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'delivery' && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Entregas de hoy
                <span className="text-slate-400 font-normal">({orders.length})</span>
              </h2>
              {lastRefresh && <p className="text-xs text-slate-400">Act. {formatTime(lastRefresh.toISOString())}</p>}
            </div>
            {orders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center">
                <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-600">Sin entregas por ahora</p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
                {orders.map((order) => (
                  <DeliveryOrderCard key={order.id} order={order} token={token} />
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="text-center py-4">
          <p className="text-xs text-slate-400">
            ZIPA Delivery ·{' '}
            <Link href="/negocio/registro" className="text-emerald-600 hover:underline">
              ¿Qué es este portal?
            </Link>
          </p>
        </footer>
      </div>
    </div>
  )
}
