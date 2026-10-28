'use client'

import { useEffect, useState } from 'react'
import { BACKEND_URL } from '../../backend'
import type { RolPortal } from '../acceso'

export interface Acceso {
  rol: RolPortal
  rolNombre: string
  nombre: string | null
  negocio: string
}

/** Lo pedido por enlace, para que cada pantalla no lo vuelva a pedir. */
const _cache = new Map<string, Promise<Acceso | null>>()

function _pedir(token: string): Promise<Acceso | null> {
  let p = _cache.get(token)
  if (!p) {
    p = fetch(`${BACKEND_URL}/business/${encodeURIComponent(token)}/acceso`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null
        const json = (await res.json()) as { success?: boolean; data?: Acceso }
        return json.success && json.data ? json.data : null
      })
      .catch(() => {
        // Un fallo de red no puede dejar la respuesta cacheada para siempre.
        _cache.delete(token)
        return null
      })
    _cache.set(token, p)
  }
  return p
}

/**
 * Quién abrió este enlace: el dueño o alguien del equipo, con su rol.
 *
 * `cargando` = todavía no se sabe. Si el servidor es viejo y no conoce
 * `/acceso`, se da por dueño: es lo que era todo enlace antes del equipo.
 */
export function useAcceso(token: string): { acceso: Acceso | null; cargando: boolean } {
  const [acceso, setAcceso] = useState<Acceso | null>(null)
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    let vivo = true
    void _pedir(token).then((a) => {
      if (!vivo) return
      setAcceso(a ?? { rol: 'DUENO', rolNombre: 'Dueño', nombre: null, negocio: '' })
      setCargando(false)
    })
    return () => {
      vivo = false
    }
  }, [token])
  return { acceso, cargando }
}
