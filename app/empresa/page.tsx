'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Building2, Car, Users, Radio, RefreshCw, LogOut, MapPin, ShieldCheck, ShieldAlert, Loader2,
  Route, Wallet, Download,
} from 'lucide-react'
import { createOperatorApi } from './api'
import FleetMap, { type FleetMapPoint } from './FleetMap'
import RoutesManager from './RoutesManager'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3000'

interface OperatorInfo {
  id: string
  legalName: string
  type: string
  status: string
  isVerified: boolean
}

interface FleetPos {
  driverId: string
  driverName: string
  status: string
  online: boolean
  lat: number | null
  lng: number | null
  lastSeenAt: string | null
  vehiclePlate: string | null
  internalCode: string | null
}

interface OperatorTrip {
  id: string
  status: string
  serviceType: string
  originAddress: string
  destAddress: string
  fare: number
  distanceKm: number | null
  driverId: string | null
  driverName: string | null
  createdAt: string
  completedAt: string | null
}

interface TripsResult {
  trips: OperatorTrip[]
  summary: { total: number; completed: number; grossFare: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return 'sin datos'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace instantes'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')}`
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ONLINE: { label: 'En línea', cls: 'bg-emerald-100 text-emerald-700' },
  ON_TRIP: { label: 'En viaje', cls: 'bg-blue-100 text-blue-700' },
  OFFLINE: { label: 'Desconectado', cls: 'bg-slate-100 text-slate-500' },
}

const SERVICE_LABEL: Record<string, string> = {
  TAXI: 'Taxi', MOTO: 'Moto', PARTICULAR: 'Particular', ENVIOS: 'Envío', MANDADO: 'Mandado',
}

const TRIP_STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Completado', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-rose-100 text-rose-600' },
  SEARCHING: { label: 'Buscando', cls: 'bg-amber-100 text-amber-700' },
}
const TRIP_IN_PROGRESS: Record<string, true> = {
  ACCEPTED: true, ARRIVING: true, ARRIVED: true, IN_PROGRESS: true,
}
function tripStatusStyle(status: string): { label: string; cls: string } {
  const known = TRIP_STATUS_STYLE[status]
  if (known) return known
  if (TRIP_IN_PROGRESS[status]) return { label: 'En curso', cls: 'bg-blue-100 text-blue-700' }
  return { label: status, cls: 'bg-slate-100 text-slate-500' }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperatorPortal() {
  const [token, setToken] = useState<string | null>(null)
  const [operator, setOperator] = useState<OperatorInfo | null>(null)

  useEffect(() => {
    const t = sessionStorage.getItem('nx_operator_token')
    const o = sessionStorage.getItem('nx_operator_info')
    if (t) setToken(t)
    if (o) { try { setOperator(JSON.parse(o) as OperatorInfo) } catch { /* ignore */ } }
  }, [])

  function onLogin(t: string, o: OperatorInfo) {
    sessionStorage.setItem('nx_operator_token', t)
    sessionStorage.setItem('nx_operator_info', JSON.stringify(o))
    setToken(t)
    setOperator(o)
  }

  function logout() {
    sessionStorage.removeItem('nx_operator_token')
    sessionStorage.removeItem('nx_operator_info')
    setToken(null)
    setOperator(null)
  }

  if (!token) return <Login onLogin={onLogin} />
  return <Dashboard token={token} operator={operator} onLogout={logout} />
}

// ─── Login (OTP) ────────────────────────────────────────────────────────────────

function Login({ onLogin }: { onLogin: (t: string, o: OperatorInfo) => void }) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullPhone = phone.trim().startsWith('+') ? phone.trim() : `+57${phone.replace(/\D/g, '')}`

  async function sendOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/operator/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
      })
      if (!res.ok) { setError('No se pudo enviar el código.'); return }
      setStep('otp')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  async function verify() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/operator/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, otp: otp.trim() }),
      })
      const json = await res.json().catch(() => ({})) as { success?: boolean; error?: string; data?: { token: string; operator: OperatorInfo } }
      if (!res.ok || !json.data?.token) { setError(json.error || 'Código inválido.'); return }
      onLogin(json.data.token, json.data.operator)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mb-3">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="font-bold text-slate-900 text-lg">Portal de Empresa</h1>
          <p className="text-xs text-slate-400">Nexum · Gestión de flota</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          {step === 'phone' ? (
            <>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Teléfono del administrador</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="3001234567"
                inputMode="tel"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
              <button
                onClick={sendOtp}
                disabled={loading}
                className="mt-4 w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Enviarme el código
              </button>
            </>
          ) : (
            <>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Código (6 dígitos)</label>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                inputMode="numeric"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-center text-lg tracking-[0.4em] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
              <button
                onClick={verify}
                disabled={loading || otp.length < 6}
                className="mt-4 w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Ingresar
              </button>
              <button onClick={() => setStep('phone')} className="mt-2 w-full text-xs text-slate-400 hover:text-slate-600">
                Cambiar número
              </button>
            </>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          ¿No tienes empresa registrada?{' '}
          <Link href="/empresa/registro" className="text-emerald-600 hover:underline">Regístrala aquí</Link>
        </p>
      </div>
    </div>
  )
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────

function Dashboard({ token, operator, onLogout }: {
  token: string; operator: OperatorInfo | null; onLogout: () => void
}) {
  const [fleet, setFleet] = useState<FleetPos[]>([])
  const [counts, setCounts] = useState<{ vehicles: number; drivers: number }>({ vehicles: 0, drivers: 0 })
  const [trips, setTrips] = useState<OperatorTrip[]>([])
  const [tripsSummary, setTripsSummary] = useState<{ total: number; completed: number; grossFare: number }>({ total: 0, completed: 0, grossFare: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const expired = useRef(false)

  const api = useMemo(
    () => createOperatorApi(token, () => { expired.current = true; onLogout() }),
    [token, onLogout],
  )

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const [fleetData, profile, tripsData] = await Promise.all([
        api<FleetPos[]>('/operator/fleet'),
        api<{ _count?: { vehicles: number; drivers: number } }>('/operator/profile'),
        api<TripsResult>('/operator/trips?limit=20'),
      ])
      setFleet(Array.isArray(fleetData) ? fleetData : [])
      if (profile?._count) setCounts({ vehicles: profile._count.vehicles, drivers: profile._count.drivers })
      if (tripsData?.trips) {
        setTrips(tripsData.trips)
        setTripsSummary(tripsData.summary)
      }
      setError(null)
    } catch (e) {
      if (!expired.current) setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [api])

  useEffect(() => {
    void load()
    const t = setInterval(() => { void load() }, 10_000)
    return () => clearInterval(t)
  }, [load])

  async function downloadCsv() {
    setDownloading(true)
    try {
      const res = await fetch(`${BACKEND_URL}/operator/trips/export.csv`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('No se pudo generar el reporte.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nexum-viajes.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el reporte.')
    } finally {
      setDownloading(false)
    }
  }

  const online = fleet.filter((f) => f.online).length

  const mapPoints: FleetMapPoint[] = fleet
    .filter((f) => f.lat != null && f.lng != null)
    .map((f) => ({
      id: f.driverId,
      name: f.driverName,
      lat: f.lat as number,
      lng: f.lng as number,
      status: f.status,
      online: f.online,
      plate: f.vehiclePlate,
      lastSeen: relTime(f.lastSeenAt),
    }))

  const isIntercity = operator?.type === 'INTERCITY' || operator?.type === 'MIXED'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 text-sm truncate">{operator?.legalName ?? 'Mi empresa'}</p>
              <div className="flex items-center gap-1.5">
                {operator?.isVerified ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                    <ShieldCheck className="w-3 h-3" /> Verificada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                    <ShieldAlert className="w-3 h-3" /> Pendiente de verificación
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load(true)} disabled={refreshing}
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onLogout} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat icon={Car} label="Vehículos" value={counts.vehicles} color="bg-blue-50 text-blue-600" />
          <Stat icon={Users} label="Conductores" value={counts.drivers} color="bg-violet-50 text-violet-600" />
          <Stat icon={Radio} label="En línea" value={online} color="bg-emerald-50 text-emerald-600" />
        </div>

        {/* Fleet */}
        <section>
          <h2 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600" /> Flota en vivo
            <span className="text-slate-400 font-normal">({fleet.length})</span>
          </h2>

          {mapPoints.length > 0 && <FleetMap points={mapPoints} />}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">Cargando flota…</div>
          ) : error ? (
            <div className="bg-white border border-red-100 rounded-xl p-6 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : fleet.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Car className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-slate-600">Aún no tienes conductores afiliados</p>
              <p className="text-slate-400 text-sm mt-1">Afilia conductores e ingresa tu flota para verla aquí en tiempo real.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {fleet.map((f) => <FleetRow key={f.driverId} f={f} />)}
            </div>
          )}
        </section>

        {/* Viajes de la flota */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <Route className="w-4 h-4 text-emerald-600" /> Viajes de la flota
              <span className="text-slate-400 font-normal">({tripsSummary.total})</span>
            </h2>
            {tripsSummary.total > 0 && (
              <button
                onClick={downloadCsv}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors disabled:opacity-60"
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Exportar CSV
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <div className="inline-flex p-2 rounded-lg bg-emerald-50 text-emerald-600 mb-2"><Route className="w-4 h-4" /></div>
              <p className="text-2xl font-bold text-slate-900">{tripsSummary.completed}</p>
              <p className="text-xs text-slate-500 mt-0.5">Viajes completados</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <div className="inline-flex p-2 rounded-lg bg-blue-50 text-blue-600 mb-2"><Wallet className="w-4 h-4" /></div>
              <p className="text-2xl font-bold text-slate-900">{formatCOP(tripsSummary.grossFare)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Facturación (completados)</p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">Cargando viajes…</div>
          ) : trips.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Route className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-medium text-slate-600">Aún no hay viajes registrados</p>
              <p className="text-slate-400 text-sm mt-1">Cuando tus conductores afiliados completen carreras, aparecerán aquí para tu liquidación.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {trips.map((t) => <TripRow key={t.id} t={t} />)}
            </div>
          )}
        </section>

        {isIntercity && <RoutesManager api={api} />}

        <footer className="text-center py-2">
          <p className="text-xs text-slate-400">Los datos se actualizan automáticamente cada 10 s.</p>
        </footer>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className={`inline-flex p-2 rounded-lg ${color} mb-2`}><Icon className="w-4 h-4" /></div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function TripRow({ t }: { t: OperatorTrip }) {
  const st = tripStatusStyle(t.status)
  const service = SERVICE_LABEL[t.serviceType] ?? t.serviceType
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">{service}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
          </div>
          <p className="text-sm text-slate-900 truncate">
            <span className="text-slate-400">De</span> {t.originAddress}
          </p>
          <p className="text-sm text-slate-900 truncate">
            <span className="text-slate-400">A</span> {t.destAddress}
          </p>
          <p className="text-xs text-slate-400 mt-1 truncate">
            {t.driverName ?? 'Sin conductor'}{t.distanceKm != null ? ` · ${t.distanceKm.toFixed(1)} km` : ''} · {relTime(t.completedAt ?? t.createdAt)}
          </p>
        </div>
        <p className="font-bold text-slate-900 text-sm shrink-0">{formatCOP(t.fare)}</p>
      </div>
    </div>
  )
}

function FleetRow({ f }: { f: FleetPos }) {
  const st = STATUS_STYLE[f.status] ?? STATUS_STYLE.OFFLINE
  const hasPos = f.lat != null && f.lng != null
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${f.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 text-sm truncate">{f.driverName}</p>
        <p className="text-xs text-slate-400 truncate">
          {f.vehiclePlate ?? 'Sin vehículo'}{f.internalCode ? ` · ${f.internalCode}` : ''} · {relTime(f.lastSeenAt)}
        </p>
      </div>
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${st.cls}`}>{st.label}</span>
      {hasPos && (
        <a
          href={`https://maps.google.com/?q=${f.lat},${f.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors shrink-0"
          title="Ver en el mapa"
        >
          <MapPin className="w-4 h-4" />
        </a>
      )}
    </div>
  )
}
