'use client'

/**
 * «Revisar mi catálogo»: lo que el negocio YA tiene publicado.
 *
 * Reemplaza a «Revisar mi carta» (que solo separaba ingredientes del nombre).
 * Ahora revisa también erratas, nombres en mayúsculas, secciones escritas de
 * varias formas y —si la cuenta tiene la IA encendida— platos en la sección
 * equivocada y bebidas que deberían ofrecerse al pagar.
 *
 * NADA SE ESCRIBE A CIEGAS. El dueño ve el antes y el después de cada plato y
 * marca qué guardar: lo seguro nace marcado, lo dudoso no. Los PRECIOS no se
 * cambian nunca —no hay carta impresa contra la cual comprobarlos—; lo que no
 * cuadra sale en «Revisa esto tú».
 */

import { useState } from 'react'
import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react'
import { BOTON, ESTADO, TARJETA } from '../../../ui'
import { BACKEND_URL } from '../../../backend'

interface Valores {
  name?: string
  description?: string
  category?: string
  suggestAsAddon?: boolean
}

interface Propuesta {
  id: string
  productId: string
  grupo: 'texto' | 'seccion' | 'tipo'
  producto: string
  antes: Valores
  despues: Valores
  razones: string[]
  origen: Array<'reglas' | 'ia'>
  marcada: boolean
}

interface Aviso {
  tipo: string
  productIds: string[]
  texto: string
}

interface Revision {
  revisados: number
  propuestas: Propuesta[]
  avisos: Aviso[]
  ia: { disponible: boolean; usada: boolean; resumen?: string; motivo?: string }
}

interface Resultado {
  aplicados: number
  omitidos: Array<{ productId: string; motivo: string }>
}

const siNo = (v?: boolean) => (v ? 'Sí' : 'No')

function Cambio({ etiqueta, antes, despues }: { etiqueta?: string; antes: string; despues: string }) {
  return (
    <span className="mt-1 block text-xs">
      {etiqueta && <span className="font-semibold text-slate-500">{etiqueta}: </span>}
      {antes ? <span className="text-slate-400 line-through">{antes}</span> : <span className="text-slate-400">(vacío)</span>}
      <span className="mx-1 text-slate-400">→</span>
      <span className="font-semibold text-slate-900">{despues || '(vacío)'}</span>
    </span>
  )
}

export default function RevisarCatalogo({
  token,
  onAplicado,
}: {
  token: string
  onAplicado: () => void
}) {
  const [revision, setRevision] = useState<Revision | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  // Los nombres se guardan aparte: al terminar se cierra la revisión y hay
  // que poder decir QUÉ plato no se tocó.
  const [nombreDe, setNombreDe] = useState<Map<string, string>>(new Map())

  async function revisar() {
    setCargando(true)
    setError(null)
    setResultado(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/revisar-catalogo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ia: true }),
      })
      const json = (await res.json()) as { success: boolean; data?: Revision; error?: string }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos revisar tu catálogo.')
        return
      }
      setRevision(json.data)
      setMarcados(new Set(json.data.propuestas.filter((p) => p.marcada).map((p) => p.id)))
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }

  async function guardar() {
    if (!revision) return
    setGuardando(true)
    setError(null)
    try {
      const cambios = revision.propuestas
        .filter((p) => marcados.has(p.id))
        .map((p) => ({ productId: p.productId, antes: p.antes, despues: p.despues }))
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/revisar-catalogo/aplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios }),
      })
      const json = (await res.json()) as { success: boolean; data?: Resultado; error?: string }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos guardar los cambios.')
        return
      }
      setNombreDe(new Map(revision.propuestas.map((p) => [p.productId, p.producto])))
      setResultado(json.data)
      setRevision(null)
      onAplicado()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setGuardando(false)
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

  // ── Antes de revisar (o después de guardar) ────────────────────────────────
  if (!revision) {
    return (
      <div className={`${TARJETA} p-5 space-y-3`}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Revisa tu catálogo
        </h3>
        <p className="text-xs text-slate-500">
          Buscamos nombres mal escritos, ingredientes metidos dentro del nombre,
          nombres en mayúsculas, secciones repetidas y precios que no cuadran.
          No cambiamos nada hasta que lo apruebes, y los precios nunca los
          tocamos: si uno no cuadra, te avisamos.
        </p>
        {resultado && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <p className="flex items-center gap-1.5 font-semibold">
              <Check className="h-4 w-4" />
              {resultado.aplicados === 1 ? 'Guardamos 1 cambio.' : `Guardamos ${resultado.aplicados} cambios.`}
            </p>
            {resultado.omitidos.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-amber-800">
                {resultado.omitidos.map((o) => (
                  <li key={o.productId}>
                    {nombreDe.get(o.productId) ? `«${nombreDe.get(o.productId)}»: ` : ''}
                    {o.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <button type="button" onClick={revisar} disabled={cargando} className={BOTON.secundario}>
          {cargando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Revisando tu catálogo…
            </>
          ) : resultado ? (
            'Revisar otra vez'
          ) : (
            'Revisar mi catálogo'
          )}
        </button>
      </div>
    )
  }

  const { propuestas, avisos, ia } = revision
  const nada = propuestas.length === 0 && avisos.length === 0

  return (
    <div className={`${TARJETA} p-5 space-y-4`}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Revisamos {revision.revisados} {revision.revisados === 1 ? 'producto' : 'productos'}
        </h3>
        {ia.usada && (
          <p className="mt-1 text-xs text-slate-500">
            Con IA{ia.resumen ? ` · ${ia.resumen}` : ''}
          </p>
        )}
        {ia.motivo && <p className="mt-1 text-xs text-amber-700">{ia.motivo}</p>}
      </div>

      {nada && (
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Check className="h-4 w-4" /> Tu catálogo está bien: no encontramos nada que arreglar.
        </p>
      )}

      {propuestas.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {propuestas.length} {propuestas.length === 1 ? 'arreglo' : 'arreglos'}. Desmarca el que no
              quieras; lo de abajo es como lo verá tu cliente.
            </p>
            <div className="flex gap-3 text-xs font-semibold text-emerald-700">
              <button type="button" onClick={() => setMarcados(new Set(propuestas.map((p) => p.id)))}>
                Marcar todo
              </button>
              <button type="button" onClick={() => setMarcados(new Set())}>
                Desmarcar todo
              </button>
            </div>
          </div>

          <ul className="space-y-2">
            {propuestas.map((p) => {
              const marcado = marcados.has(p.id)
              const conIA = p.origen.includes('ia')
              return (
                <li
                  key={p.id}
                  className={`rounded-xl border p-3 ${
                    marcado ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(p.id)}
                      className="mt-1 h-5 w-5 shrink-0 accent-emerald-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900">{p.producto}</span>
                        {conIA && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ESTADO.enCurso}`}>IA</span>
                        )}
                        {!p.marcada && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ESTADO.nuevo}`}>
                            Revísalo
                          </span>
                        )}
                      </span>
                      {p.despues.name !== undefined && (
                        <Cambio etiqueta="Nombre" antes={p.antes.name ?? ''} despues={p.despues.name} />
                      )}
                      {p.despues.description !== undefined && (
                        <Cambio etiqueta="Ingredientes" antes={p.antes.description ?? ''} despues={p.despues.description} />
                      )}
                      {p.despues.category !== undefined && (
                        <Cambio etiqueta="Sección" antes={p.antes.category ?? ''} despues={p.despues.category} />
                      )}
                      {p.despues.suggestAsAddon !== undefined && (
                        <Cambio
                          etiqueta="Se ofrece al pagar"
                          antes={siNo(p.antes.suggestAsAddon)}
                          despues={siNo(p.despues.suggestAsAddon)}
                        />
                      )}
                      {p.razones.length > 0 && (
                        <span className="mt-1.5 block text-[11px] text-slate-500">{p.razones.join(' · ')}</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> Revisa esto tú
          </p>
          <p className="mt-0.5 text-[11px] text-amber-800">
            No lo cambiamos porque depende de ti. Lo arreglas editando el producto.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {avisos.map((a, i) => (
              <li key={`${a.tipo}-${i}`}>• {a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {propuestas.length > 0 && (
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || marcados.size === 0}
            className={BOTON.principal}
          >
            {guardando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
              </>
            ) : (
              `Guardar ${marcados.size} ${marcados.size === 1 ? 'cambio' : 'cambios'}`
            )}
          </button>
        )}
        <button type="button" onClick={() => setRevision(null)} className={BOTON.secundario}>
          <X className="h-4 w-4" /> {propuestas.length > 0 ? 'Cancelar' : 'Cerrar'}
        </button>
      </div>
    </div>
  )
}
