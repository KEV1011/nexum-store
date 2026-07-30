'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, Loader2, Check, Lock } from 'lucide-react'
import type { OperatorApi } from './api'

/**
 * Datos de contacto de la empresa.
 *
 * Antes no existía `PUT /operator/profile`: si la empresa se equivocaba al
 * registrarse —un teléfono mal escrito, una ciudad que cambia— no había forma
 * de corregirlo salvo entrando a la base de datos.
 *
 * La razón social, el NIT y el tipo de empresa NO se editan aquí: son la
 * identidad legal sobre la que el admin verificó la habilitación, y cambiarlas
 * por autoservicio dejaría esa verificación apuntando a otra cosa.
 */

interface Perfil {
  legalName: string
  nit: string
  type: string
  tradeName: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  city: string | null
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

const TIPO_LABEL: Record<string, string> = {
  TAXI: 'Taxi urbano', INTERCITY: 'Intermunicipal', MIXED: 'Mixta', CARGA: 'Carga',
}

export default function ProfileForm({ api }: { api: OperatorApi }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<Perfil>('/operator/profile')
      setPerfil(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const set = (patch: Partial<Perfil>) => setPerfil((p) => (p ? { ...p, ...patch } : p))

  const guardar = async () => {
    if (!perfil) return
    setGuardando(true)
    setGuardado(false)
    setError(null)
    try {
      await api('/operator/profile', {
        method: 'PUT',
        body: JSON.stringify({
          tradeName: perfil.tradeName ?? '',
          contactName: perfil.contactName ?? '',
          contactPhone: perfil.contactPhone ?? '',
          contactEmail: perfil.contactEmail ?? '',
          city: perfil.city ?? '',
        }),
      })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <p className="text-sm text-slate-400 text-center py-4">Cargando datos de la empresa…</p>
      </section>
    )
  }
  if (!perfil) {
    return (
      <section className="bg-white border border-red-100 rounded-2xl p-5">
        <p className="text-sm text-red-600">{error ?? 'No se pudo cargar el perfil.'}</p>
      </section>
    )
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-600" /> Datos de la empresa
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Así te contactamos y así apareces ante los pasajeros.
        </p>
      </div>

      {/* Identidad legal: se muestra, no se edita. */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          <Lock className="w-3 h-3" /> Identidad legal
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs text-slate-400">Razón social</p>
            <p className="text-slate-800 font-medium truncate">{perfil.legalName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">NIT / cédula</p>
            <p className="text-slate-800 font-medium truncate">{perfil.nit}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Tipo</p>
            <p className="text-slate-800 font-medium">{TIPO_LABEL[perfil.type] ?? perfil.type}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Estos datos sostienen tu verificación. Para corregirlos, escríbenos.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre comercial</label>
          <input
            className={INPUT}
            placeholder="Con el que te conocen"
            value={perfil.tradeName ?? ''}
            onChange={(e) => set({ tradeName: e.target.value })}
            maxLength={80}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Ciudad</label>
          <input
            className={INPUT}
            placeholder="Ej: Pamplona"
            value={perfil.city ?? ''}
            onChange={(e) => set({ city: e.target.value })}
            maxLength={60}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Persona de contacto</label>
          <input
            className={INPUT}
            placeholder="Nombre y apellido"
            value={perfil.contactName ?? ''}
            onChange={(e) => set({ contactName: e.target.value })}
            maxLength={80}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Teléfono de contacto</label>
          <input
            className={INPUT}
            placeholder="3001234567"
            value={perfil.contactPhone ?? ''}
            onChange={(e) => set({ contactPhone: e.target.value })}
            type="tel"
            inputMode="tel"
            maxLength={15}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Correo</label>
          <input
            className={INPUT}
            placeholder="empresa@correo.com"
            value={perfil.contactEmail ?? ''}
            onChange={(e) => set({ contactEmail: e.target.value })}
            type="email"
            maxLength={120}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        onClick={() => void guardar()}
        disabled={guardando}
        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : guardado ? <Check className="w-4 h-4" /> : null}
        {guardado ? 'Guardado' : 'Guardar cambios'}
      </button>

      <p className="text-xs text-slate-400 text-center">
        Cambiar el teléfono de contacto no cambia quién entra al portal: eso se
        gestiona en «Accesos al portal».
      </p>
    </section>
  )
}
