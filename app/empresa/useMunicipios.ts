'use client'

import { useEffect, useState } from 'react'

/**
 * Municipios a los que se puede viajar, traídos del backend.
 *
 * Antes cada manager del portal llevaba su propia lista de siete ciudades
 * escritas a mano: la empresa podía declarar rutas y publicar salidas solo
 * entre esas siete, aunque el cliente ya pudiera pedir viaje a cualquiera de
 * los cuarenta y cinco de la tabla. Aquí se leen una sola vez y se comparten.
 *
 * Si la petición falla se conservan los siete de siempre: mejor una lista corta
 * que un desplegable vacío.
 */
export interface Municipio {
  slug: string
  name: string
  department: string
}

const RESPALDO: Municipio[] = [
  { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander' },
  { slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander' },
  { slug: 'bucaramanga', name: 'Bucaramanga', department: 'Santander' },
  { slug: 'chitaga', name: 'Chitagá', department: 'Norte de Santander' },
  { slug: 'malaga', name: 'Málaga', department: 'Santander' },
  { slug: 'ocana', name: 'Ocaña', department: 'Norte de Santander' },
  { slug: 'bogota', name: 'Bogotá', department: 'Cundinamarca' },
]

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

let _cache: Municipio[] | null = null

export function useMunicipios(): {
  municipios: Municipio[]
  etiqueta: (slug: string) => string
} {
  const [municipios, setMunicipios] = useState<Municipio[]>(_cache ?? RESPALDO)

  useEffect(() => {
    if (_cache) return
    let vivo = true
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/geo/municipios`, { cache: 'no-store' })
        const json = (await res.json()) as { data?: Municipio[] }
        if (!vivo || !json.data?.length) return
        _cache = json.data
        setMunicipios(json.data)
      } catch {
        /* sin red: se queda con el respaldo */
      }
    })()
    return () => { vivo = false }
  }, [])

  // Acepta también los valores en MAYÚSCULAS de las rutas declaradas antes de
  // que los municipios fueran una tabla.
  const etiqueta = (slug: string): string =>
    municipios.find((m) => m.slug === slug.toLowerCase())?.name ?? slug

  return { municipios, etiqueta }
}
