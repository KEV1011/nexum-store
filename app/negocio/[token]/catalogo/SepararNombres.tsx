'use client'

/**
 * «Separa los ingredientes del nombre» para el catálogo que ya está cargado.
 *
 * Los platos que se subieron antes traen el nombre y la receta en el mismo
 * campo: en la app salen con elipsis y el precio se va fuera de la vista.
 * Esto los arregla, pero PROPONIENDO — son nombres de platos de un negocio
 * real y la regla puede equivocarse en un renglón raro, así que el dueño ve
 * el antes y el después de cada uno y marca cuáles aplica. Es el mismo
 * criterio que la vista previa obligatoria del CSV: nada se escribe a ciegas.
 */

import { useState } from 'react'
import { Scissors, Check, X, Loader2 } from 'lucide-react'
import { BOTON, TARJETA } from '../../../ui'
import { BACKEND_URL } from '../../../backend'


interface Propuesta {
  productId: string
  antes: string
  nombre: string
  descripcion: string
}

export default function SepararNombres({
  token,
  onAplicado,
}: {
  token: string
  onAplicado: () => void
}) {
  const [propuestas, setPropuestas] = useState<Propuesta[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function revisar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/separar-nombres`)
      const json = (await res.json()) as {
        success: boolean
        data?: { propuestas: Propuesta[] }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos revisar tu carta.')
        return
      }
      setPropuestas(json.data.propuestas)
      // Nacen todas marcadas: si la regla acierta —que es lo normal— el dueño
      // solo tiene que desmarcar la excepción, no marcar cuarenta platos.
      setMarcados(new Set(json.data.propuestas.map((p) => p.productId)))
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }

  async function aplicar() {
    setAplicando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/separar-nombres`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [...marcados] }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'No pudimos separar los nombres.')
        return
      }
      setPropuestas(null)
      onAplicado()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setAplicando(false)
    }
  }

  function alternar(id: string) {
    setMarcados((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return s
    })
  }

  if (propuestas === null) {
    return (
      <div className={TARJETA}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Scissors className="h-4 w-4 text-emerald-600" />
          ¿Tus platos tienen los ingredientes dentro del nombre?
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Si tu carta dice «Hamburguesa Camarón (croqueta, queso, salsas)», el
          nombre se corta en la app y el precio queda fuera de la vista.
          Revisamos tu catálogo y te proponemos cómo separarlo. No se cambia
          nada hasta que lo apruebes.
        </p>
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        <button
          type="button"
          onClick={revisar}
          disabled={cargando}
          className={`${BOTON.secundario} mt-3`}
        >
          {cargando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Revisando…
            </>
          ) : (
            'Revisar mi carta'
          )}
        </button>
      </div>
    )
  }

  if (propuestas.length === 0) {
    return (
      <div className={TARJETA}>
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Check className="h-4 w-4" /> Tus platos ya están bien: ninguno trae
          los ingredientes dentro del nombre.
        </p>
      </div>
    )
  }

  return (
    <div className={TARJETA}>
      <h3 className="text-sm font-bold text-slate-900">
        {propuestas.length} {propuestas.length === 1 ? 'plato' : 'platos'} se
        pueden separar
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Desmarca el que no quieras cambiar. Lo de abajo es como lo verá tu
        cliente.
      </p>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <ul className="mt-3 space-y-2">
        {propuestas.map((p) => {
          const marcado = marcados.has(p.productId)
          return (
            <li
              key={p.productId}
              className={`rounded-xl border p-2.5 ${
                marcado ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
              }`}
            >
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(p.productId)}
                  className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-slate-400 line-through">
                    {p.antes}
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold text-slate-900">
                    {p.nombre}
                  </span>
                  <span className="block text-xs text-slate-600">{p.descripcion}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={aplicar}
          disabled={aplicando || marcados.size === 0}
          className={BOTON.principal}
        >
          {aplicando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            `Separar ${marcados.size} ${marcados.size === 1 ? 'plato' : 'platos'}`
          )}
        </button>
        <button
          type="button"
          onClick={() => setPropuestas(null)}
          className={BOTON.secundario}
        >
          <X className="h-4 w-4" /> Cancelar
        </button>
      </div>
    </div>
  )
}
