'use client'

import { use, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PortalTabs } from '../PortalTabs'
import { LocationPicker } from './LocationPicker'
import { HorarioEditor, type Franja } from './HorarioEditor'
import {
  ArrowLeft,
  Loader2,
  Store,
  Check,
  AlertCircle,
  BarChart3,
  Power,
  PauseCircle,
  Star,
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
  promoMinAmount?: number | null
  promoDiscount?: number | null
  promoFrom?: string | null
  promoUntil?: string | null
  acceptingOrders: boolean
  openingHours: string
  hours: Franja[]
  pausedUntil?: string | null
  pauseReason?: string | null
  /** Lo que ve el cliente AHORA. Lo decide el backend, no esta pantalla. */
  isOpen: boolean
  cerradoMotivo?: string | null
}

/** Lo que se manda al guardar; hay campos que no existen en la vista. */
interface SettingsPatch extends Partial<Settings> {
  pauseMinutes?: number | null
}

interface Reviews {
  rating: number | null
  ratingCount: number
  distribucion: Record<string, number>
  comentarios: Array<{ estrellas: number; comentario: string; fecha: string }>
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

/** El ISO que devuelve el backend, en el «AAAA-MM-DD» que quiere un <input date>. */
function soloFecha(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : ''
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
  const [reviews, setReviews] = useState<Reviews | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Punto del negocio: viene de /info, no de /settings (son datos distintos).
  const [geo, setGeo] = useState<{ lat?: number; lng?: number } | null>(null)
  // El motivo de la pausa se escribe ANTES de elegir cuánto dura, así que no
  // puede vivir en `settings`: todavía no se ha guardado nada.
  const [pausaMotivo, setPausaMotivo] = useState('')

  const load = useCallback(async () => {
    try {
      const [sRes, stRes, iRes, rRes] = await Promise.all([
        fetch(`${BACKEND_URL}/business/${token}/settings`, { cache: 'no-store' }),
        fetch(`${BACKEND_URL}/business/${token}/stats`, { cache: 'no-store' }),
        fetch(`${BACKEND_URL}/business/${token}/info`, { cache: 'no-store' }),
        fetch(`${BACKEND_URL}/business/${token}/reviews`, { cache: 'no-store' }),
      ])
      const rJson = (await rRes.json().catch(() => ({}))) as { data?: Reviews }
      if (rJson.data) setReviews(rJson.data)
      const iJson = (await iRes.json().catch(() => ({}))) as {
        data?: { lat?: number; lng?: number }
      }
      if (iJson.data) setGeo({ lat: iJson.data.lat, lng: iJson.data.lng })
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

  const patch = async (body: SettingsPatch) => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; data?: Settings; error?: string }
      if (json.success && json.data) {
        setSettings(json.data)
        setError(null)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        // El backend rechaza media promoción o un descuento mayor que el
        // mínimo, y su mensaje dice cuál de las dos. Callarlo dejaba al dueño
        // creyendo que había guardado.
        setError(json.error ?? 'No se pudo guardar.')
      }
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sm:sticky sm:top-0 z-10">
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

      <PortalTabs token={token} activa="ajustes" />

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
            {/* Estado real: lo que el cliente ve de tu local ahora mismo.
                No es el interruptor: puedes tenerlo encendido y estar cerrado
                por horario o por una pausa, y hasta ahora no había forma de
                enterarse sin abrir la app de cliente. */}
            <section className={`rounded-2xl border p-5 flex items-center justify-between ${
              settings.isOpen ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'
            }`}>
              <div className="flex items-center gap-3">
                <Power className={`w-6 h-6 ${settings.isOpen ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <p className="font-bold text-slate-900 text-sm">
                    {settings.isOpen ? 'Abierto · recibiendo pedidos' : 'Cerrado · no entran pedidos'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {settings.isOpen
                      ? 'Los clientes pueden pedirte ahora.'
                      : settings.cerradoMotivo
                        ? `Tus clientes ven: «${settings.cerradoMotivo}».`
                        : 'Apareces como cerrado en la app.'}
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

            {/* Pausa temporal. Es distinta de cerrar: se levanta SOLA. La
                cocina copada quiere parar veinte minutos, y si eso exige
                acordarse de volver a encender, se queda cerrada media tarde. */}
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <PauseCircle className="w-4 h-4 text-amber-600" /> Pausa rápida
              </h2>
              {settings.pausedUntil ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-900">
                    En pausa hasta las{' '}
                    <strong>
                      {new Date(settings.pausedUntil).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                    {settings.pauseReason ? ` · ${settings.pauseReason}` : ''}. Se reanuda sola.
                  </p>
                  <button
                    onClick={() => void patch({ pauseMinutes: 0 })}
                    disabled={saving}
                    className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Reanudar ahora
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500">
                    ¿Cocina copada o se acabó un ingrediente? Deja de recibir pedidos un rato
                    y vuelve a abrir solo, sin que se te olvide.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 60, 120].map((m) => (
                      <button
                        key={m}
                        onClick={() => void patch({ pauseMinutes: m, pauseReason: pausaMotivo.trim() || null })}
                        disabled={saving}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {m < 60 ? `${m} min` : `${m / 60} h`}
                      </button>
                    ))}
                  </div>
                  <input
                    className={INPUT}
                    value={pausaMotivo}
                    onChange={(e) => setPausaMotivo(e.target.value)}
                    placeholder="Motivo (opcional): se lo mostramos al cliente"
                    maxLength={60}
                  />
                </>
              )}
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

            {/* Calificaciones. Se le enseñan al dueño porque una nota sin los
                comentarios es un castigo sin explicación: sabe que bajó y no
                sabe si fue la comida, la demora o una noche mala. */}
            {reviews && (
              <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
                <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" /> Lo que dicen tus clientes
                </h2>
                {reviews.ratingCount === 0 ? (
                  <p className="text-xs text-slate-500">
                    Todavía nadie te ha calificado. Mientras tanto tu local aparece como
                    <strong> «Nuevo»</strong> en la app — no con una nota inventada.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-4">
                      <div className="text-center shrink-0">
                        <p className="text-3xl font-bold text-slate-900 leading-none">
                          {reviews.rating?.toFixed(1)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {reviews.ratingCount} {reviews.ratingCount === 1 ? 'calificación' : 'calificaciones'}
                        </p>
                      </div>
                      <div className="flex-1 space-y-1">
                        {[5, 4, 3, 2, 1].map((n) => {
                          const c = reviews.distribucion[String(n)] ?? 0
                          const pct = reviews.ratingCount ? (c / reviews.ratingCount) * 100 : 0
                          return (
                            <div key={n} className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500 w-3">{n}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[11px] text-slate-400 w-6 text-right">{c}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {reviews.comentarios.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {reviews.comentarios.slice(0, 5).map((c, i) => (
                          <div key={i} className="rounded-xl bg-slate-50 p-3">
                            <p className="text-[11px] text-amber-600 font-bold">
                              {'★'.repeat(c.estrellas)}
                              <span className="text-slate-300">{'★'.repeat(5 - c.estrellas)}</span>
                              <span className="text-slate-400 font-normal ml-2">
                                {new Date(c.fecha).toLocaleDateString('es-CO')}
                              </span>
                            </p>
                            <p className="text-xs text-slate-700 mt-1">{c.comentario}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
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
              {/* Promoción de la tienda: lo que ve el cliente como banner con
                  barra de progreso, y lo que el servidor descuenta al cobrar.
                  Es la misma cuenta: si aquí se pone algo, ahí se cobra. */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-900 mb-1">Promoción de la tienda</p>
                <p className="text-[11px] text-amber-800 mb-2">
                  «$X de descuento comprando $Y». El cliente ve una barra que le dice cuánto le
                  falta, y el descuento se aplica solo al confirmar. Deja las dos vacías para quitarla.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-amber-900 mb-1">Descuento (COP)</label>
                    <input
                      className={INPUT}
                      value={settings.promoDiscount ? String(settings.promoDiscount) : ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, '')
                        set({ promoDiscount: v === '' ? null : Number(v) })
                      }}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="6000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-amber-900 mb-1">Compra mínima (COP)</label>
                    <input
                      className={INPUT}
                      value={settings.promoMinAmount ? String(settings.promoMinAmount) : ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, '')
                        set({ promoMinAmount: v === '' ? null : Number(v) })
                      }}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="30000"
                    />
                  </div>
                </div>
                {/* Vigencia: lo que hace posible un «solo este fin de semana».
                    Sin fechas la promoción sigue puesta hasta que alguien se
                    acuerde de quitarla, y nadie se acuerda. */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-amber-900 mb-1">Desde (opcional)</label>
                    <input
                      type="date"
                      className={INPUT}
                      value={soloFecha(settings.promoFrom)}
                      onChange={(e) => set({ promoFrom: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-amber-900 mb-1">Hasta (opcional)</label>
                    <input
                      type="date"
                      className={INPUT}
                      value={soloFecha(settings.promoUntil)}
                      onChange={(e) => set({ promoUntil: e.target.value || null })}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-amber-800 mt-1.5">
                  Sin fechas, la promoción está siempre activa. Con fecha de fin, se apaga sola.
                </p>
              </div>
              <LocationPicker
                token={token}
                lat={geo?.lat}
                lng={geo?.lng}
                onSaved={(la, ln) => setGeo({ lat: la, lng: ln })}
              />
              <HorarioEditor franjas={settings.hours} onChange={(hours) => set({ hours })} />
              <button
                onClick={() => void patch({
                  name: settings.name,
                  address: settings.address,
                  phone: settings.phone,
                  whatsapp: settings.whatsapp,
                  deliveryFee: settings.deliveryFee,
                  etaMinutes: settings.etaMinutes,
                  hours: settings.hours,
                  // La promoción se quedaba fuera del guardado: el dueño
                  // escribía los dos números, pulsaba «Guardar» y no pasaba
                  // nada. Se manda SIEMPRE (aunque esté vacía) para que
                  // borrarla también funcione.
                  promoDiscount: settings.promoDiscount ?? null,
                  promoMinAmount: settings.promoMinAmount ?? null,
                  promoFrom: settings.promoFrom ?? null,
                  promoUntil: settings.promoUntil ?? null,
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
