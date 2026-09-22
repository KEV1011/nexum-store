// Cliente HTTP y sesión de la página ligera de pedido (`/pedir`).
//
// POR QUÉ ESTA PÁGINA EXISTE Y NO ES LA APP
// -----------------------------------------
// La app cliente ya se compila a Flutter web, pero el runtime de Flutter pesa
// varios megas antes del código propio: en un celular de gama baja con datos
// flojos son diez o quince segundos de pantalla en blanco, y quien escanea un
// QR abandona en tres. Esta página carga en un par de segundos porque no trae
// nada más que React, `fetch` y el WebSocket del navegador — sin mapa, sin
// dependencias nuevas, sin npm install.
//
// Todo lo que hace ya existía en el backend: OTP de cliente, enlace mágico de
// WhatsApp, cotización por categorías, solicitud de viaje y chat del viaje.
// Aquí no se inventa ningún contrato; solo se le pone una puerta web.

// Mismo fallback que el portal de empresa: sin NEXT_PUBLIC_BACKEND_URL, un
// build de producción hornearía `localhost` en el bundle del navegador y la
// página no alcanzaría el backend.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

/** El WebSocket cuelga del mismo servidor HTTP, en la raíz y sin path. */
export function urlWebSocket(): string {
  return BACKEND_URL.replace(/^http/, 'ws')
}

interface Sobre<T> {
  success?: boolean
  data?: T
  error?: string
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Una llamada al backend. `token` opcional porque las tres primeras —mandar
 * código, verificarlo y canjear el enlace— ocurren antes de tener sesión.
 *
 * El mensaje de error del backend se propaga TAL CUAL: están escritos en
 * español y dicen qué hacer («ese código ya venció», «no hay conductores
 * cerca»). Sustituirlos por un «algo salió mal» genérico deja al pasajero sin
 * saber si reintentar o pedir de otra forma.
 */
export async function llamar<T>(
  path: string,
  opciones: { token?: string | null; method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (opciones.token) headers['Authorization'] = `Bearer ${opciones.token}`
  if (opciones.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: opciones.method ?? 'GET',
      headers,
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      cache: 'no-store',
    })
  } catch {
    // Un fallo de red no es un error del servidor, y decirle al pasajero que
    // «el servicio no está disponible» cuando lo que pasa es que se le fue la
    // señal lo manda a buscar taxi a otro lado sin necesidad.
    throw new ApiError('No pudimos conectarnos. Revisa tu conexión.', 0)
  }

  const json = (await res.json().catch(() => ({}))) as Sobre<T>
  if (!res.ok || json.success === false) {
    throw new ApiError(json.error ?? 'No se pudo completar la solicitud.', res.status)
  }
  return json.data as T
}

// ─── Sesión ──────────────────────────────────────────────────────────────────

const CLAVE = 'zipa_pasajero_token'

// Respaldo en memoria: en una ventana privada o con las cookies bloqueadas,
// `localStorage` lanza al tocarlo. Sin esto, la página reventaría justo al
// entrar, que es el peor momento posible.
let enMemoria: string | null = null

export function guardarToken(token: string): void {
  enMemoria = token
  try {
    window.localStorage.setItem(CLAVE, token)
  } catch {
    /* sesión solo para esta pestaña */
  }
}

export function leerToken(): string | null {
  if (enMemoria) return enMemoria
  try {
    return window.localStorage.getItem(CLAVE)
  } catch {
    return null
  }
}

export function borrarToken(): void {
  enMemoria = null
  try {
    window.localStorage.removeItem(CLAVE)
  } catch {
    /* nada que limpiar */
  }
}

// ─── Tipos del backend que usa la página ─────────────────────────────────────

export interface Punto {
  lat: number
  lng: number
  direccion: string
}

export interface OpcionViaje {
  categoria: string
  nombre: string
  descripcion: string
  capacidad: number
  fare: number
  baseFare: number
  surgeMultiplier: number
  regulada: boolean
  etaMinutes: number | null
  availableNearby: number
  disponible: boolean
  cheapest: boolean
}

export interface OpcionesViaje {
  distanceKm: number
  durationMinutes: number
  rutaReal: boolean
  opciones: OpcionViaje[]
}

export interface Viaje {
  id: string
  requestRef: string
  serviceType: string
  originAddress: string
  destinationAddress: string
  estimatedFare: number
  finalFare?: number
  totalPasajero?: number
  distanceKm: number
  etaMinutes: number
  status:
    | 'scheduled'
    | 'searching'
    | 'accepted'
    | 'arriving'
    | 'arrived'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
  driverName?: string
  driverPhotoUrl?: string
  driverRating?: number
  driverVerified?: boolean
  vehicleBrand?: string
  vehicleModel?: string
  vehicleColor?: string
  vehiclePlate?: string
  maskedPhone?: string
}

export interface MensajeChat {
  id: string
  tripId: string
  senderRole: 'client' | 'driver'
  senderId: string
  body: string
  imageUrl: string | null
  sentAt: string
}

/** Formato de peso colombiano. El símbolo va DELANTE, y el punto es de miles. */
export function pesos(v: number | undefined | null): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '$0'
  return `$${Math.round(v).toLocaleString('es-CO')}`
}
