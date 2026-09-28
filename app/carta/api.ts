// ── Cliente de la carta pública ──────────────────────────────────────────────
//
// Sin sesión y sin token: el comensal está sentado en el local y lo único que
// tiene es el código de su mesa. Mismo patrón que `/pedir` (el taxi por QR).

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface Sobre<T> {
  success?: boolean
  data?: T
  error?: string
}

export async function llamar<T>(
  path: string,
  opciones: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: opciones.method ?? 'GET',
      ...(opciones.body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opciones.body) }),
      cache: 'no-store',
    })
  } catch {
    // El wifi del local se cae más de lo que nadie admite. Decirle al comensal
    // que «el restaurante no está disponible» lo manda a pedir con el mesero
    // cuando lo único que pasa es que se le fue la señal.
    throw new ApiError('No pudimos conectarnos. Revisa tu conexión.', 0)
  }
  const json = (await res.json().catch(() => ({}))) as Sobre<T>
  if (!res.ok || json.success === false) {
    throw new ApiError(json.error ?? 'No se pudo completar la solicitud.', res.status)
  }
  return json.data as T
}

// ─── Lo que devuelve el backend ───────────────────────────────────────────────

export interface Opcion {
  id: string
  name: string
  priceDelta: number
  isAvailable: boolean
}

export interface GrupoOpciones {
  id: string
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  options: Opcion[]
}

export interface Producto {
  id: string
  name: string
  description: string
  price: number
  compareAtPrice?: number
  descuentoPct?: number
  masPedidoPuesto?: number
  category: string
  imageUrl?: string
  isAvailable: boolean
  stock?: number
  optionGroups: GrupoOpciones[]
}

export interface Carta {
  business: {
    id: string
    name: string
    address: string
    imageUrl?: string
    rating: number | null
    ratingCount: number
    isOpen: boolean
    cerradoMotivo?: string
    products: Producto[]
  }
  tables: string[]
}

export interface PedidoEnMesa {
  id: string
  /** La estrella que ya dejó, si la dejó. Se puede corregir. */
  rating?: number | null
  orderRef: string
  tableLabel: string
  businessName: string
  status: string
  subtotal: number
  total: number
  prepMinutes?: number
  acceptedAt?: string
  createdAt?: string
  items: Array<{
    productName: string
    quantity: number
    unitPrice: number
    subtotal: number
    optionsSummary?: string
    notes?: string
  }>
}

// ─── Recordar el pedido en este teléfono ─────────────────────────────────────
//
// El comensal no tiene cuenta, así que si recarga —o el navegador del teléfono
// descarta la pestaña al cambiar de app, que es lo normal— pierde su pedido sin
// forma de recuperarlo. Se guarda su id aquí.
//
// CON CADUCIDAD, y no es un detalle: sin ella, quien vuelve al restaurante la
// semana que viene abre el QR y se encuentra el almuerzo del martes pasado como
// si fuera de ahora.

const HORAS_RECUERDO = 6

function clave(codigo: string): string {
  return `zipa.carta.${codigo.toUpperCase()}`
}

export function recordarPedido(codigo: string, orderId: string): void {
  try {
    localStorage.setItem(clave(codigo), JSON.stringify({ orderId, ts: Date.now() }))
  } catch {
    // Modo privado o almacenamiento bloqueado: se sigue sin recordar nada. La
    // pantalla funciona igual mientras no se recargue.
  }
}

export function pedidoRecordado(codigo: string): string | null {
  try {
    const crudo = localStorage.getItem(clave(codigo))
    if (!crudo) return null
    const { orderId, ts } = JSON.parse(crudo) as { orderId?: string; ts?: number }
    if (typeof orderId !== 'string' || typeof ts !== 'number') return null
    if (Date.now() - ts > HORAS_RECUERDO * 3600_000) {
      olvidarPedido(codigo)
      return null
    }
    return orderId
  } catch {
    return null
  }
}

export function olvidarPedido(codigo: string): void {
  try { localStorage.removeItem(clave(codigo)) } catch { /* nada que hacer */ }
}

/** La imagen puede venir relativa (`/uploads/...`) cuando no hay R2. */
export function imagen(url: string | undefined): string | undefined {
  if (!url) return undefined
  return url.startsWith('http') ? url : `${BACKEND_URL}${url}`
}

/**
 * Lo que el comensal lee de su pedido.
 *
 * Solo cuatro estados llegan aquí: un pedido en mesa no tiene repartidor, así
 * que nunca pasa por «en camino» ni por los del intermunicipal.
 */
export function etiquetaEstado(status: string): string {
  switch (status) {
    case 'pending': return 'Enviado a la cocina'
    case 'preparing': return 'Preparándose'
    case 'delivered': return 'Servido'
    case 'cancelled': return 'Cancelado'
    default: return 'En curso'
  }
}
