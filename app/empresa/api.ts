// Cliente HTTP compartido del Portal de Empresa. Centraliza la base URL, el
// Bearer token, el manejo de 401 (sesión expirada) y el sobre { success, data }.

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3000'

interface ApiEnvelope<T> {
  success?: boolean
  data?: T
  error?: string
}

export type OperatorApi = <T = unknown>(path: string, init?: RequestInit) => Promise<T>

/**
 * Crea un cliente autenticado. `onUnauthorized` se dispara ante un 401 para que
 * el portal cierre la sesión de forma consistente en toda la app.
 */
export function createOperatorApi(token: string, onUnauthorized: () => void): OperatorApi {
  return async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(init?.headers as Record<string, string> | undefined),
    }
    if (init?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${BACKEND_URL}${path}`, { ...init, headers, cache: 'no-store' })
    if (res.status === 401) {
      onUnauthorized()
      throw new Error('Sesión expirada')
    }
    const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>
    if (!res.ok || json.success === false) throw new Error(json.error || 'Error')
    return json.data as T
  }
}
