/**
 * Lo que la página de seguimiento decide sin tocar el navegador, para poder
 * probarlo (`backend/src/lib/seguimiento-portal.test.ts`).
 *
 * La página la abre un familiar desde WhatsApp, sin cuenta y sin app. Todo lo
 * que enseña tiene que ser cierto o callarse: un carro dibujado en una
 * posición de hace veinte minutos es peor que no dibujarlo, porque quien mira
 * cree que está ahí.
 */

/** La vista que devuelve `GET /safety/track/:token`. */
export interface ViajeCompartido {
  status: string
  statusLabel: string
  originAddress: string
  destinationAddress: string
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  stops: Array<{ name: string; lat?: number; lng?: number }>
  driverFirstName?: string
  vehicle?: { brand: string; model: string; color: string; plate: string }
  driverPosition?: { lat: number; lng: number; at: string }
  etaMinutes?: number
  arrivalEstimate?: string
  startedAt?: string
  completedAt?: string
  updatedAt: string
}

/** Estados en los que ya no hay nada que seguir: se deja de preguntar. */
export function esTerminal(status: string): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED'
}

/**
 * La hora en Colombia, 24 horas («23:39»). Se fija la zona a propósito: el
 * familiar puede estar abriendo el enlace desde España, y «llega a las 05:39»
 * le diría la hora de allá para un carro que va por Pamplona.
 */
export function horaColombia(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** «hace 20 s», «hace 3 min»: cuánto hace que el carro mandó su posición. */
export function haceCuanto(iso: string | undefined, ahora: number): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const s = Math.max(0, Math.round((ahora - t) / 1000))
  if (s < 60) return `hace ${s} s`
  return `hace ${Math.round(s / 60)} min`
}

/** El carro como lo busca quien espera: color primero y la placa aparte. */
export function describirVehiculo(v: ViajeCompartido['vehicle']): string | null {
  if (!v) return null
  const color = v.color?.trim()
  const marca = [v.brand, v.model].map((x) => x?.trim()).filter(Boolean).join(' ')
  const texto = [marca, color ? color.toLowerCase() : ''].filter(Boolean).join(' · ')
  return texto || null
}

/** Los puntos del trayecto en orden, para la línea del mapa. */
export function trazo(v: ViajeCompartido): [number, number][] {
  const puntos: [number, number][] = [[v.origin.lat, v.origin.lng]]
  for (const p of v.stops) {
    if (typeof p.lat === 'number' && typeof p.lng === 'number') puntos.push([p.lat, p.lng])
  }
  puntos.push([v.destination.lat, v.destination.lng])
  return puntos.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
}
