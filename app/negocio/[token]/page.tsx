'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Activity,
  ChevronRight,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'at_pickup' | 'in_transit' | 'delivered'

interface CustodyEvent {
  type: 'pickup' | 'delivery'
  timestamp: string
  hasProof: boolean
}

interface Order {
  id: string
  ref: string
  customerName: string
  customerAddress: string
  status: OrderStatus
  fare: number
  createdAt: string
  hasPickupProof: boolean
  hasSignature: boolean
  hasFullCustody: boolean
  custodyEvents: CustodyEvent[]
  driverName: string
  driverPhone: string
}

interface BusinessStats {
  total: number
  inTransit: number
  delivered: number
  custodyPct: number
}

interface ApiResponse {
  business: {
    name: string
    token: string
  }
  orders: Order[]
  stats: BusinessStats
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001'

function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  at_pickup: 'En recogida',
  in_transit: 'En camino',
  delivered: 'Entregado',
}

const STATUS_CLASSES: Record<OrderStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  at_pickup: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-teal-100 text-teal-700',
  delivered: 'bg-emerald-100 text-emerald-700',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function CustodyMiniTimeline({ order }: { order: Order }) {
  const steps: Array<{ label: string; done: boolean; hasProof: boolean }> = [
    {
      label: 'Recogido',
      done: ['at_pickup', 'in_transit', 'delivered'].includes(order.status),
      hasProof: order.hasPickupProof,
    },
    {
      label: 'Entregado',
      done: order.status === 'delivered',
      hasProof: order.hasSignature,
    },
  ]

  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-0.5">
            <div
              className={`w-2.5 h-2.5 rounded-full border-2 transition-colors ${
                step.done
                  ? step.hasProof
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'bg-amber-400 border-amber-400'
                  : 'bg-white border-slate-300'
              }`}
            />
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-6 ${
                steps[i + 1].done ? 'bg-emerald-400' : 'bg-slate-200'
              }`}
            />
          )}
        </div>
      ))}
      {order.hasFullCustody ? (
        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
          <ShieldCheck className="w-3 h-3" />
          Verificada
        </span>
      ) : (
        <span className="ml-1.5 text-xs text-amber-600 font-medium">Parcial</span>
      )}
    </div>
  )
}

function OrderCard({ order, token }: { order: Order; token: string }) {
  return (
    <Link
      href={`/negocio/${token}/pedido/${order.id}`}
      className="block bg-white border border-slate-200 rounded-xl shadow-sm
                 hover:border-teal-300 hover:shadow-md transition-all duration-200 group"
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">
              #{order.ref}
            </p>
            <p className="text-slate-500 text-xs mt-0.5 truncate">
              {order.customerName}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={order.status} />
            <ChevronRight
              className="w-4 h-4 text-slate-300 group-hover:text-teal-600 transition-colors"
            />
          </div>
        </div>

        {/* Address */}
        <p className="mt-2 text-xs text-slate-400 truncate">{order.customerAddress}</p>

        {/* Footer row */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <CustodyMiniTimeline order={order} />
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-700">{formatCOP(order.fare)}</p>
            <p className="text-xs text-slate-400">{formatTime(order.createdAt)}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortalDashboard({
  params,
}: {
  params: { token: string }
}) {
  const { token } = params

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrders = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true)
      try {
        const res = await fetch(`${BACKEND_URL}/business/${token}/orders`, {
          cache: 'no-store',
        })
        if (res.status === 404) {
          setError('Portal no encontrado. Verifica que el enlace sea correcto.')
          return
        }
        if (!res.ok) {
          setError('Error al cargar los pedidos. Intenta de nuevo.')
          return
        }
        const json: ApiResponse = await res.json()
        setData(json)
        setError(null)
        setLastRefresh(new Date())
      } catch {
        setError('No se pudo conectar al servidor. Verifica tu conexión a internet.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [token],
  )

  // Initial load + auto-refresh every 60 s
  useEffect(() => {
    fetchOrders()
    const interval = setInterval(() => fetchOrders(), 60_000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  // Count active (non-delivered) orders
  const activeCount =
    data?.orders.filter((o) => o.status !== 'delivered').length ?? 0

  // ── Loading skeleton ──
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

  // ── Error state ──
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white border border-red-100 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="font-bold text-slate-900 text-lg mb-2">Acceso no disponible</h1>
          <p className="text-slate-500 text-sm leading-relaxed">{error}</p>
          <button
            onClick={() => fetchOrders(true)}
            className="mt-6 w-full py-2.5 px-4 bg-teal-700 text-white rounded-lg text-sm
                       font-medium hover:bg-teal-800 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { business, orders, stats } = data

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-700 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">{business.name}</p>
              <p className="text-xs text-slate-400">Portal de pedidos</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live indicator */}
            {activeCount > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-teal-700
                              bg-teal-50 border border-teal-200 rounded-full px-2.5 py-1">
                <Activity className="w-3 h-3 animate-pulse" />
                {activeCount} activo{activeCount !== 1 ? 's' : ''}
              </div>
            )}
            <button
              onClick={() => fetchOrders(true)}
              disabled={refreshing}
              aria-label="Actualizar pedidos"
              className="p-2 rounded-lg border border-slate-200 text-slate-500
                         hover:border-teal-300 hover:text-teal-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── Stats grid ── */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={Package}
              label="Pedidos hoy"
              value={stats.total}
              color="bg-slate-100 text-slate-600"
            />
            <StatCard
              icon={Truck}
              label="En tránsito"
              value={stats.inTransit}
              color="bg-teal-50 text-teal-700"
            />
            <StatCard
              icon={CheckCircle2}
              label="Entregados"
              value={stats.delivered}
              color="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              icon={ShieldCheck}
              label="Custodia"
              value={`${stats.custodyPct}%`}
              color="bg-blue-50 text-blue-600"
            />
          </div>
        </section>

        {/* ── Live pulse banner (mobile) ── */}
        {activeCount > 0 && (
          <div className="flex sm:hidden items-center gap-2 bg-teal-50 border border-teal-200
                          rounded-xl px-4 py-3 text-teal-700 text-sm font-medium">
            <Activity className="w-4 h-4 animate-pulse shrink-0" />
            <span>{activeCount} pedido{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''} en este momento</span>
          </div>
        )}

        {/* ── Order list ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Pedidos de hoy
              <span className="text-slate-400 font-normal">({orders.length})</span>
            </h2>
            {lastRefresh && (
              <p className="text-xs text-slate-400">
                Act. {formatTime(lastRefresh.toISOString())}
              </p>
            )}
          </div>

          {orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-10 text-center">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-slate-600">Sin pedidos por ahora</p>
              <p className="text-slate-400 text-sm mt-1">
                Los pedidos aparecerán aquí en tiempo real.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} token={token} />
              ))}
            </div>
          )}
        </section>

        {/* ── Footer ── */}
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
