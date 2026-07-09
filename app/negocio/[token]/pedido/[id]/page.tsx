'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  User,
  ShieldCheck,
  AlertTriangle,
  Camera,
  PenLine,
  RefreshCw,
  AlertCircle,
  Banknote,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'pending' | 'at_pickup' | 'in_transit' | 'delivered'

interface CustodyEvent {
  type: 'pickup' | 'delivery'
  timestamp: string
  hasProof: boolean
}

interface OrderDetail {
  id: string
  ref: string
  customerName: string
  customerAddress: string
  customerPhone?: string
  status: OrderStatus
  fare: number
  createdAt: string
  estimatedDelivery?: string
  hasPickupProof: boolean
  hasSignature: boolean
  hasFullCustody: boolean
  custodyEvents: CustodyEvent[]
  driverName: string
  driverPhone: string
  notes?: string
}

interface ApiDetailResponse {
  order: OrderDetail
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

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
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
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

/** A single step in the chain-of-custody timeline */
function CustodyStep({
  stepNumber,
  label,
  timestamp,
  hasProof,
  proofLabel,
  noProofLabel,
  extraChip,
  isLast,
  isComplete,
}: {
  stepNumber: number
  label: string
  timestamp?: string
  hasProof: boolean
  proofLabel: string
  noProofLabel: string
  extraChip?: React.ReactNode
  isLast: boolean
  isComplete: boolean
}) {
  return (
    <div className="flex gap-4">
      {/* Left: dot + connector line */}
      <div className="flex flex-col items-center">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 font-semibold text-sm transition-colors ${
            isComplete
              ? hasProof
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'bg-amber-400 border-amber-400 text-white'
              : 'bg-white border-slate-300 text-slate-400'
          }`}
        >
          {stepNumber}
        </div>
        {!isLast && (
          <div
            className={`w-0.5 flex-1 mt-1 min-h-[2rem] ${
              isComplete ? 'bg-emerald-300' : 'bg-slate-200'
            }`}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="pb-6 flex-1 min-w-0">
        <p className={`font-semibold text-sm ${isComplete ? 'text-slate-900' : 'text-slate-400'}`}>
          {label}
        </p>
        {isComplete && timestamp && (
          <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(timestamp)}</p>
        )}
        {!isComplete && (
          <p className="text-xs text-slate-400 mt-0.5">Pendiente</p>
        )}

        {isComplete && (
          <div className="mt-2 flex flex-wrap gap-2 items-center">
            {hasProof ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                <Camera className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-xs font-medium text-emerald-700">{proofLabel}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                <Camera className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-medium text-amber-600">{noProofLabel}</span>
              </div>
            )}
            {extraChip}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PedidoDetailPage({
  params,
}: {
  // Next 15+: params es una Promise incluso en client components (ver nota en
  // negocio/[token]/page.tsx).
  params: Promise<{ token: string; id: string }>
}) {
  const { token, id } = use(params)

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrder = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true)
      try {
        const res = await fetch(
          `${BACKEND_URL}/business/${token}/orders/${id}`,
          { cache: 'no-store' },
        )
        if (res.status === 404) {
          setError('Pedido no encontrado. Puede que haya sido eliminado o el enlace sea incorrecto.')
          return
        }
        if (!res.ok) {
          setError('Error al cargar el pedido. Por favor intenta de nuevo.')
          return
        }
        const json: ApiDetailResponse = await res.json()
        setOrder(json.order)
        setError(null)
      } catch {
        setError('No se pudo conectar al servidor. Verifica tu conexión a internet.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [token, id],
  )

  useEffect(() => {
    fetchOrder()
    // Auto-refresh every 30 s while order isn't delivered
    const interval = setInterval(() => {
      setOrder((prev) => {
        if (prev && prev.status !== 'delivered') fetchOrder()
        return prev
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [fetchOrder])

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
          <p className="text-sm">Cargando pedido…</p>
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
          <h1 className="font-bold text-slate-900 text-lg mb-2">Pedido no disponible</h1>
          <p className="text-slate-500 text-sm leading-relaxed">{error}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => fetchOrder(true)}
              className="w-full py-2.5 px-4 bg-teal-700 text-white rounded-lg text-sm
                         font-medium hover:bg-teal-800 transition-colors"
            >
              Reintentar
            </button>
            <Link
              href={`/negocio/${token}`}
              className="w-full py-2.5 px-4 bg-slate-100 text-slate-700 rounded-lg text-sm
                         font-medium hover:bg-slate-200 transition-colors text-center"
            >
              Volver al portal
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!order) return null

  // Determine which custody events exist
  const pickupEvent = order.custodyEvents.find((e) => e.type === 'pickup')
  const deliveryEvent = order.custodyEvents.find((e) => e.type === 'delivery')

  const pickupComplete = ['at_pickup', 'in_transit', 'delivered'].includes(order.status)
  const deliveryComplete = order.status === 'delivered'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sticky header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href={`/negocio/${token}`}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-700
                       transition-colors rounded-lg px-2 py-1.5 -ml-2 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Pedidos</span>
          </Link>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm truncate">Pedido #{order.ref}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={order.status} />
            <button
              onClick={() => fetchOrder(true)}
              disabled={refreshing}
              aria-label="Actualizar pedido"
              className="p-2 rounded-lg border border-slate-200 text-slate-500
                         hover:border-teal-300 hover:text-teal-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* ── Order header card ── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-teal-700" />
              </div>
              <div>
                <p className="font-bold text-slate-900">#{order.ref}</p>
                <p className="text-xs text-slate-400">{formatDateTime(order.createdAt)}</p>
              </div>
            </div>
            {/* Custody verification badge */}
            {order.hasFullCustody ? (
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200
                              rounded-full px-3 py-1.5 shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">Verificada</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200
                              rounded-full px-3 py-1.5 shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600">Cadena parcial</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <InfoRow icon={User} label="Cliente" value={order.customerName} />
            <InfoRow icon={MapPin} label="Dirección" value={order.customerAddress} />
            <InfoRow icon={Clock} label="Hora del pedido" value={formatTime(order.createdAt)} />
            <InfoRow icon={Banknote} label="Tarifa" value={formatCOP(order.fare)} />
            {order.estimatedDelivery && (
              <InfoRow
                icon={Clock}
                label="Entrega estimada"
                value={formatTime(order.estimatedDelivery)}
              />
            )}
            {order.customerPhone && (
              <InfoRow icon={Phone} label="Teléfono cliente" value={order.customerPhone} />
            )}
          </div>

          {order.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-1">Notas</p>
              <p className="text-sm text-slate-700 leading-relaxed">{order.notes}</p>
            </div>
          )}
        </div>

        {/* ── Chain of custody timeline ── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              Cadena de custodia
            </h2>
            {order.hasFullCustody && (
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Completa
              </span>
            )}
          </div>

          {/* Step 1 — Pickup */}
          <CustodyStep
            stepNumber={1}
            label="Recogido en el local"
            timestamp={pickupEvent?.timestamp}
            hasProof={order.hasPickupProof}
            proofLabel="Foto de recogida"
            noProofLabel="Sin foto de recogida"
            isLast={false}
            isComplete={pickupComplete}
          />

          {/* Step 2 — Delivery */}
          <CustodyStep
            stepNumber={2}
            label="Entregado al cliente"
            timestamp={deliveryEvent?.timestamp}
            hasProof={deliveryComplete && order.hasPickupProof}
            proofLabel="Foto de entrega"
            noProofLabel="Sin foto de entrega"
            extraChip={
              deliveryComplete && order.hasSignature ? (
                <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5">
                  <PenLine className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="text-xs font-medium text-teal-700">Firmado</span>
                </div>
              ) : undefined
            }
            isLast={true}
            isComplete={deliveryComplete}
          />

          {/* Custody summary note */}
          {!order.hasFullCustody && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                La cadena de custodia está incompleta. Faltan evidencias fotográficas o firma del
                cliente para validar la entrega de forma completa.
              </p>
            </div>
          )}

          {order.hasFullCustody && (
            <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 leading-relaxed">
                Cadena de custodia completa. El pedido fue recogido y entregado con todas las
                evidencias requeridas.
              </p>
            </div>
          )}
        </div>

        {/* ── Driver info card ── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-teal-600" />
            Repartidor
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-700 flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-sm">
                  {order.driverName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-semibold text-slate-900 text-sm">{order.driverName}</p>
                <p className="text-xs text-slate-400">{order.driverPhone}</p>
              </div>
            </div>
            <a
              href={`tel:${order.driverPhone}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-teal-700 text-white rounded-lg
                         text-sm font-medium hover:bg-teal-800 transition-colors shrink-0"
            >
              <Phone className="w-3.5 h-3.5" />
              Llamar
            </a>
          </div>
        </div>

        {/* ── Back button ── */}
        <Link
          href={`/negocio/${token}`}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 border border-slate-200
                     bg-white rounded-xl text-sm font-medium text-slate-600 hover:border-teal-300
                     hover:text-teal-700 hover:bg-teal-50 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a todos los pedidos
        </Link>

        <div className="pb-4" />
      </div>
    </div>
  )
}
