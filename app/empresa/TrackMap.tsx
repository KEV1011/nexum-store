'use client'

import { useEffect, useRef, useState } from 'react'
import { type LMap, type LStatic, PAMPLONA, addTiles, leaflet, loadLeaflet } from './leaflet'

// Recorrido REAL del vehículo: la traza que dejó el rastro GPS, no la línea
// recta origen→destino. Es lo que se le enseña al cliente cuando reclama —
// por dónde pasó el camión y dónde estuvo detenido.

export interface TrackPoint {
  lat: number
  lng: number
  at: string
  metersFromPrev: number | null
}

function marcador(L: LStatic, color: string, etiqueta: string): unknown {
  return L.divIcon({
    className: '',
    html:
      `<span style="display:flex;align-items:center;justify-content:center;` +
      `width:22px;height:22px;border-radius:9999px;background:${color};color:#fff;` +
      `border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.2);` +
      `font:600 11px/1 system-ui,sans-serif">${etiqueta}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

export default function TrackMap({
  points,
  token,
  backendUrl,
}: {
  points: TrackPoint[]
  token?: string | null
  backendUrl?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LMap | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const L = leaflet()
        if (!L) return
        const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
        map.setView(PAMPLONA, 12)
        addTiles(L, map, token, backendUrl)
        map.invalidateSize()
        mapRef.current = map
        setReady(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
    // Se inicializa una sola vez; token/backendUrl son estables al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const L = leaflet()
    if (!L) return
    const map = mapRef.current
    const validos = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    if (validos.length === 0) return

    const coords: [number, number][] = validos.map((p) => [p.lat, p.lng])
    const linea = L.polyline(coords, { color: '#059669', weight: 4, opacity: 0.85 }).addTo(map)

    const primero = coords[0]!
    const ultimo = coords[coords.length - 1]!
    const salida = L.marker(primero, { icon: marcador(L, '#059669', 'A') }).addTo(map)
    const llegada = L.marker(ultimo, { icon: marcador(L, '#dc2626', 'B') }).addTo(map)

    map.fitBounds(coords, { padding: [30, 30], maxZoom: 15 })

    return () => { linea.remove(); salida.remove(); llegada.remove() }
  }, [ready, points])

  if (failed) {
    return (
      <div className="w-full h-64 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-400">
        No se pudo cargar el mapa.
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-64 rounded-lg overflow-hidden border border-slate-200 bg-[#1f2429] z-0" />
  )
}
