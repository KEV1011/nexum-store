'use client'

// Leaflet cargado desde CDN en tiempo de ejecución, compartido por los mapas del
// portal (flota en vivo y recorrido histórico). No añadimos dependencia npm para
// no alterar el build de Vercel; se tipa solo la porción de la API que usamos
// (sin `any`). El cargador es único: dos mapas en la misma página comparten la
// misma promesa y no bajan el script dos veces.

export interface LMap {
  setView(center: [number, number], zoom: number): LMap
  fitBounds(bounds: [number, number][], opts?: Record<string, unknown>): void
  invalidateSize(): void
  remove(): void
}

export interface LLayer {
  addTo(map: LMap): LLayer
  on(event: string, handler: () => void): LLayer
  remove(): void
}

export interface LMarker {
  addTo(map: LMap): LMarker
  bindPopup(html: string): LMarker
  setLatLng(latlng: [number, number]): LMarker
  setIcon(icon: unknown): LMarker
  remove(): void
}

export interface LStatic {
  map(el: HTMLElement, opts?: Record<string, unknown>): LMap
  tileLayer(url: string, opts?: Record<string, unknown>): LLayer
  marker(latlng: [number, number], opts?: Record<string, unknown>): LMarker
  divIcon(opts: Record<string, unknown>): unknown
  polyline(latlngs: [number, number][], opts?: Record<string, unknown>): LLayer
}

export const PAMPLONA: [number, number] = [7.3754, -72.6486]

const LEAFLET_VERSION = '1.9.4'
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

let loader: Promise<void> | null = null

export function loadLeaflet(): Promise<void> {
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

/** Instancia de Leaflet ya cargada, o null si aún no está. */
export function leaflet(): LStatic | null {
  return (window as unknown as { L?: LStatic }).L ?? null
}

/**
 * Capa de tiles: mapa REAL de Google proxeado por el backend (`/geo/tile`, key
 * server-side) cuando hay token; si un tile falla (Render sin desplegar o
 * dormido, Map Tiles API sin habilitar) cae a OpenStreetMap para no dejar el
 * mapa en gris.
 */
export function addTiles(
  L: LStatic,
  map: LMap,
  token: string | null | undefined,
  backendUrl: string | undefined,
): void {
  if (!token || !backendUrl) {
    L.tileLayer(OSM_URL, { maxZoom: 19 }).addTo(map)
    return
  }
  const google = L.tileLayer(
    `${backendUrl}/geo/tile/{z}/{x}/{y}?t=${encodeURIComponent(token)}`,
    { maxZoom: 19 },
  )
  let fellBack = false
  google.on('tileerror', () => {
    if (fellBack) return
    fellBack = true
    google.remove()
    L.tileLayer(OSM_URL, { maxZoom: 19 }).addTo(map)
  })
  google.addTo(map)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[c] ?? c
  })
}
