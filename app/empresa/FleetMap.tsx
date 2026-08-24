'use client'

import { useEffect, useRef, useState } from 'react'
import {
  type LMap, type LMarker, type LStatic,
  PAMPLONA, addTiles, escapeHtml, leaflet, loadLeaflet,
} from './leaflet'

// Mapa de la flota en vivo. El cargador de Leaflet, la capa de tiles y los tipos
// viven en `./leaflet`, compartidos con el mapa de recorrido histórico.

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



export default function FleetMap({
  points,
  token,
  backendUrl,
}: {
  points: FleetMapPoint[]
  token?: string | null
  backendUrl?: string
}) {
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
        const L = leaflet()
        if (!L) return
        const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
        map.setView(PAMPLONA, 13)
        addTiles(L, map, token, backendUrl)
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
    // El mapa se inicializa una sola vez; token/backendUrl son estables al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza los marcadores cada vez que cambian las posiciones.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const L = leaflet()
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

  const vacio = points.length === 0

  return (
    <div className="relative mb-3">
      <div ref={containerRef} className="w-full h-72 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 z-0" />
      {/*
        Sin nadie reportando, el mapa se queda en la ciudad y lo dice. Es la
        diferencia entre «no hay señal de nadie ahora» y «esto se rompió», que
        para quien vigila la flota son dos cosas muy distintas.
      */}
      {vacio && ready && (
        <div className="absolute inset-x-0 top-2 z-[400] flex justify-center pointer-events-none">
          <span className="bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 shadow-sm">
            Ningún conductor está reportando posición ahora
          </span>
        </div>
      )}
      <div className="absolute bottom-2 right-2 z-[400] flex items-center gap-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-600">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> En línea</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> En viaje</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Inactivo</span>
      </div>
    </div>
  )
}
