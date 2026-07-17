'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
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
  Settings,
} from 'lucide-react'

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
  subtotal: number
  deliveryFee: number
  total: number
  etaMinutes: number
  items: Array<{ productName: string; quantity: number; unitPrice: number; subtotal: number }>
  deliveryAddress: string
  driverName?: string
  driverPhone?: string
  hasSignature: boolean
  createdAt: string
  pickedUpAt?: string
  deliveredAt?: string
  pickupPhotoUrl?: string
  deliveryPhotoUrl?: string
  prepMinutes?: number
  acceptedAt?: string
  readyAt?: string
}

interface BusinessStats {
  total: number
  inTransit: number
  delivered: number
  custodyPct: number
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

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
}

// ─── Client Order Badge ───────────────────────────────────────────────────────

const CLIENT_STATUS: Record<ClientOrderStatus, { label: string; className: string }> = {
  pending:        { label: 'Nuevo · acepta',     className: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' },
  confirmed:      { label: 'Confirmado',         className: 'bg-amber-100 text-amber-700' },
  preparing:      { label: 'En preparación',     className: 'bg-violet-100 text-violet-700' },
  driverToPickup: { label: 'Driver en camino',   className: 'bg-blue-100 text-blue-700' },
  atPickup:       { label: 'Driver en local',    className: 'bg-violet-100 text-violet-700' },
  inTransit:      { label: 'En camino',          className: 'bg-teal-100 text-teal-700' },
  delivered:      { label: 'Entregado',          className: 'bg-emerald-100 text-emerald-700' },
  cancelled:      { label: 'Cancelado',          className: 'bg-slate-100 text-slate-500' },
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
  const [busy, setBusy] = useState<null | 'accept' | 'reject' | 'ready'>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function act(kind: 'accept' | 'reject' | 'ready') {
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
    <div className={`bg-white border rounded-xl shadow-sm p-4 transition-all ${
      isNew ? 'border-orange-300 shadow-orange-100' : 'border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-bold text-slate-900 text-sm">#{order.orderRef}</p>
          <p className="text-xs text-slate-400 mt-0.5">{formatTime(order.createdAt)}</p>
        </div>
        <ClientStatusBadge status={order.status} />
      </div>

      <div className="text-xs text-slate-500 mb-3 flex items-start gap-1.5">
        <span className="shrink-0 mt-0.5">📍</span>
        <span className="truncate">{order.deliveryAddress}</span>
      </div>

      <div className="space-y-1 mb-3 bg-slate-50 rounded-lg p-2.5">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between items-baseline text-xs">
            <span className="text-slate-600">
              <span className="font-semibold text-slate-800">{item.quantity}×</span> {item.productName}
            </span>
            <span className="text-slate-500 shrink-0 ml-2">{formatCOP(item.subtotal)}</span>
          </div>
        ))}
      </div>

      {(order.pickupPhotoUrl || order.deliveryPhotoUrl) && (
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
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-3 h-3" />
          <span>~{order.etaMinutes} min</span>
          {order.deliveryFee > 0 && (
            <span className="text-slate-400">· Domicilio {formatCOP(order.deliveryFee)}</span>
          )}
        </div>
        <p className="text-sm font-bold text-slate-800">{formatCOP(order.total)}</p>
      </div>

      {/* Estado de cocina */}
      {order.readyAt && (
        <p className="mt-2 text-xs font-semibold text-emerald-600">✓ Listo para recoger · {formatTime(order.readyAt)}</p>
      )}
      {order.status === 'preparing' && !order.readyAt && order.prepMinutes && (
        <p className="mt-2 text-xs text-violet-600">🍳 Preparación: {order.prepMinutes} min</p>
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
      {order.status === 'preparing' && !order.readyAt && (
        <button
          onClick={() => act('ready')}
          disabled={busy !== null}
          className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white
                     hover:bg-violet-700 disabled:opacity-50"
        >
          {busy === 'ready' ? 'Marcando…' : 'Marcar listo para recoger'}
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
  pending: 'bg-slate-100 text-slate-600', at_pickup: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-teal-100 text-teal-700', delivered: 'bg-emerald-100 text-emerald-700',
}

function DeliveryOrderCard({ order, token }: { order: Order; token: string }) {
  return (
    <Link
      href={`/negocio/${token}/pedido/${order.id}`}
      className="block bg-white border border-slate-200 rounded-xl shadow-sm
                 hover:border-teal-300 hover:shadow-md transition-all duration-200 group"
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
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-600 transition-colors" />
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

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className={`inline-flex p-2 rounded-lg ${color} mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
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
    <div className="fixed bottom-6 right-4 z-50 max-w-xs w-full bg-white border border-orange-300 rounded-2xl shadow-xl p-4 animate-slide-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4 text-orange-600" />
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
  }, [token])

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
  const newOnlineCount = clientOrders.filter((o) => o.status === 'pending').length
  const preparingCount = clientOrders.filter((o) => ['pending', 'preparing', 'driverToPickup'].includes(o.status)).length

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm">Cargando portal…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white border border-red-100 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="font-bold text-slate-900 text-lg mb-2">Acceso no disponible</h1>
          <p className="text-slate-500 text-sm leading-relaxed">{error}</p>
          <a href="/negocio/registro"
            className="mt-6 block w-full py-2.5 px-4 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 transition-colors">
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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-700 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
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
                ? 'text-teal-700 bg-teal-50 border-teal-200'
                : 'text-slate-400 bg-slate-50 border-slate-200'
            }`}>
              {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{wsConnected ? 'En vivo' : 'Offline'}</span>
            </div>
            {/* Active orders pill */}
            {(activeDeliveryCount + preparingCount) > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-teal-700
                              bg-teal-50 border border-teal-200 rounded-full px-2.5 py-1">
                <Activity className="w-3 h-3 animate-pulse" />
                {activeDeliveryCount + preparingCount} activo{(activeDeliveryCount + preparingCount) !== 1 ? 's' : ''}
              </div>
            )}
            <Link href={`/negocio/${token}/catalogo`}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700
                         bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 hover:bg-teal-100 transition-colors">
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
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-teal-300 hover:text-teal-700 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Stats */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={ShoppingBag} label="Pedidos online" value={clientOrders.length} color="bg-orange-50 text-orange-600" />
            <StatCard icon={UtensilsCrossed} label="En preparación" value={preparingCount} color="bg-violet-50 text-violet-600" />
            <StatCard icon={Truck} label="En tránsito" value={stats.inTransit} color="bg-teal-50 text-teal-700" />
            <StatCard icon={CheckCircle2} label="Entregados" value={stats.delivered} color="bg-emerald-50 text-emerald-600" />
          </div>
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
              <span className="bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
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
              <span className="bg-teal-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
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
                <ShoppingBag className="w-4 h-4 text-orange-500" />
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
              <div className="space-y-3">
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
              <div className="space-y-3">
                {orders.map((order) => (
                  <DeliveryOrderCard key={order.id} order={order} token={token} />
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="text-center py-4">
          <p className="text-xs text-slate-400">
            Nexum Delivery ·{' '}
            <Link href="/negocio/registro" className="text-teal-600 hover:underline">
              ¿Qué es este portal?
            </Link>
          </p>
        </footer>
      </div>
    </div>
  )
}
