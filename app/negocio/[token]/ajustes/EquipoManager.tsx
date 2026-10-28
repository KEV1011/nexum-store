'use client'

/**
 * «Equipo»: el dueño le da a cada persona su propio enlace al portal, con lo
 * que su rol puede hacer y nada más.
 *
 * POR QUÉ. Antes había un solo enlace, el del dueño, y el mesero que lo usaba
 * para ver las mesas veía también las ventas, los giros y la clave. Ahora la
 * cocina abre solo la cocina, y quitarle el acceso a alguien que se fue es un
 * botón — no cambiar el enlace de todo el local.
 *
 * El enlace se enseña como QR para abrirlo en la tablet o el celular de esa
 * persona (y que lo instale como app: el portal es instalable). Quien decide
 * lo que puede hacer es el servidor, no esta pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, QrCode, Trash2, UserPlus, Users } from 'lucide-react'

import { BACKEND_URL } from '../../../backend'
import { BOTON } from '../../../ui'
import { dibujarQr, useLibreriaQr } from '../../../carta/qr'
import { NOMBRE_DEL_ROL, QUE_HACE, ROLES_PERSONAL, type RolPersonal } from '../../acceso'

interface Persona {
  id: string
  nombre: string
  rol: RolPersonal
  rolNombre: string
  token: string
  activo: boolean
  ultimoAcceso: string | null
  creado: string
}

function enlaceDe(p: Persona): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/negocio/${encodeURIComponent(p.token)}`
}

function cuandoFue(iso: string | null): string {
  if (!iso) return 'Todavía no ha entrado'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 10) return 'Activo ahora'
  if (min < 60) return `Entró hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Entró hace ${h} h`
  return `Entró el ${new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`
}

function Qr({ enlace }: { enlace: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const listo = useLibreriaQr()
  useEffect(() => {
    if (listo && ref.current) dibujarQr(ref.current, enlace, 168)
  }, [listo, enlace])
  return (
    <div
      ref={ref}
      aria-label="Código QR del enlace"
      className="grid h-[168px] w-[168px] place-items-center rounded-xl border border-slate-200 bg-white"
    >
      {!listo && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
    </div>
  )
}

export function EquipoManager({ token }: { token: string }) {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<RolPersonal>('MESERO')
  const [creando, setCreando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/equipo`, { cache: 'no-store' })
      const json = (await res.json()) as { success?: boolean; data?: { personas: Persona[] }; error?: string }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos cargar tu equipo.')
        return
      }
      setPersonas(json.data.personas)
      setError(null)
    } catch {
      setError('No se pudo conectar con el servidor.')
    }
  }, [token])

  useEffect(() => { void cargar() }, [cargar])

  async function crear() {
    setCreando(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/equipo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, rol }),
      })
      const json = (await res.json()) as { success?: boolean; data?: { persona: Persona }; error?: string }
      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? 'No pudimos crear el acceso.')
        return
      }
      setNombre('')
      setPersonas((prev) => [...(prev ?? []), json.data!.persona])
      // Recién creado, el QR se abre solo: es lo siguiente que hay que hacer.
      setAbierto(json.data.persona.id)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCreando(false)
    }
  }

  async function quitar(p: Persona) {
    if (!window.confirm(`¿Quitarle el acceso a ${p.nombre}? Su enlace dejará de abrir el portal ahora mismo.`)) return
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/equipo/${p.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'No pudimos quitar el acceso.')
        return
      }
      setPersonas((prev) => (prev ?? []).filter((x) => x.id !== p.id))
    } catch {
      setError('No se pudo conectar con el servidor.')
    }
  }

  async function copiar(p: Persona) {
    try {
      await navigator.clipboard.writeText(enlaceDe(p))
      setCopiado(p.id)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      setError('No se pudo copiar. Mantén presionado el enlace para copiarlo.')
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Users className="h-4 w-4 text-emerald-700" /> Equipo
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Cada persona entra con su propio enlace y solo ve lo de su trabajo. Tu enlace
          sigue siendo solo tuyo: no se lo compartas al equipo.
        </p>
      </div>

      <div className="space-y-2 rounded-xl bg-slate-50 p-3">
        <label className="block text-xs font-semibold text-slate-700" htmlFor="equipo-nombre">Nombre</label>
        <input
          id="equipo-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={60}
          placeholder="Ej.: Laura"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <p className="text-xs font-semibold text-slate-700">Qué hace</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES_PERSONAL.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${
                rol === r ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'
              }`}
            >
              <input type="radio" name="equipo-rol" checked={rol === r} onChange={() => setRol(r)} className="mt-0.5" />
              <span>
                <span className="block font-bold text-slate-900">{NOMBRE_DEL_ROL[r]}</span>
                <span className="text-slate-500">{QUE_HACE[r]}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void crear()}
          disabled={creando || nombre.trim().length < 2}
          className={`${BOTON.principal} w-full`}
        >
          {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Crear su acceso
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

      {personas === null && !error && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando tu equipo…
        </p>
      )}
      {personas !== null && personas.length === 0 && (
        <p className="text-xs text-slate-500">Todavía no has dado acceso a nadie.</p>
      )}

      {personas !== null && personas.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {personas.map((p) => (
            <li key={p.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{p.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {p.rolNombre} · {cuandoFue(p.ultimoAcceso)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAbierto(abierto === p.id ? null : p.id)}
                  className={BOTON.secundario}
                >
                  <QrCode className="h-4 w-4" /> {abierto === p.id ? 'Ocultar' : 'Su enlace'}
                </button>
                <button
                  type="button"
                  onClick={() => void quitar(p)}
                  aria-label={`Quitarle el acceso a ${p.nombre}`}
                  className={BOTON.icono}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
              {abierto === p.id && (
                // En el teléfono, QR arriba y texto debajo: al lado, la columna
                // del enlace quedaba de tres letras y «Copiar» se salía.
                <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row">
                  <Qr enlace={enlaceDe(p)} />
                  <div className="w-full min-w-0 flex-1 space-y-2 text-xs text-slate-600">
                    <p>
                      Ábrelo con la cámara del celular o la tablet de {p.nombre}. Allí puede
                      instalarlo como app desde «Instalar en mi celular».
                    </p>
                    <p className="break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700">
                      {enlaceDe(p)}
                    </p>
                    <button type="button" onClick={() => void copiar(p)} className={BOTON.secundario}>
                      {copiado === p.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiado === p.id ? 'Copiado' : 'Copiar enlace'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
