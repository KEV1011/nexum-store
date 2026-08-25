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
 * Cambia una sesión por un pase de dos horas que solo sirve para pedir tiles.
 *
 * El permiso de una capa de tiles viaja en la URL de cada imagen —Leaflet monta
 * `<img src>`, no puede poner cabeceras— y una panorámica son decenas. Metiendo
 * ahí el token de sesión, este acababa en los registros del servidor, en
 * cualquier proxy y en el historial del navegador. El pase, si se filtra, solo
 * sirve para mirar mapas.
 *
 * `auth` distingue las dos sesiones del sistema: el JWT del portal de empresas
 * y el token del enlace mágico del portal de negocios.
 */
export async function tilePase(
  backendUrl: string,
  auth: { bearer?: string | null; businessToken?: string | null },
): Promise<string | null> {
  try {
    const headers: Record<string, string> = {}
    if (auth.bearer) headers['Authorization'] = `Bearer ${auth.bearer}`
    if (auth.businessToken) headers['X-Business-Token'] = auth.businessToken
    const res = await fetch(`${backendUrl}/geo/tile-ticket`, { headers })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: { ticket?: string } }
    return body.data?.ticket ?? null
  } catch {
    return null
  }
}

/**
 * Capa de tiles: OpenStreetMap de entrada y, en cuanto llega el pase, encima el
 * mapa REAL de Google proxeado por el backend (`/geo/tile`, key server-side).
 * Empezar por OSM en vez de esperar mantiene el mapa útil desde el primer
 * instante; si Google falla —sin llave, sin cuota, pase vencido— la capa de
 * arriba se retira y abajo sigue estando el mapa de siempre, nunca gris.
 */
export function addTiles(
  L: LStatic,
  map: LMap,
  token: string | null | undefined,
  backendUrl: string | undefined,
  auth: 'bearer' | 'business' = 'bearer',
): void {
  // La clase la usa `globals.css` para oscurecer SOLO estas teselas: las de
  // Google ya vienen oscuras del estilo que el backend fija en la sesión, y
  // filtrarlas también las volvería a aclarar.
  const osm = L.tileLayer(OSM_URL, { maxZoom: 19, className: 'nx-tesela-clara' })
  osm.addTo(map)
  if (!token || !backendUrl) return

  void tilePase(
    backendUrl,
    auth === 'business' ? { businessToken: token } : { bearer: token },
  ).then((pase) => {
    if (!pase) return
    const google = L.tileLayer(
      `${backendUrl}/geo/tile/{z}/{x}/{y}?t=${encodeURIComponent(pase)}`,
      { maxZoom: 19 },
    )
    let cayo = false
    google.on('tileerror', () => {
      if (cayo) return
      cayo = true
      google.remove()
    })
    google.addTo(map)
  })
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[c] ?? c
  })
}
