'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Building2, Car, RefreshCw, LogOut, MapPin, ShieldCheck, ShieldAlert, Loader2,
  Route, Wallet, Download, LayoutDashboard, UserCog, TrendingUp, Truck, Bus,
} from 'lucide-react'
import { createOperatorApi } from './api'
import FleetMap, { type FleetMapPoint } from './FleetMap'
import RoutesManager from './RoutesManager'
import SchedulesManager from './SchedulesManager'
import DriversManager from './DriversManager'
import FreightManager from './FreightManager'
import FinancePanel from './FinancePanel'
import VehiclesManager from './VehiclesManager'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

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
  PEDIDO: 'Pedido', INTERCITY: 'Intermunicipal',
}

const TRIP_STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: 'Completado', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-rose-100 text-rose-600' },
  SEARCHING: { label: 'Buscando', cls: 'bg-amber-100 text-amber-700' },
  DRIVER_FOUND: { label: 'Contraoferta', cls: 'bg-amber-100 text-amber-700' },
}
const TRIP_IN_PROGRESS: Record<string, true> = {
  ACCEPTED: true, ARRIVING: true, ARRIVED: true, IN_PROGRESS: true, CONFIRMED: true,
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
  // Blindaje anti-autofill de Chrome: el campo nace readOnly (Chrome no lo
  // toma como objetivo de autocompletado ni lo bloquea) y se vuelve editable
  // al enfocarlo. Es el fix definitivo del "no deja escribir ningún número".
  const [phoneFocused, setPhoneFocused] = useState(false)
  const [otpFocused, setOtpFocused] = useState(false)

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
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) sendOtp() }}
                placeholder="3001234567"
                inputMode="tel"
                autoComplete="off"
                name="nx-acceso"
                readOnly={!phoneFocused}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
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
              {/* autoComplete=one-time-code: sin él, Chrome autollenaba el campo con
                  valores recordados (p. ej. un número guardado) y, con maxLength 6,
                  el usuario no podía escribir el código real. */}
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && otp.length === 6 && !loading) verify() }}
                placeholder="••••••"
                inputMode="numeric"
                autoComplete="off"
                name="nx-codigo"
                autoFocus
                readOnly={!otpFocused}
                onFocus={() => setOtpFocused(true)}
                onBlur={() => setOtpFocused(false)}
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
  // Se incrementa al afiliar un conductor para que Vehículos recargue su selector.
  const [teamVersion, setTeamVersion] = useState(0)
  // Sección activa de la torre de control (sidebar / chips móviles).
  const [section, setSection] = useState('torre')
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
  const isCargo = operator?.type === 'CARGA' || operator?.type === 'MIXED'

  // Torre de control: estados de la flota en vivo (mismo feed de /operator/fleet).
  const available = fleet.filter((f) => f.online && f.status === 'ONLINE').length
  const onTrip = fleet.filter((f) => f.status === 'ON_TRIP').length

  const nav = [
    { key: 'torre', label: 'Torre de control', icon: LayoutDashboard, show: true },
    { key: 'equipo', label: 'Equipo y vehículos', icon: UserCog, show: true },
    { key: 'viajes', label: 'Viajes y liquidación', icon: Route, show: true },
    { key: 'finanzas', label: 'Finanzas', icon: TrendingUp, show: true },
    { key: 'carga', label: 'Fletes de carga', icon: Truck, show: isCargo },
    { key: 'intermunicipal', label: 'Intermunicipal', icon: Bus, show: isIntercity },
  ].filter((n) => n.show)

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      {/* ── Sidebar (escritorio) — torre de control estilo centro de operaciones ── */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-slate-950 text-slate-300 sticky top-0 h-screen">
        <div className="px-4 py-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-sm truncate">{operator?.legalName ?? 'Mi empresa'}</p>
            {operator?.isVerified ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <ShieldCheck className="w-3 h-3" /> Verificada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                <ShieldAlert className="w-3 h-3" /> En verificación
              </span>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => setSection(n.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                section === n.key
                  ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              <n.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800 flex items-center gap-2">
          <button onClick={() => load(true)} disabled={refreshing}
            title="Actualizar datos"
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-700 text-slate-300 text-xs font-semibold hover:border-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button onClick={onLogout} title="Cerrar sesión"
            className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:border-red-400 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* ── Header móvil + navegación por chips ── */}
        <header className="md:hidden bg-slate-950 text-white sticky top-0 z-10">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <p className="font-bold text-sm truncate">{operator?.legalName ?? 'Mi empresa'}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => load(true)} disabled={refreshing} className="p-2 rounded-lg text-slate-300 hover:text-white">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onLogout} className="p-2 rounded-lg text-slate-300 hover:text-red-400">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          <nav className="px-3 pb-2.5 flex gap-1.5 overflow-x-auto">
            {nav.map((n) => (
              <button key={n.key} onClick={() => setSection(n.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  section === n.key ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                <n.icon className="w-3.5 h-3.5" /> {n.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {/* ══ TORRE DE CONTROL ══ */}
          {section === 'torre' && (
            <>
              <div className="flex items-center justify-between">
                <h1 className="font-bold text-slate-900 text-lg">Torre de control</h1>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> EN VIVO · 10 s
                </span>
              </div>

              {/* KPIs de operación en tiempo real */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
                <Kpi label="En línea" value={online} tone="emerald" />
                <Kpi label="Disponibles" value={available} tone="emerald" />
                <Kpi label="En viaje" value={onTrip} tone="blue" />
                <Kpi label="Conductores" value={counts.drivers} tone="slate" />
                <Kpi label="Vehículos" value={counts.vehicles} tone="slate" />
                <Kpi label="Completados" value={tripsSummary.completed} tone="slate" />
              </div>

              <section>
                <h2 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" /> Mapa de la flota
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
                    <p className="text-slate-400 text-sm mt-1">Afilia conductores en «Equipo y vehículos» para verlos aquí en tiempo real.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 mt-3">
                    {fleet.map((f) => <FleetRow key={f.driverId} f={f} />)}
                  </div>
                )}
              </section>
            </>
          )}

          {/* ══ EQUIPO Y VEHÍCULOS ══ */}
          {section === 'equipo' && (
            <>
              <h1 className="font-bold text-slate-900 text-lg">Equipo y vehículos</h1>
              <DriversManager api={api} onChanged={() => { setTeamVersion((v) => v + 1); void load() }} />
              <VehiclesManager api={api} refreshKey={teamVersion} />
            </>
          )}

          {/* ══ VIAJES Y LIQUIDACIÓN ══ */}
          {section === 'viajes' && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h1 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  Viajes y liquidación
                  <span className="text-slate-400 font-normal text-sm">({tripsSummary.total})</span>
                </h1>
                {tripsSummary.total > 0 && (
                  <button
                    onClick={downloadCsv}
                    disabled={downloading}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:border-emerald-300 hover:text-emerald-700 transition-colors disabled:opacity-60"
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
          )}

          {/* ══ FINANZAS ══ */}
          {section === 'finanzas' && (
            <>
              <h1 className="font-bold text-slate-900 text-lg">Finanzas</h1>
              <FinancePanel api={api} />
            </>
          )}

          {/* ══ CARGA ══ */}
          {section === 'carga' && isCargo && (
            <>
              <h1 className="font-bold text-slate-900 text-lg">Fletes de carga</h1>
              <FreightManager api={api} token={token ?? ''} />
            </>
          )}

          {/* ══ INTERMUNICIPAL ══ */}
          {section === 'intermunicipal' && isIntercity && (
            <>
              <h1 className="font-bold text-slate-900 text-lg">Intermunicipal</h1>
              <SchedulesManager api={api} />
              <RoutesManager api={api} />
            </>
          )}

          <footer className="text-center py-2">
            <p className="text-xs text-slate-400">Los datos se actualizan automáticamente cada 10 s.</p>
          </footer>
        </div>
      </div>
    </div>
  )
}

/** KPI de la torre de control: número grande + etiqueta, tono por estado. */
function Kpi({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'blue' | 'slate' }) {
  const tones = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    slate: 'text-slate-900',
  } as const
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
      <p className={`text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{label}</p>
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
