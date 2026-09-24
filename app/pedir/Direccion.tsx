'use client'

import { useEffect, useRef, useState } from 'react'
import { llamar, type Punto } from './api'

interface Sugerencia {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

/**
 * Campo de dirección con autocompletado, sobre el proxy `/geo` del backend
 * (la llave de Google vive en el servidor y nunca baja al navegador).
 *
 * DOS BUSCADORES, NO UNO. Places predice sitios con nombre y direcciones ya
 * conocidas, pero la nomenclatura colombiana tal como está en un recibo
 * —«carrera 4a#10-53»— casi nunca la predice. Por eso, cuando el
 * autocompletado se queda en blanco, se ofrece resolverla con Geocoding, que
 * sí la entiende. Se pregunta solo al quedarse vacío y no en cada tecla:
 * una llamada por pulsación sería tirar cuota.
 *
 * Sin `GOOGLE_MAPS_API_KEY` en el servidor las dos devuelven vacío. En ese
 * caso el campo NO se bloquea: el pasajero escribe la dirección a mano y el
 * viaje sale sin coordenadas exactas, que es peor pero no es nada.
 */
export function Direccion({
  etiqueta,
  valor,
  onElegir,
  onTextoLibre,
  cerca,
  autoFocus,
}: {
  etiqueta: string
  valor: Punto | null
  onElegir: (p: Punto) => void
  /** Lo que escribió sin elegir ninguna sugerencia. */
  onTextoLibre: (texto: string) => void
  /** Para sesgar los resultados a la zona del pasajero. */
  cerca?: { lat: number; lng: number } | null
  autoFocus?: boolean
}) {
  const [texto, setTexto] = useState(valor?.direccion ?? '')
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [abierto, setAbierto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [sinResultados, setSinResultados] = useState(false)
  const [resolviendo, setResolviendo] = useState(false)

  // El texto lo puede cambiar el padre (el origen que llegó por WhatsApp, o el
  // GPS del navegador), y entonces el campo tiene que reflejarlo.
  const ultimoValor = useRef<string | null>(null)
  useEffect(() => {
    const dir = valor?.direccion ?? null
    if (dir !== null && dir !== ultimoValor.current) {
      ultimoValor.current = dir
      setTexto(dir)
      setAbierto(false)
    }
  }, [valor])

  useEffect(() => {
    const q = texto.trim()
    if (q.length < 3 || !abierto) {
      setSugerencias([])
      setSinResultados(false)
      return
    }
    // Antirrebote: sin él sale una llamada por letra.
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const params = new URLSearchParams({ input: q })
        if (cerca) {
          params.set('lat', String(cerca.lat))
          params.set('lng', String(cerca.lng))
        }
        const res = await llamar<Sugerencia[]>(`/geo/autocomplete?${params}`)
        setSugerencias(res)
        setSinResultados(res.length === 0)
      } catch {
        // Sin llave o con el proxy caído no se inventa nada: simplemente no
        // hay sugerencias y el pasajero puede escribir a mano.
        setSugerencias([])
        setSinResultados(true)
      } finally {
        setBuscando(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [texto, abierto, cerca])

  async function elegir(s: Sugerencia) {
    setAbierto(false)
    setTexto(s.description)
    try {
      const d = await llamar<{ lat: number; lng: number; address: string }>(
        `/geo/place/${encodeURIComponent(s.placeId)}`,
      )
      ultimoValor.current = d.address || s.description
      onElegir({ lat: d.lat, lng: d.lng, direccion: d.address || s.description })
    } catch {
      // Se queda como texto libre: mejor un viaje con la dirección escrita que
      // ninguno.
      onTextoLibre(s.description)
    }
  }

  async function resolverEscrita() {
    const q = texto.trim()
    if (q.length < 5) return
    setResolviendo(true)
    try {
      const d = await llamar<{ lat: number; lng: number; address: string } | null>(
        `/geo/geocode?address=${encodeURIComponent(q)}`,
      )
      if (d) {
        ultimoValor.current = d.address || q
        setTexto(d.address || q)
        setAbierto(false)
        onElegir({ lat: d.lat, lng: d.lng, direccion: d.address || q })
      } else {
        setSinResultados(true)
      }
    } catch {
      setSinResultados(true)
    } finally {
      setResolviendo(false)
    }
  }

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-slate-500 mb-1">{etiqueta}</label>
      <input
        value={texto}
        autoFocus={autoFocus}
        onChange={(e) => {
          setTexto(e.target.value)
          setAbierto(true)
          onTextoLibre(e.target.value)
        }}
        onFocus={() => setAbierto(true)}
        placeholder="Calle 5 # 3-40, barrio o sitio"
        className="w-full border border-slate-300 rounded-xl px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        autoComplete="off"
      />

      {valor && !abierto && (
        <span className="absolute right-3 top-9 text-emerald-600 text-sm" aria-hidden>
          ✓
        </span>
      )}

      {abierto && (sugerencias.length > 0 || sinResultados || buscando) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {buscando && <p className="px-3 py-2 text-xs text-slate-400">Buscando…</p>}

          {sugerencias.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => elegir(s)}
              className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
            >
              <span className="block text-sm font-medium text-slate-800">{s.mainText}</span>
              <span className="block text-xs text-slate-400">{s.secondaryText}</span>
            </button>
          ))}

          {/* El callejón sin salida que hay que evitar: el buscador vacío y sin
              explicación. Se dice qué pasa y se ofrece la otra vía. */}
          {!buscando && sinResultados && (
            <div className="px-3 py-2.5">
              <p className="text-xs text-slate-500">
                No encontramos ese sitio. Puedes escribir la dirección completa
                (por ejemplo «Calle 5 # 3-40»).
              </p>
              {texto.trim().length >= 5 && (
                <button
                  type="button"
                  onClick={resolverEscrita}
                  disabled={resolviendo}
                  className="mt-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                >
                  {resolviendo ? 'Ubicando…' : `Usar «${texto.trim()}»`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
