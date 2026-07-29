'use client'

import { useRef, useState } from 'react'
import { Upload, Download, AlertTriangle, Check, X } from 'lucide-react'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'https://nexum-api-trxr.onrender.com'

interface FilaPreview {
  linea: number
  nombre: string
  precio: number
  seccion: string
  stock?: number | null
}
interface Preview {
  nuevos: FilaPreview[]
  actualizaciones: Array<FilaPreview & { nombreActual: string }>
  errores: Array<{ linea: number; motivo: string; contenido: string }>
}

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
    .format(v)

/**
 * Carga masiva del catálogo. El dueño sube el archivo, ve exactamente qué se va
 * a crear, qué se va a actualizar y qué filas fallan — y solo entonces confirma.
 *
 * Nunca se importa a ciegas: un CSV con la columna de precio corrida
 * destrozaría el catálogo entero, y el dueño lo descubriría cuando un cliente
 * comprara algo por el precio equivocado.
 */
export function CsvImport({ token, onImported }: { token: string; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [csv, setCsv] = useState<string | null>(null)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cargando, setCargando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  const limpiar = () => {
    setCsv(null); setPreview(null); setNombreArchivo(''); setError(null); setResultado(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setResultado(null)
    setNombreArchivo(file.name)
    const texto = await file.text()
    setCsv(texto)
    setCargando(true)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/csv-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: texto }),
      })
      const json = (await res.json()) as { success: boolean; data?: Preview; error?: string }
      if (json.success && json.data) setPreview(json.data)
      else setError(json.error ?? 'No se pudo leer el archivo.')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }

  const importar = async () => {
    if (!csv) return
    setImportando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/csv-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { creados: number; actualizados: number; omitidos: number }
        error?: string
      }
      if (json.success && json.data) {
        const { creados, actualizados, omitidos } = json.data
        setResultado(
          `Listo: ${creados} creado${creados === 1 ? '' : 's'}, ` +
          `${actualizados} actualizado${actualizados === 1 ? '' : 's'}` +
          (omitidos > 0 ? `, ${omitidos} omitido${omitidos === 1 ? '' : 's'} por errores.` : '.'),
        )
        setPreview(null)
        setCsv(null)
        if (fileRef.current) fileRef.current.value = ''
        onImported()
      } else {
        setError(json.error ?? 'No se pudo importar.')
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setImportando(false)
    }
  }

  const totalValido = (preview?.nuevos.length ?? 0) + (preview?.actualizaciones.length ?? 0)

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-bold text-slate-900 text-sm">Cargar muchos productos</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sube un archivo CSV y revisa qué va a pasar antes de aplicarlo.
          </p>
        </div>
        <a
          href={`${BACKEND_URL}/business/${token}/products/csv-template`}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Download className="w-3.5 h-3.5" /> Plantilla
        </a>
      </div>

      <label className="mt-3 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-4 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-50">
        <Upload className="w-4 h-4" />
        {nombreArchivo || 'Elegir archivo CSV'}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => void onArchivo(e)}
        />
      </label>

      {cargando ? (
        <p className="mt-3 text-sm text-slate-500">Revisando el archivo…</p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      ) : null}

      {resultado ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <Check className="w-4 h-4" /> {resultado}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1">
              {preview.nuevos.length} nuevo{preview.nuevos.length === 1 ? '' : 's'}
            </span>
            <span className="rounded-full bg-sky-50 text-sky-700 px-2.5 py-1">
              {preview.actualizaciones.length} se actualiza{preview.actualizaciones.length === 1 ? '' : 'n'}
            </span>
            {preview.errores.length > 0 ? (
              <span className="rounded-full bg-red-50 text-red-700 px-2.5 py-1">
                {preview.errores.length} con error
              </span>
            ) : null}
          </div>

          {/* Los errores primero: es lo que el dueño necesita corregir. */}
          {preview.errores.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-red-700 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Estas filas se omitirán
              </p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {preview.errores.slice(0, 30).map((e) => (
                  <li key={e.linea} className="text-xs text-red-800">
                    <span className="font-semibold">Línea {e.linea}:</span> {e.motivo}
                  </li>
                ))}
                {preview.errores.length > 30 ? (
                  <li className="text-xs text-red-600">…y {preview.errores.length - 30} más.</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {totalValido > 0 ? (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Producto</th>
                    <th className="text-left px-3 py-2 font-semibold">Precio</th>
                    <th className="text-left px-3 py-2 font-semibold">Qué pasa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.actualizaciones.slice(0, 15).map((f) => (
                    <tr key={`u-${f.linea}`}>
                      <td className="px-3 py-2">
                        {f.nombre}
                        {f.nombreActual !== f.nombre ? (
                          <span className="text-slate-400"> (antes: {f.nombreActual})</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatCOP(f.precio)}</td>
                      <td className="px-3 py-2 text-sky-700 font-semibold">Se actualiza</td>
                    </tr>
                  ))}
                  {preview.nuevos.slice(0, 15).map((f) => (
                    <tr key={`n-${f.linea}`}>
                      <td className="px-3 py-2">{f.nombre}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCOP(f.precio)}</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">Se crea</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalValido > 30 ? (
                <p className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100">
                  Se muestran los primeros 30 de {totalValido}.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No hay ninguna fila válida para importar.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => void importar()}
              disabled={importando || totalValido === 0}
              className="flex-1 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-teal-800"
            >
              {importando ? 'Importando…' : `Aplicar ${totalValido} producto${totalValido === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={limpiar}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
