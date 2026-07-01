'use client'

import { useEffect, useRef, useState } from 'react'

// Mapa de flota con Leaflet cargado desde CDN en tiempo de ejecución. No añadimos
// dependencia npm para no alterar el build de Vercel; tipamos solo la porción de
// la API de Leaflet que usamos (sin `any`).

export interface FleetMapPoint {
  id: string
  name: string
  lat: number
  lng: number
  status: string
  online: boolean
  plate: string | null
  lastSeen: string
}

interface LMap {
  setView(center: [number, number], zoom: number): LMap
  fitBounds(bounds: [number, number][], opts?: Record<string, unknown>): void
  invalidateSize(): void
  remove(): void
}
interface LLayer { addTo(map: LMap): LLayer }
interface LMarker {
  addTo(map: LMap): LMarker
  bindPopup(html: string): LMarker
  setLatLng(latlng: [number, number]): LMarker
  setIcon(icon: unknown): LMarker
  remove(): void
}
interface LStatic {
  map(el: HTMLElement, opts?: Record<string, unknown>): LMap
  tileLayer(url: string, opts?: Record<string, unknown>): LLayer
  marker(latlng: [number, number], opts?: Record<string, unknown>): LMarker
  divIcon(opts: Record<string, unknown>): unknown
}

const PAMPLONA: [number, number] = [7.3754, -72.6486]
const LEAFLET_VERSION = '1.9.4'

let loader: Promise<void> | null = null
function loadLeaflet(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if ((window as unknown as { L?: LStatic }).L) return Promise.resolve()
  if (loader) return loader
  loader = new Promise<void>((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
      link.setAttribute('data-leaflet', '1')
      document.head.appendChild(link)
    }
    const s = document.createElement('script')
    s.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar Leaflet'))
    document.body.appendChild(s)
  })
  return loader
}

function colorFor(p: FleetMapPoint): string {
  if (p.status === 'ON_TRIP') return '#2563eb'
  if (p.online) return '#10b981'
  return '#94a3b8'
}

function dotIcon(L: LStatic, color: string): unknown {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[c] ?? c
  })
}

export default function FleetMap({ points }: { points: FleetMapPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LMap | null>(null)
  const markersRef = useRef<globalThis.Map<string, LMarker>>(new globalThis.Map())
  const fittedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const L = (window as unknown as { L: LStatic }).L
        const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
        map.setView(PAMPLONA, 13)
        L.tileLayer(`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, { maxZoom: 19 }).addTo(map)
        map.invalidateSize()
        mapRef.current = map
        setReady(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      markersRef.current.clear()
    }
  }, [])

  // Sincroniza los marcadores cada vez que cambian las posiciones.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const L = (window as unknown as { L?: LStatic }).L
    if (!L) return
    const map = mapRef.current
    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    const seen = new Set<string>()

    for (const p of valid) {
      seen.add(p.id)
      const popup = `<strong>${escapeHtml(p.name)}</strong><br/>${p.plate ? escapeHtml(p.plate) + ' · ' : ''}${escapeHtml(p.lastSeen)}`
      const existing = markersRef.current.get(p.id)
      if (existing) {
        existing.setLatLng([p.lat, p.lng])
        existing.setIcon(dotIcon(L, colorFor(p)))
        existing.bindPopup(popup)
      } else {
        const m = L.marker([p.lat, p.lng], { icon: dotIcon(L, colorFor(p)) }).addTo(map).bindPopup(popup)
        markersRef.current.set(p.id, m)
      }
    }
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) { m.remove(); markersRef.current.delete(id) }
    }
    if (valid.length > 0 && !fittedRef.current) {
      fittedRef.current = true
      map.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 15 })
    }
  }, [ready, points])

  if (failed) {
    return (
      <div className="w-full h-72 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-400 mb-3">
        No se pudo cargar el mapa. Revisa la lista de abajo.
      </div>
    )
  }

  return (
    <div className="relative mb-3">
      <div ref={containerRef} className="w-full h-72 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 z-0" />
      <div className="absolute bottom-2 right-2 z-[400] flex items-center gap-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-600">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> En línea</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> En viaje</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Inactivo</span>
      </div>
    </div>
  )
}
