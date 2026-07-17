'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Store,
  Check,
  AlertCircle,
  BarChart3,
  Power,
} from 'lucide-react'

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

interface Settings {
  name: string
  address: string
  phone: string
  whatsapp: string
  deliveryFee: number
  etaMinutes: number
  acceptingOrders: boolean
  openingHours: string
}

interface Stats {
  from: string
  to: string
  ordersCount: number
  deliveredCount: number
  cancelledCount: number
  inProgressCount: number
  revenue: number
  topProducts: Array<{ name: string; quantity: number; revenue: number }>
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AjustesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [settings, setSettings] = useState<Settings | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const [sRes, stRes] = await Promise.all([
        fetch(`${BACKEND_URL}/business/${token}/settings`, { cache: 'no-store' }),
        fetch(`${BACKEND_URL}/business/${token}/stats`, { cache: 'no-store' }),
      ])
      if (sRes.status === 404) {
        setError('Este negocio no existe en el servidor. Verifica tu enlace.')
        return
      }
      const sJson = (await sRes.json()) as { success: boolean; data?: Settings }
      const stJson = (await stRes.json()) as { success: boolean; data?: Stats }
      if (sJson.success && sJson.data) setSettings(sJson.data)
      if (stJson.success && stJson.data) setStats(stJson.data)
      setError(null)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const patch = async (body: Partial<Settings>) => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; data?: Settings }
      if (json.success && json.data) {
        setSettings(json.data)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href={`/negocio/${token}`} className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">Ajustes del negocio</p>
              <p className="text-xs text-slate-400">Perfil, entrega y ventas</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 text-teal-600 animate-spin" /></div>
        ) : error ? (
          <div className="bg-white border border-red-100 rounded-2xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        ) : settings ? (
          <>
            {/* Abierto / Cerrado */}
            <section className={`rounded-2xl border p-5 flex items-center justify-between ${
              settings.acceptingOrders ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="flex items-center gap-3">
                <Power className={`w-6 h-6 ${settings.acceptingOrders ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <p className="font-bold text-slate-900 text-sm">
                    {settings.acceptingOrders ? 'Abierto · recibiendo pedidos' : 'Cerrado · en pausa'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {settings.acceptingOrders
                      ? 'Los clientes pueden pedirte ahora.'
                      : 'Apareces como cerrado; no entran pedidos.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void patch({ acceptingOrders: !settings.acceptingOrders })}
                disabled={saving}
                className={`shrink-0 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
                  settings.acceptingOrders ? 'bg-slate-700 hover:bg-slate-800' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {settings.acceptingOrders ? 'Cerrar' : 'Abrir'}
              </button>
            </section>

            {/* Estadísticas de hoy */}
            {stats && (
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-teal-600" /> Ventas de hoy
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="Ingresos" value={formatCOP(stats.revenue)} />
                  <StatBox label="Pedidos" value={String(stats.ordersCount)} />
                  <StatBox label="Entregados" value={String(stats.deliveredCount)} />
                </div>
                {stats.topProducts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Más vendidos hoy</p>
                    <div className="space-y-1.5">
                      {stats.topProducts.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 truncate">
                            <span className="font-semibold text-teal-700">{p.quantity}×</span> {p.name}
                          </span>
                          <span className="text-slate-500 shrink-0 ml-2">{formatCOP(p.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Perfil / entrega */}
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-semibold text-slate-900 text-sm">Perfil y entrega</h2>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del local</label>
                <input className={INPUT} value={settings.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                <input className={INPUT} value={settings.address} onChange={(e) => set({ address: e.target.value })} maxLength={120} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                  <input className={INPUT} value={settings.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={20} inputMode="tel" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp</label>
                  <input className={INPUT} value={settings.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} maxLength={20} inputMode="tel" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Domicilio (COP)</label>
                  <input
                    className={INPUT}
                    value={String(settings.deliveryFee)}
                    onChange={(e) => set({ deliveryFee: Number(e.target.value.replace(/[^\d]/g, '')) })}
                    inputMode="numeric"
                    maxLength={9}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tiempo entrega (min)</label>
                  <input
                    className={INPUT}
                    value={String(settings.etaMinutes)}
                    onChange={(e) => set({ etaMinutes: Number(e.target.value.replace(/[^\d]/g, '')) })}
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Horario (informativo)</label>
                <input className={INPUT} value={settings.openingHours} onChange={(e) => set({ openingHours: e.target.value })} placeholder="Ej: Lun-Sáb 8am-9pm" maxLength={80} />
              </div>
              <button
                onClick={() => void patch({
                  name: settings.name,
                  address: settings.address,
                  phone: settings.phone,
                  whatsapp: settings.whatsapp,
                  deliveryFee: settings.deliveryFee,
                  etaMinutes: settings.etaMinutes,
                  openingHours: settings.openingHours,
                })}
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
                {saved ? 'Guardado' : 'Guardar cambios'}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-base font-bold text-slate-900 leading-tight">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}
