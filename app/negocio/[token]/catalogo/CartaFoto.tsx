'use client'

import { useRef, useState } from 'react'
import { Camera, AlertTriangle, Trash2, Loader2, Layers, Split } from 'lucide-react'

import { BOTON, TARJETA } from '../../../ui'
import {
  motivoParaNoAgrupar,
  pesosDeTexto,
  varianteParaEnviar,
  type VarianteEditable,
} from '../../../variantes-carta'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://nexum-api-trxr.onrender.com'

interface LineaCarta {
  linea: number
  nombre: string
  precio: number | null
  seccion: string
  aviso?: string
}

interface VarianteSugerida {
  nombre: string
  seccion: string
  precioBase: number
  grupo: string
  opciones: Array<{ nombre: string; precio: number; precioDelta: number }>
  lineas: number[]
  faltanNombres: boolean
}

/** Lo que el dueño está editando. `precio` es texto porque se está tecleando. */
interface FilaEditable {
  id: number
  /** Línea de la carta: es lo que enlaza una fila con su grupo de tamaños. */
  linea: number
  nombre: string
  precio: string
  seccion: string
  aviso?: string
}

/** Un grupo de tamaños en edición. Cada tamaño con SU precio, como la carta. */
interface VarEditable extends VarianteEditable {
  id: number
  lineas: number[]
  /** Nació de una línea con varios precios: hay que bautizar los tamaños. */
  faltanNombres: boolean
  /** El dueño quiere agruparlos. Si no, sus filas vuelven a la tabla. */
  aceptada: boolean
}

/**
 * La carta impresa, leída de una foto.
 *
 * POR QUÉ EXISTE. Convencer a un restaurante es una conversación; hacerle
 * digitar cuarenta platos es una tarde — y es lo segundo lo que de verdad
 * frena el registro. El dueño manda una foto de su carta y el catálogo le
 * queda escrito para revisar.
 *
 * LA TABLA ES EDITABLE, y ese es el punto. Un OCR siempre se equivoca en algo,
 * así que una lista de solo lectura obliga a rehacerla a mano y no ahorra
 * nada. Aquí se corrige en el sitio y nada se crea hasta que el dueño pulsa.
 *
 * Las filas SIN precio quedan fuera de la creación a propósito: el lector no
 * inventa precios, y crear un plato con el precio equivocado es plata y una
 * queja, mientras que un plato que falta es una fila que se añade en diez
 * segundos.
 *
 * LOS TAMAÑOS. Una carta escribe la picada tres veces —pequeña, mediana,
 * grande— y eso son tres productos sueltos que en la app se leen como tres
 * platos distintos. Arriba de la tabla se proponen agrupados: un plato con su
 * grupo de tamaños, que es como se modela de verdad. El dueño puede dejarlos
 * separados, y entonces sus filas vuelven a la tabla.
 */
export function CartaFoto({ token, onImported }: { token: string; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaEditable[] | null>(null)
  const [variantes, setVariantes] = useState<VarEditable[]>([])
  // Las secciones que el lector reconoció en la foto. El backend ya las
  // devolvía y este componente las IGNORABA, así que el dueño tenía que
  // escribir «Hamburguesas» plato por plato — y cada variante tecleada
  // («hamburguesas», «Hamburguesa») crea una sección distinta en su carta.
  const [secciones, setSecciones] = useState<string[]>([])

  async function leerFoto(file: File) {
    setError(null)
    setResultado(null)
    setLeyendo(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/carta-foto`, {
        method: 'POST',
        body,
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { lineas: LineaCarta[]; secciones?: string[]; variantes?: VarianteSugerida[] }
        error?: string
      }
      if (!json.success || !json.data) {
        setError(json.error ?? 'No pudimos leer la carta.')
        return
      }
      if (json.data.lineas.length === 0) {
        setError(
          'No encontramos productos en la foto. Prueba con la carta derecha, '
          + 'bien iluminada y que se lean los precios.',
        )
        return
      }
      setSecciones(json.data.secciones ?? [])
      setVariantes(
        (json.data.variantes ?? []).map((v, i) => ({
          id: i,
          nombre: v.nombre,
          seccion: v.seccion,
          grupo: v.grupo,
          opciones: v.opciones.map((o) => ({ nombre: o.nombre, precio: String(o.precio) })),
          lineas: v.lineas,
          faltanNombres: v.faltanNombres,
          // Las que vienen de varias líneas nacen aceptadas: los nombres de
          // los tamaños los escribió la carta. Las que salen de UNA línea con
          // varios precios no, porque todavía no tienen nombre y aceptarlas
          // solas dejaría al dueño con un formulario a medias sin pedirlo.
          aceptada: !v.faltanNombres,
        })),
      )
      setFilas(
        json.data.lineas.map((l, i) => ({
          id: i,
          linea: l.linea,
          nombre: l.nombre,
          precio: l.precio == null ? '' : String(l.precio),
          seccion: l.seccion,
          ...(l.aviso ? { aviso: l.aviso } : {}),
        })),
      )
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLeyendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function editar(id: number, campo: 'nombre' | 'precio' | 'seccion', valor: string) {
    setFilas((prev) =>
      (prev ?? []).map((f) => (f.id === id ? { ...f, [campo]: valor } : f)),
    )
  }

  function editarVariante(id: number, cambio: Partial<VarEditable>) {
    setVariantes((prev) => prev.map((v) => (v.id === id ? { ...v, ...cambio } : v)))
  }

  function editarOpcion(id: number, i: number, campo: 'nombre' | 'precio', valor: string) {
    setVariantes((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, opciones: v.opciones.map((o, j) => (j === i ? { ...o, [campo]: valor } : o)) }
          : v,
      ),
    )
  }

  // Las filas que un grupo se llevó no se pintan dos veces: estarían a la vez
  // dentro del plato con tamaños y sueltas en la tabla, y se crearían dos
  // veces. Si el dueño deshace el grupo, vuelven solas.
  const agrupadas = new Set(variantes.filter((v) => v.aceptada).flatMap((v) => v.lineas))
  const visibles = (filas ?? []).filter((f) => !agrupadas.has(f.linea))

  const listas = visibles.filter((f) => f.nombre.trim() && pesosDeTexto(f.precio) != null)
  const fuera = visibles.length - listas.length

  const aceptadas = variantes.filter((v) => v.aceptada)
  const problemas = aceptadas
    .map((v) => ({ v, motivo: motivoParaNoAgrupar(varianteParaEnviar(v)) }))
    .filter((x): x is { v: VarEditable; motivo: string } => x.motivo !== null)
  const total = listas.length + (aceptadas.length - problemas.length)

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/carta-importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filas: listas.map((f) => ({
            nombre: f.nombre.trim(),
            precio: pesosDeTexto(f.precio),
            seccion: f.seccion.trim(),
          })),
          variantes: aceptadas.map(varianteParaEnviar),
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { creados: number; actualizados: number; conTamanos?: number }
        error?: string
      }
      if (json.success && json.data) {
        const { creados, actualizados, conTamanos = 0 } = json.data
        setResultado(
          `Listo: ${creados} producto${creados === 1 ? '' : 's'} creado${creados === 1 ? '' : 's'}`
          + (conTamanos > 0
            ? `, ${conTamanos} con tamaños`
            : '')
          + (actualizados > 0 ? `, ${actualizados} actualizado${actualizados === 1 ? '' : 's'}.` : '.'),
        )
        setFilas(null)
        setVariantes([])
        onImported()
      } else {
        setError(json.error ?? 'No se pudo crear el catálogo.')
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <section className={`${TARJETA} p-4 mb-4`}>
      <h2 className="font-bold text-slate-900 text-sm">Tu carta, desde una foto</h2>
      <p className="text-xs text-slate-500 mt-0.5">
        Tómale una foto a tu carta impresa y te dejamos los platos escritos.
        Revisa los precios antes de crearlos.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        // En el celular abre la cámara directamente, que es de donde va a
        // salir la foto: pedirle al dueño que la busque en la galería es un
        // paso más para algo que va a hacer con la carta en la mano.
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void leerFoto(f)
        }}
      />

      {filas === null && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={leyendo}
          className={`${BOTON.principal} mt-3`}
        >
          {leyendo
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Leyendo la carta…</>
            : <><Camera className="w-4 h-4" /> Tomar foto de la carta</>}
        </button>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}

      {resultado && (
        <p className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800">
          {resultado}
        </p>
      )}

      {filas !== null && (
        <>
          {variantes.length > 0 && (
            <div className="mt-4">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                El mismo plato en varios tamaños
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Así el cliente ve un solo plato y elige el tamaño al pedir, en vez
                de {variantes[0]?.opciones.length ?? 2} platos parecidos en la lista.
              </p>

              <div className="mt-2 space-y-2">
                {variantes.map((v) => {
                  const motivo = v.aceptada
                    ? motivoParaNoAgrupar(varianteParaEnviar(v))
                    : null
                  return (
                    <div
                      key={v.id}
                      className={`rounded-xl border p-3 ${
                        v.aceptada
                          ? motivo
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-emerald-200 bg-emerald-50/50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      {!v.aceptada ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-600">
                            <strong className="text-slate-900">{v.nombre}</strong>{' '}
                            tiene {v.opciones.length} precios.
                            {v.faltanNombres && ' ¿Son tamaños del mismo plato?'}
                          </p>
                          <button
                            type="button"
                            onClick={() => editarVariante(v.id, { aceptada: true })}
                            className={`${BOTON.secundario} !min-h-[36px] !px-3 !text-xs`}
                          >
                            <Layers className="w-3.5 h-3.5" /> Agruparlos
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="flex-1 min-w-[140px] text-[11px] font-semibold text-slate-600">
                              Plato
                              <input
                                value={v.nombre}
                                onChange={(e) => editarVariante(v.id, { nombre: e.target.value })}
                                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                              />
                            </label>
                            <label className="w-28 text-[11px] font-semibold text-slate-600">
                              Grupo
                              <input
                                value={v.grupo}
                                onChange={(e) => editarVariante(v.id, { grupo: e.target.value })}
                                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                              />
                            </label>
                            <label className="w-32 text-[11px] font-semibold text-slate-600">
                              Sección
                              <input
                                value={v.seccion}
                                list="carta-secciones"
                                onChange={(e) => editarVariante(v.id, { seccion: e.target.value })}
                                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                              />
                            </label>
                          </div>

                          <div className="mt-2 space-y-1">
                            {v.opciones.map((o, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input
                                  value={o.nombre}
                                  placeholder="Pequeña, mediana, grande…"
                                  onChange={(e) => editarOpcion(v.id, i, 'nombre', e.target.value)}
                                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                                />
                                <input
                                  value={o.precio}
                                  inputMode="numeric"
                                  placeholder="—"
                                  onChange={(e) => editarOpcion(v.id, i, 'precio', e.target.value)}
                                  className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                                />
                                <button
                                  type="button"
                                  aria-label={`Quitar el tamaño ${o.nombre || i + 1}`}
                                  onClick={() =>
                                    editarVariante(v.id, {
                                      opciones: v.opciones.filter((_, j) => j !== i),
                                    })}
                                  className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          {motivo && (
                            <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {motivo}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => editarVariante(v.id, { aceptada: false })}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                          >
                            <Split className="w-3.5 h-3.5" /> Dejarlos separados
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-600">
            {visibles.length === 0
              ? 'Todas las líneas quedaron agrupadas arriba.'
              : <>Encontramos <strong>{visibles.length}</strong> línea{visibles.length === 1 ? '' : 's'} más.
                Corrige lo que haga falta y borra lo que no sea un plato.</>}
          </p>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-1 font-semibold">Producto</th>
                  <th className="pb-1 font-semibold w-24">Precio</th>
                  <th className="pb-1 font-semibold w-32">Sección</th>
                  <th className="pb-1 w-8" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const sinPrecio = pesosDeTexto(f.precio) == null
                  return (
                    <tr
                      key={f.id}
                      className={sinPrecio ? 'bg-amber-50' : undefined}
                    >
                      <td className="py-1 pr-2">
                        <input
                          value={f.nombre}
                          onChange={(e) => editar(f.id, 'nombre', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1"
                        />
                        {f.aviso && (
                          <span className="mt-0.5 block text-[11px] text-amber-700">
                            {f.aviso}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-2 align-top">
                        <input
                          value={f.precio}
                          inputMode="numeric"
                          placeholder="—"
                          onChange={(e) => editar(f.id, 'precio', e.target.value)}
                          className={`w-full rounded border px-2 py-1 ${
                            sinPrecio ? 'border-amber-400 bg-white' : 'border-slate-300'
                          }`}
                        />
                      </td>
                      <td className="py-1 pr-2 align-top">
                        <input
                          value={f.seccion}
                          list="carta-secciones"
                          onChange={(e) => editar(f.id, 'seccion', e.target.value)}
                          className="w-full rounded border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="py-1 align-top">
                        <button
                          type="button"
                          aria-label="Quitar esta fila"
                          onClick={() => setFilas((p) => (p ?? []).filter((x) => x.id !== f.id))}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {/* Las secciones leídas, para elegirlas en vez de teclearlas: cada
                variante escrita a mano acaba siendo otra sección en la carta. */}
            <datalist id="carta-secciones">
              {secciones.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          {fuera > 0 && (
            <p className="mt-2 text-[11px] text-amber-700">
              {fuera} fila{fuera === 1 ? '' : 's'} sin precio no se crearán. Escribe el
              precio o bórralas.
            </p>
          )}

          {problemas.length > 0 && (
            <p className="mt-2 text-[11px] font-semibold text-amber-800">
              Termina de armar {problemas.length === 1 ? 'el grupo' : `los ${problemas.length} grupos`}{' '}
              de tamaños de arriba, o déjalos separados.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void crear()}
              disabled={creando || total === 0 || problemas.length > 0}
              className={BOTON.principal}
            >
              {creando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando…</>
                : `Crear ${total} producto${total === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => { setFilas(null); setVariantes([]); setError(null) }}
              className={BOTON.secundario}
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </section>
  )
}
