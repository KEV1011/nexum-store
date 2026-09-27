'use client'

import { useRef, useState } from 'react'
import { Camera, AlertTriangle, Trash2, Loader2 } from 'lucide-react'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://nexum-api-trxr.onrender.com'

interface LineaCarta {
  linea: number
  nombre: string
  precio: number | null
  seccion: string
  aviso?: string
}

/** Lo que el dueño está editando. `precio` es texto porque se está tecleando. */
interface FilaEditable {
  id: number
  nombre: string
  precio: string
  seccion: string
  aviso?: string
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
 */
export function CartaFoto({ token, onImported }: { token: string; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaEditable[] | null>(null)

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
        data?: { lineas: LineaCarta[] }
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
      setFilas(
        json.data.lineas.map((l, i) => ({
          id: i,
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

  /** Lo que el dueño escribió, en pesos. Vacío o basura = sin precio. */
  function pesos(texto: string): number | null {
    const n = Number(texto.replace(/[^\d]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const listas = (filas ?? []).filter((f) => f.nombre.trim() && pesos(f.precio) != null)
  const fuera = (filas ?? []).length - listas.length

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
            precio: pesos(f.precio),
            seccion: f.seccion.trim(),
          })),
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { creados: number; actualizados: number }
        error?: string
      }
      if (json.success && json.data) {
        const { creados, actualizados } = json.data
        setResultado(
          `Listo: ${creados} producto${creados === 1 ? '' : 's'} creado${creados === 1 ? '' : 's'}`
          + (actualizados > 0 ? `, ${actualizados} actualizado${actualizados === 1 ? '' : 's'}.` : '.'),
        )
        setFilas(null)
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
    <section className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
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
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
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
          <p className="mt-3 text-xs text-slate-600">
            Encontramos <strong>{filas.length}</strong> línea{filas.length === 1 ? '' : 's'}.
            Corrige lo que haga falta y borra lo que no sea un plato.
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
                {filas.map((f) => {
                  const sinPrecio = pesos(f.precio) == null
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
          </div>

          {fuera > 0 && (
            <p className="mt-2 text-[11px] text-amber-700">
              {fuera} fila{fuera === 1 ? '' : 's'} sin precio no se crearán. Escribe el
              precio o bórralas.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void crear()}
              disabled={creando || listas.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {creando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando…</>
                : `Crear ${listas.length} producto${listas.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => { setFilas(null); setError(null) }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Descartar
            </button>
          </div>
        </>
      )}
    </section>
  )
}
