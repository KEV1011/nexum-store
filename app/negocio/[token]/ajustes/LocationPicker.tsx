'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Loader2, Check, Crosshair } from 'lucide-react'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

// Centro de Pamplona: solo el encuadre inicial cuando el negocio aún no tiene
// punto. No se guarda nada hasta que el dueño confirme.
const CENTRO = { lat: 7.3754, lng: -72.6486 }

/**
 * Punto del negocio en el mapa.
 *
 * Sin él, el despacho de sus pedidos se ancla al centro del pueblo y el cliente
 * no puede ver dónde está el negocio mientras sigue su domicilio. Al registrar
 * se intenta deducir de la dirección escrita, pero hay direcciones que no se
 * resuelven —y los negocios anteriores no tienen ninguna—, así que el dueño
 * tiene que poder fijarlo a mano.
 *
 * Usa Leaflet por CDN, igual que el mapa de flota del portal de empresa: sin
 * dependencia npm. Los tiles salen del proxy del backend (Google si hay llave,
 * OpenStreetMap si no).
 */

interface LeafletMap {
  setView: (c: [number, number], z: number) => LeafletMap
  getCenter: () => { lat: number; lng: number }
  on: (ev: string, cb: () => void) => void
  remove: () => void
}
interface LeafletNS {
  map: (el: HTMLElement, opts?: Record<string, unknown>) => LeafletMap
  tileLayer: (url: string, opts?: Record<string, unknown>) => { addTo: (m: LeafletMap) => void }
}

function cargarLeaflet(): Promise<LeafletNS> {
  const w = window as unknown as { L?: LeafletNS }
  if (w.L) return Promise.resolve(w.L)
  return new Promise((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(css)
    const js = document.createElement('script')
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    js.onload = () => {
      const l = (window as unknown as { L?: LeafletNS }).L
      l ? resolve(l) : reject(new Error('Leaflet no cargó'))
    }
    js.onerror = () => reject(new Error('Leaflet no cargó'))
    document.head.appendChild(js)
  })
}

export function LocationPicker({
  token,
  lat,
  lng,
  onSaved,
}: {
  token: string
  lat?: number | null
  lng?: number | null
  onSaved: (lat: number, lng: number) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const centroRef = useRef({ lat: lat ?? CENTRO.lat, lng: lng ?? CENTRO.lng })

  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || !divRef.current || mapRef.current) return
    let cancelado = false
    void cargarLeaflet()
      .then((L) => {
        if (cancelado || !divRef.current) return
        const m = L.map(divRef.current, { zoomControl: true }).setView(
          [centroRef.current.lat, centroRef.current.lng],
          16,
        )
        // Dos capas: OpenStreetMap de base y encima los tiles de Google que
        // sirve el proxy. Si Google falla —sin llave, sin cuota, token
        // rechazado— la imagen de arriba simplemente no se dibuja y se ve la
        // de abajo. El mapa nunca queda gris, que es como estaba.
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(m)
        L.tileLayer(
          // El token del enlace del portal autoriza el proxy: sin él, cada
          // tile respondía 401 y el mapa salía en blanco.
          `${BACKEND_URL}/geo/tile/{z}/{x}/{y}?t=${encodeURIComponent(token)}`,
          { maxZoom: 20, attribution: '© Google' },
        ).addTo(m)
        m.on('move', () => { centroRef.current = m.getCenter() })
        mapRef.current = m
      })
      .catch(() => setError('No se pudo cargar el mapa. Revisa tu conexión.'))
    return () => { cancelado = true }
  }, [abierto, token])

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null }, [])

  const usarMiUbicacion = useCallback(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        centroRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17)
      },
      () => setError('No pudimos obtener tu ubicación. Mueve el mapa a mano.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [])

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const { lat: la, lng: ln } = centroRef.current
      const res = await fetch(`${BACKEND_URL}/business/${token}/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: la, lng: ln }),
      })
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!res.ok || json.success === false) {
        setError(json.error ?? 'No se pudo guardar la ubicación.')
        return
      }
      setGuardado(true)
      onSaved(la, ln)
      setTimeout(() => { setGuardado(false); setAbierto(false) }, 1200)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  const yaTiene = lat != null && lng != null

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          yaTiene ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-600'
        }`}>
          <MapPin className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 text-sm">Ubicación en el mapa</p>
          <p className="text-xs text-slate-500">
            {yaTiene
              ? 'Tu negocio ya está ubicado. El repartidor y el cliente lo ven aquí.'
              : 'Sin ubicación, los repartidores se buscan desde el centro del pueblo y el cliente no ve tu local en el mapa.'}
          </p>
        </div>
      </div>

      {!abierto ? (
        <button
          onClick={() => setAbierto(true)}
          className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          {yaTiene ? 'Cambiar ubicación' : 'Ubicar mi negocio en el mapa'}
        </button>
      ) : (
        <>
          <div className="relative">
            <div ref={divRef} className="h-64 w-full rounded-lg overflow-hidden bg-slate-100" />
            {/* Pin fijo al centro: se mueve el mapa, no el pin. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-teal-700 drop-shadow" style={{ transform: 'translateY(-14px)' }} />
            </div>
          </div>
          <p className="text-xs text-slate-500 text-center">
            Mueve el mapa hasta que el pin quede sobre la puerta de tu negocio.
          </p>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex gap-2">
            <button
              onClick={usarMiUbicacion}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Crosshair className="w-3.5 h-3.5" /> Estoy aquí
            </button>
            <button
              onClick={() => void guardar()}
              disabled={guardando}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : guardado ? <Check className="w-4 h-4" /> : null}
              {guardado ? 'Guardado' : 'Confirmar este punto'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
