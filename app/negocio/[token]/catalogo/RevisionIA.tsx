'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, Undo2, Redo2, Check, X, AlertTriangle, Send } from 'lucide-react'

import { BOTON } from '../../../ui'
import { BACKEND_URL } from '../../../backend'
import {
  aplicarCambio,
  deshacerCambio,
  filaParaRevisar,
  type CambioIA,
  type FilaDePantalla,
  type VarianteIA,
} from './revision-ia'

type EstadoCambio = 'aplicado' | 'deshecho' | 'pendiente' | 'ignorado' | 'choca'

interface Entrada {
  cambio: CambioIA
  estado: EstadoCambio
  /** De dónde salió: la revisión de la foto o lo que pidió el dueño. */
  origen: 'revision' | 'pedido'
}

interface Respuesta {
  success: boolean
  data?: { resumen: string; aplicadas: CambioIA[]; sugerencias: CambioIA[]; descartadas: number }
  error?: string
}

/**
 * La foto se REDUCE antes de mandarla a la revisión: una de teléfono pesa 4–8
 * MB y la IA lee igual de bien una de 1600 px. Es menos espera para el dueño y
 * menos costo por revisión. Si el navegador no puede, se manda la original.
 */
async function reducirImagen(file: File, lado = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82))
    return blob ?? file
  } catch {
    return file
  }
}

/**
 * La revisión con IA de la carta leída.
 *
 * LO QUE HACE POR EL DUEÑO, que es lo que pidió: no tener que buscar los
 * errores. Apenas sale la lista, la IA mira la foto y la lista juntas y:
 *
 *   · lo que tiene claro LO CORRIGE SOLO, y queda escrito aquí con «Deshacer»;
 *   · lo dudoso lo PROPONE con «Aplicar» / «Ignorar»;
 *   · y si algo sigue mal, el dueño lo dice con sus palabras y la IA lo arregla.
 *
 * Nada de esto crea productos: cambia la vista previa, y lo aprobado sale por
 * el mismo botón de siempre.
 */
export function RevisionIA<T extends FilaDePantalla>({
  token,
  filas,
  setFilas,
  archivo,
  secciones,
  textoCrudo,
  lectura,
  excluir,
  onVariantes,
}: {
  token: string
  /**
   * Un cambio aplicado que trae grupos de tamaños (`variantes`) los suma a la
   * vista previa; deshacerlo los quita (`null`). Las filas no cambian: el grupo
   * las esconde, como cualquier grupo de tamaños.
   */
  onVariantes?: (id: string, variantes: VarianteIA[] | null) => void
  /**
   * TODAS las filas de la vista previa. Si se pasaran solo las visibles, al
   * aplicar un cambio se perderían las que están agrupadas en tamaños.
   */
  filas: T[]
  /** Líneas que NO se le mandan a la IA (las que ya están en un grupo de tamaños). */
  excluir: Set<number>
  setFilas: (fn: (prev: T[]) => T[]) => void
  archivo: File | null
  secciones: string[]
  textoCrudo: string
  /** Cambia con cada foto leída: es lo que dispara la revisión. */
  lectura: number
}) {
  const [revisando, setRevisando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<string | null>(null)
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [instruccion, setInstruccion] = useState('')
  const filasRef = useRef(filas)
  filasRef.current = filas
  const excluirRef = useRef(excluir)
  excluirRef.current = excluir
  const paraEnviar = () =>
    filasRef.current.filter((f) => !excluirRef.current.has(f.linea)).map(filaParaRevisar)

  /** Aplica en orden; lo que ya no casa se marca en vez de pisar al dueño. */
  function aplicarTodas(lista: CambioIA[], origen: Entrada['origen']): Entrada[] {
    let actuales = filasRef.current
    const nuevas: Entrada[] = []
    for (const cambio of lista) {
      const r = aplicarCambio(actuales, cambio)
      if (r.ok) {
        actuales = r.filas
        if (cambio.variantes?.length) onVariantes?.(cambio.id, cambio.variantes)
      }
      nuevas.push({ cambio, estado: r.ok ? 'aplicado' : 'choca', origen })
    }
    setFilas(() => actuales)
    filasRef.current = actuales
    return nuevas
  }

  async function pedir(ruta: string, init: RequestInit): Promise<Respuesta['data'] | null> {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${ruta}`, init)
      const json = (await res.json()) as Respuesta
      if (!json.success || !json.data) {
        setError(json.error ?? 'La IA no pudo revisar la carta.')
        return null
      }
      return json.data
    } catch {
      setError('No se pudo conectar con el servidor.')
      return null
    }
  }

  async function revisar() {
    setError(null)
    setRevisando(true)
    try {
      const body = new FormData()
      if (archivo) body.append('file', await reducirImagen(archivo), 'carta.jpg')
      body.append('datos', JSON.stringify({
        filas: paraEnviar(),
        secciones,
        textoCrudo,
      }))
      const data = await pedir('carta-revisar', { method: 'POST', body })
      if (!data) return
      setResumen(data.resumen || null)
      const aplicadas = aplicarTodas(data.aplicadas, 'revision')
      setEntradas([
        ...aplicadas,
        ...data.sugerencias.map((cambio) => ({ cambio, estado: 'pendiente' as const, origen: 'revision' as const })),
      ])
    } finally {
      setRevisando(false)
    }
  }

  async function corregir() {
    const texto = instruccion.trim()
    if (texto.length < 3) return
    setError(null)
    setCorrigiendo(true)
    try {
      const data = await pedir('carta-corregir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filas: paraEnviar(),
          secciones,
          textoCrudo,
          instruccion: texto,
        }),
      })
      if (!data) return
      if (data.aplicadas.length === 0) {
        setError('No encontré en la lista lo que me pides. Prueba nombrando el plato tal como sale escrito.')
        return
      }
      const nuevas = aplicarTodas(data.aplicadas, 'pedido')
      setEntradas((prev) => [...nuevas, ...prev])
      setInstruccion('')
    } finally {
      setCorrigiendo(false)
    }
  }

  // Cada foto nueva se revisa sola: es la parte de «no tener que buscar los
  // errores». Solo una vez por lectura, aunque las filas cambien después.
  const revisada = useRef<number | null>(null)
  useEffect(() => {
    if (lectura === 0 || revisada.current === lectura || filas.length === 0) return
    revisada.current = lectura
    setEntradas([])
    setResumen(null)
    void revisar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectura])

  function alternar(i: number, accion: 'aplicar' | 'deshacer' | 'ignorar') {
    const e = entradas[i]
    if (!e) return
    if (accion === 'ignorar') {
      setEntradas((prev) => prev.map((x, j) => (j === i ? { ...x, estado: 'ignorado' } : x)))
      return
    }
    const r = accion === 'aplicar'
      ? aplicarCambio(filasRef.current, e.cambio)
      : deshacerCambio(filasRef.current, e.cambio)
    if (r.ok) {
      setFilas(() => r.filas)
      filasRef.current = r.filas
      if (e.cambio.variantes?.length) {
        onVariantes?.(e.cambio.id, accion === 'aplicar' ? e.cambio.variantes : null)
      }
    }
    const estado: EstadoCambio = !r.ok ? 'choca' : accion === 'aplicar' ? 'aplicado' : 'deshecho'
    setEntradas((prev) => prev.map((x, j) => (j === i ? { ...x, estado } : x)))
  }

  const hechas = entradas.filter((e) => e.estado === 'aplicado' || e.estado === 'deshecho' || (e.estado === 'choca' && e.origen === 'pedido'))
  const pendientes = entradas.filter((e) => e.estado === 'pendiente' || e.estado === 'ignorado' || (e.estado === 'choca' && e.origen === 'revision'))

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
        <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
        Revisión con IA
      </h3>

      {revisando ? (
        <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-600" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Estoy revisando tu carta contra la foto. La lista ya está abajo: puedes ir mirándola.
        </p>
      ) : (
        <>
          {resumen && <p className="mt-1 text-xs text-slate-600">{resumen}</p>}
          {!error && entradas.length === 0 && lectura > 0 && (
            <p className="mt-1 text-xs text-slate-600">No encontré nada que corregir en la lista.</p>
          )}
        </>
      )}

      {error && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void revisar()} className={`${BOTON.secundario} !min-h-[36px] !px-3 !text-xs`}>
            Reintentar
          </button>
        </div>
      )}

      {hechas.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-slate-700">
            Corregí {hechas.filter((e) => e.estado === 'aplicado').length} cosa
            {hechas.filter((e) => e.estado === 'aplicado').length === 1 ? '' : 's'} por ti
          </p>
          <ul className="mt-1 space-y-1.5">
            {entradas.map((e, i) => (hechas.includes(e) ? (
              <li key={e.cambio.id} className="flex flex-wrap items-start gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${e.estado === 'deshecho' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {e.cambio.titulo}
                  </p>
                  {e.cambio.motivo && <p className="text-[11px] text-slate-500">{e.cambio.motivo}</p>}
                  {e.estado === 'choca' && (
                    <p className="text-[11px] text-amber-700">Ya habías cambiado esa fila; revísala a mano.</p>
                  )}
                </div>
                {e.estado === 'aplicado' && (
                  <button type="button" onClick={() => alternar(i, 'deshacer')} className={`${BOTON.secundario} !min-h-[36px] !px-3 !text-xs`}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Deshacer
                  </button>
                )}
                {e.estado === 'deshecho' && (
                  <button type="button" onClick={() => alternar(i, 'aplicar')} className={`${BOTON.secundario} !min-h-[36px] !px-3 !text-xs`}>
                    <Redo2 className="h-3.5 w-3.5" aria-hidden="true" /> Volver a aplicar
                  </button>
                )}
              </li>
            ) : null))}
          </ul>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-slate-700">
            {pendientes.filter((e) => e.estado === 'pendiente').length} cosa
            {pendientes.filter((e) => e.estado === 'pendiente').length === 1 ? '' : 's'} para que decidas
          </p>
          <ul className="mt-1 space-y-1.5">
            {entradas.map((e, i) => (pendientes.includes(e) ? (
              <li
                key={e.cambio.id}
                className={`flex flex-wrap items-start gap-2 rounded-lg px-3 py-2 ring-1 ${
                  e.estado === 'pendiente' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${e.estado === 'ignorado' ? 'text-slate-400' : 'text-slate-900'}`}>
                    {e.cambio.titulo}
                  </p>
                  {e.cambio.motivo && <p className="text-[11px] text-slate-500">{e.cambio.motivo}</p>}
                  {e.estado === 'choca' && (
                    <p className="text-[11px] text-amber-700">Esa fila ya cambió; revísala a mano.</p>
                  )}
                </div>
                {e.estado === 'pendiente' && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => alternar(i, 'aplicar')} className={`${BOTON.secundario} !min-h-[36px] !px-3 !text-xs`}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Aplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => alternar(i, 'ignorar')}
                      aria-label="Ignorar esta sugerencia"
                      className={`${BOTON.icono} !h-9 !w-9`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            ) : null))}
          </ul>
        </div>
      )}

      <form
        className="mt-3"
        onSubmit={(ev) => {
          ev.preventDefault()
          void corregir()
        }}
      >
        <label htmlFor="ia-instruccion" className="text-[11px] font-semibold text-slate-700">
          ¿Algo quedó mal? Dímelo con tus palabras
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="ia-instruccion"
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            maxLength={500}
            placeholder="Ej.: las papas no son un plato, vienen con la hamburguesa"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <button
            type="submit"
            disabled={corrigiendo || revisando || instruccion.trim().length < 3}
            className={`${BOTON.secundario} shrink-0`}
          >
            {corrigiendo
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Send className="h-4 w-4" aria-hidden="true" />}
            <span>Corregir</span>
          </button>
        </div>
      </form>
    </div>
  )
}
