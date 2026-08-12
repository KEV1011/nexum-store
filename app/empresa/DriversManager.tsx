'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Users, UserPlus, ShieldCheck, Clock, Star, Loader2, UserMinus, AlertTriangle, Route, Navigation,
} from 'lucide-react'
import type { OperatorApi } from './api'
import TrackMap, { type TrackPoint } from './TrackMap'

// Base HTTP del backend: TrackMap la usa para pedir los tiles de Google por proxy.
const HTTP_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

const SERVICIO: Record<string, string> = {
  trip: 'Viaje urbano',
  intercity: 'Intermunicipal',
  freight: 'Flete',
  cargo: 'Viaje de carga',
}

interface TrackLeg {
  kind: string
  serviceId: string
  points: number
  distanceKm: number
  startedAt: string
  endedAt: string
}

interface DriverTrack {
  driverName: string
  summary: {
    points: number
    distanceKm: number
    durationMin: number
    stoppedMin: number
    avgKmh: number
    startedAt: string | null
    endedAt: string | null
  }
  points: TrackPoint[]
  legs: TrackLeg[]
  gapMin: number
}

function hoyISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * El día del operador empieza a medianoche en SU reloj, no en UTC. Se calcula
 * aquí, en el navegador, y se manda ya resuelto: el servidor no puede adivinar
 * el huso de quien pregunta.
 */
function ventanaDelDia(dia: string): { from: string; to: string } {
  const [a, m, d] = dia.split('-').map(Number)
  const desde = new Date(a!, m! - 1, d!, 0, 0, 0, 0)
  const hasta = new Date(a!, m! - 1, d!, 23, 59, 59, 999)
  return { from: desde.toISOString(), to: hasta.toISOString() }
}

function duracion(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { timeStyle: 'short' }).format(new Date(iso))
}

interface OperatorDriver {
  id: string
  name: string
  phone: string
  status: string // OFFLINE | ONLINE | ON_TRIP
  isVerified: boolean
  rating: number
  totalTrips: number
  employmentType: string | null // OWN | AFFILIATED
  // Por qué no le llega trabajo: sin esto la empresa veía "verificado, en línea"
  // y ninguna pista de que el kill-switch documental lo sacó del despacho.
  complianceStatus?: string | null // CLEAR | EXPIRING | BLOCKED
  blockedReason?: string | null
  intercityEnabled?: boolean
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ONLINE: { label: 'En línea', cls: 'bg-emerald-100 text-emerald-700' },
  ON_TRIP: { label: 'En viaje', cls: 'bg-blue-100 text-blue-700' },
  OFFLINE: { label: 'Desconectado', cls: 'bg-slate-100 text-slate-500' },
}

export default function DriversManager({
  api, token, onChanged,
}: { api: OperatorApi; token?: string; onChanged?: () => void }) {
  const [drivers, setDrivers] = useState<OperatorDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [trackId, setTrackId] = useState<string | null>(null)
  const [trackDay, setTrackDay] = useState(hoyISO())
  const [track, setTrack] = useState<DriverTrack | null>(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<OperatorDriver[]>('/operator/drivers')
      setDrivers(Array.isArray(data) ? data : [])
    } catch {
      /* el error puntual se muestra al accionar */
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  async function unaffiliate(d: OperatorDriver) {
    if (!confirm(`¿Desafiliar a ${d.name}? Dejará de operar para tu empresa y sus vehículos quedarán inactivos.`)) return
    setRemovingId(d.id)
    setError(null)
    setNotice(null)
    try {
      await api(`/operator/drivers/${d.id}`, { method: 'DELETE' })
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desafiliar el conductor.')
    } finally {
      setRemovingId(null)
    }
  }

  const cargarRecorrido = useCallback(async (driverId: string, dia: string) => {
    setTrackLoading(true)
    setTrackError(null)
    setTrack(null)
    try {
      const { from, to } = ventanaDelDia(dia)
      const data = await api<DriverTrack>(
        `/operator/drivers/${driverId}/track?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      setTrack(data)
    } catch (e) {
      setTrackError(e instanceof Error ? e.message : 'No se pudo cargar el recorrido.')
    } finally {
      setTrackLoading(false)
    }
  }, [api])

  function verRecorrido(driverId: string) {
    if (trackId === driverId) { setTrackId(null); return }
    setTrackId(driverId)
    void cargarRecorrido(driverId, trackDay)
  }

  async function invite() {
    setError(null)
    setNotice(null)
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) { setError('Ingresa un celular colombiano válido (10 dígitos).'); return }
    setSaving(true)
    try {
      const created = await api<{ phone: string }>('/operator/drivers/invite', {
        method: 'POST',
        body: JSON.stringify({ phone, name: name.trim() || undefined }),
      })
      setNotice(`Conductor afiliado con el número ${created.phone}. Podrá operar cuando complete sus documentos en la app.`)
      setPhone('')
      setName('')
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo afiliar el conductor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-2">
        <Users className="w-4 h-4 text-emerald-600" /> Conductores
        <span className="text-slate-400 font-normal">({drivers.length})</span>
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Afilia conductores por su celular. Al ingresar a la app con ese número quedarán
        vinculados a tu empresa; podrán operar cuando ZIPA apruebe sus documentos.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Celular</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="3001234567"
              inputMode="tel"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none w-40"
            />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Nombre (opcional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del conductor"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
          <button
            onClick={invite}
            disabled={saving}
            className="py-2 px-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Afiliar
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {notice && <p className="text-sm text-emerald-700 mt-2">{notice}</p>}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Cargando conductores…</div>
      ) : drivers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Users className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aún no tienes conductores afiliados.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {drivers.map((d) => {
            const st = STATUS_STYLE[d.status] ?? STATUS_STYLE.OFFLINE
            return (
              <div key={d.id} className="bg-white border border-slate-200 rounded-xl">
              <div className="p-3.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 text-sm truncate">{d.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {d.phone}
                    {d.totalTrips > 0 && (
                      <span className="inline-flex items-center gap-0.5 ml-2">
                        <Star className="w-3 h-3 text-amber-400 inline" /> {d.rating.toFixed(2)} · {d.totalTrips} viajes
                      </span>
                    )}
                  </p>
                </div>
                {d.complianceStatus === 'BLOCKED' ? (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 shrink-0"
                    title={d.blockedReason || 'Tiene documentos vencidos: no recibe servicios hasta renovarlos en la app.'}
                  >
                    <AlertTriangle className="w-3 h-3" /> Docs vencidos
                  </span>
                ) : d.complianceStatus === 'EXPIRING' ? (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 shrink-0"
                    title="Algún documento está por vencer. Renuévalo antes de que deje de recibir servicios."
                  >
                    <Clock className="w-3 h-3" /> Por vencer
                  </span>
                ) : d.isVerified ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 shrink-0">
                    <ShieldCheck className="w-3 h-3" /> Verificado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 shrink-0" title="Debe completar sus documentos en la app para poder operar">
                    <Clock className="w-3 h-3" /> Docs pendientes
                  </span>
                )}
                {d.intercityEnabled && (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 shrink-0"
                    title="Recibe viajes intermunicipales"
                  >
                    <Route className="w-3 h-3" /> Intermunicipal
                  </span>
                )}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${st.cls}`}>{st.label}</span>
                <button
                  onClick={() => verRecorrido(d.id)}
                  title="Por dónde anduvo (todos los servicios del día)"
                  className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                    trackId === d.id
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <Navigation className="w-4 h-4" />
                </button>
                <button
                  onClick={() => unaffiliate(d)}
                  disabled={removingId === d.id}
                  title="Desafiliar de la empresa"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                >
                  {removingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                </button>
              </div>

              {trackId === d.id && (
                <div className="border-t border-slate-100 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-[11px] font-semibold text-slate-500">Día</label>
                    <input
                      type="date"
                      value={trackDay}
                      max={hoyISO()}
                      onChange={(e) => {
                        setTrackDay(e.target.value)
                        void cargarRecorrido(d.id, e.target.value)
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white"
                    />
                  </div>

                  {trackLoading ? (
                    <p className="text-[11px] text-slate-400">Cargando recorrido…</p>
                  ) : trackError ? (
                    <p className="text-[11px] text-red-600">{trackError}</p>
                  ) : !track || track.points.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      Sin rastro ese día. El recorrido se graba solo mientras lleva un
                      servicio en curso — un conductor en línea sin trabajo no deja traza.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Dato label="Recorrido" value={`${track.summary.distanceKm} km`} />
                        <Dato label="Jornada" value={duracion(track.summary.durationMin)} />
                        <Dato label="Detenido" value={duracion(track.summary.stoppedMin)} />
                        <Dato label="Promedio" value={`${track.summary.avgKmh} km/h`} />
                      </div>

                      {track.gapMin > 0 && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                          <p className="text-[11px] text-amber-800 flex items-start gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>
                              <span className="font-semibold">{duracion(track.gapMin)} sin reportar</span>{' '}
                              con servicio abierto. Puede ser cobertura, batería o la app cerrada.
                            </span>
                          </p>
                        </div>
                      )}

                      <TrackMap points={track.points} token={token} backendUrl={HTTP_BASE} />

                      <div className="space-y-1">
                        {track.legs.map((l, i) => (
                          <p key={`${l.serviceId}-${i}`} className="text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {SERVICIO[l.kind] ?? l.kind}
                            </span>
                            {' · '}{hora(l.startedAt)}–{hora(l.endedAt)}
                            {' · '}{l.distanceKm} km
                          </p>
                        ))}
                      </div>

                      <p className="text-[10px] text-slate-400">
                        {track.summary.points} puntos GPS · A = primer reporte, B = último.
                        Los kilómetros se suman por servicio: el trayecto entre uno y otro
                        no se grabó y no se inventa.
                      </p>
                    </>
                  )}
                </div>
              )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  )
}
