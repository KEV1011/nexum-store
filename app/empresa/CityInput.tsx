'use client'

import { useMemo, useState } from 'react'
import type { Municipio } from './useMunicipios'

/**
 * Campo de municipio con búsqueda.
 *
 * Era un `<select>` con siete opciones. Con cuarenta y cinco municipios en la
 * tabla, un desplegable obliga a recorrer la lista a dedo; aquí se escribe y se
 * filtra (ignorando tildes: "cucuta" encuentra "Cúcuta"). El valor que sale es
 * siempre el identificador del municipio, nunca lo que el usuario tecleó.
 */
function sinTildes(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function CityInput({
  label,
  value,
  onChange,
  municipios,
}: {
  label: string
  value: string
  onChange: (slug: string) => void
  municipios: Municipio[]
}) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)

  const seleccionado = municipios.find((m) => m.slug === value)

  const filtrados = useMemo(() => {
    const q = sinTildes(texto.trim())
    if (!q) return municipios
    return municipios.filter(
      (m) => sinTildes(m.name).includes(q) || m.slug.includes(q) || sinTildes(m.department).includes(q),
    )
  }, [texto, municipios])

  return (
    <div className="relative">
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        value={abierto ? texto : seleccionado?.name ?? value}
        placeholder="Escribe el municipio…"
        onFocus={() => { setAbierto(true); setTexto('') }}
        onChange={(e) => setTexto(e.target.value)}
        // El blur se retrasa para que el clic sobre una opción llegue primero.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="w-44 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
      />
      {abierto && (
        <ul className="absolute z-30 mt-1 w-56 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">Sin resultados</li>
          ) : (
            filtrados.map((m) => (
              <li key={m.slug}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onChange(m.slug); setAbierto(false) }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 ${
                    m.slug === value ? 'font-semibold text-emerald-700' : 'text-slate-700'
                  }`}
                >
                  {m.name}
                  <span className="block text-[11px] text-slate-400">{m.department}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
