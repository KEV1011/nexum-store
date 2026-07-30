'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  FileText, Upload, Loader2, ShieldCheck, ShieldAlert, Clock, ExternalLink, AlertTriangle,
} from 'lucide-react'
import type { OperatorApi } from './api'

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

/**
 * Documentos legales de la empresa.
 *
 * El backend ya recibía estos archivos, pero el portal nunca los pidió: la
 * empresa no tenía cómo subir su habilitación y el admin la aprobaba a ciegas.
 * Para el intermunicipal esa habilitación es justo el requisito legal que
 * sostiene todo el modelo.
 */

const TIPOS = [
  { value: 'HABILITACION', label: 'Habilitación (Mintransporte)', clave: true },
  { value: 'CAMARA_COMERCIO', label: 'Cámara de comercio', clave: false },
  { value: 'RUT', label: 'RUT', clave: false },
  { value: 'INSURANCE', label: 'Póliza / seguro', clave: false },
  { value: 'OTHER', label: 'Otro', clave: false },
] as const

const TIPO_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS.map((t) => [t.value, t.label]),
)

interface DocRow {
  id: string
  type: string
  fileUrl: string
  status: string
  expiresAt: string | null
  rejectionReason: string | null
  uploadedAt: string
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso))
}

function estado(d: DocRow): { label: string; cls: string; icon: typeof ShieldCheck } {
  const vencido = d.expiresAt != null && new Date(d.expiresAt).getTime() < Date.now()
  if (d.status === 'APPROVED' && vencido) {
    return { label: 'Vencido', cls: 'bg-rose-100 text-rose-700', icon: ShieldAlert }
  }
  if (d.status === 'APPROVED') {
    return { label: 'Aprobado', cls: 'bg-emerald-100 text-emerald-700', icon: ShieldCheck }
  }
  if (d.status === 'REJECTED') {
    return { label: 'Rechazado', cls: 'bg-rose-100 text-rose-700', icon: ShieldAlert }
  }
  return { label: 'En revisión', cls: 'bg-amber-100 text-amber-700', icon: Clock }
}

export default function DocumentsManager({ api, token }: { api: OperatorApi; token: string }) {
  const [docs, setDocs] = useState<DocRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<string>('HABILITACION')
  const [vence, setVence] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<DocRow[]>('/operator/documents')
      setDocs(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const subir = async () => {
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', archivo)
      fd.append('type', tipo)
      if (vence) fd.append('expiresAt', vence)
      const res = await fetch(`${BACKEND_URL}/operator/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!res.ok || json.success === false) {
        setError(json.error ?? 'No se pudo subir el documento.')
        return
      }
      setArchivo(null)
      setVence('')
      await load()
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSubiendo(false)
    }
  }

  const tieneHabilitacion = docs.some(
    (d) =>
      d.type === 'HABILITACION' &&
      d.status === 'APPROVED' &&
      (d.expiresAt == null || new Date(d.expiresAt).getTime() > Date.now()),
  )

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-600" /> Documentos de la empresa
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Sube aquí tus papeles. Nuestro equipo los revisa y, con la habilitación
          aprobada, tu empresa queda verificada para despachar viajes
          intermunicipales.
        </p>
      </div>

      {!cargando && !tieneHabilitacion ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            Todavía no tienes la <strong>habilitación del Ministerio de Transporte</strong> aprobada.
            Es el documento que la ley exige para el transporte intermunicipal y sin él
            tus rutas troncales no se pueden autorizar.
          </p>
        </div>
      ) : null}

      {/* Subida */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de documento</label>
            <select className={INPUT} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Vence el <span className="font-normal text-slate-400">(si aplica)</span>
            </label>
            <input type="date" className={INPUT} value={vence} onChange={(e) => setVence(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 cursor-pointer hover:bg-slate-50">
          <Upload className="w-4 h-4" />
          {archivo ? archivo.name : 'Elegir archivo (PDF o foto)'}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>

        <button
          onClick={() => void subir()}
          disabled={!archivo || subiendo}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Subir documento
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* Lista */}
      {cargando ? (
        <p className="text-sm text-slate-400 text-center py-4">Cargando documentos…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">
          Aún no has subido ningún documento.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const st = estado(d)
            return (
              <li key={d.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">
                      {TIPO_LABEL[d.type] ?? d.type}
                    </p>
                    <p className="text-xs text-slate-400">
                      Subido {fecha(d.uploadedAt)}
                      {d.expiresAt ? ` · vence ${fecha(d.expiresAt)}` : ''}
                    </p>
                    {d.rejectionReason ? (
                      <p className="mt-1 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                        {d.rejectionReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${st.cls}`}>
                      <st.icon className="w-3 h-3" /> {st.label}
                    </span>
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50"
                      title="Ver archivo"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
