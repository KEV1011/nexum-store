'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, UserPlus, Loader2, Trash2, ShieldCheck } from 'lucide-react'
import type { OperatorApi } from './api'

/**
 * Accesos al portal.
 *
 * Los roles existían en el modelo y las rutas los exigían, pero no había forma
 * de crear un miembro: la empresa se quedaba con el único usuario del registro,
 * y a un despachador el login le respondía que su teléfono no estaba asociado a
 * ninguna empresa — sin salida posible.
 */

const ROLES = [
  { value: 'OWNER', label: 'Administrador', desc: 'Todo, incluidos accesos y datos de la empresa' },
  { value: 'DISPATCHER', label: 'Despachador', desc: 'Opera: publica salidas, toma fletes, gestiona flota' },
  { value: 'VIEWER', label: 'Solo lectura', desc: 'Consulta y descarga reportes, sin modificar nada' },
] as const

const ROL_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]))

interface Member {
  id: string
  phone: string
  name: string | null
  role: string
  createdAt: string
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

export default function MembersManager({ api }: { api: OperatorApi }) {
  const [members, setMembers] = useState<Member[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<string>('DISPATCHER')
  const [guardando, setGuardando] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<Member[]>('/operator/members')
      setMembers(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setCargando(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const agregar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const limpio = phone.trim()
      await api('/operator/members', {
        method: 'POST',
        body: JSON.stringify({
          phone: limpio.startsWith('+') ? limpio : `+57${limpio.replace(/\D/g, '')}`,
          name: name.trim() || undefined,
          role,
        }),
      })
      setPhone('')
      setName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dar el acceso.')
    } finally {
      setGuardando(false)
    }
  }

  const quitar = async (m: Member) => {
    if (!confirm(`¿Quitar el acceso de ${m.name ?? m.phone}?`)) return
    setError(null)
    try {
      await api(`/operator/members/${m.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el acceso.')
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-600" /> Accesos al portal
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Cada persona entra con su propio celular y un código por SMS. No hay
          contraseñas que compartir.
        </p>
      </div>

      {/* Alta */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Celular</label>
            <input
              className={INPUT}
              placeholder="3001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              maxLength={15}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Nombre <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              className={INPUT}
              placeholder="Ej: Marta Rodríguez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Permisos</label>
          <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">
            {ROLES.find((r) => r.value === role)?.desc}
          </p>
        </div>

        <button
          onClick={() => void agregar()}
          disabled={guardando || phone.replace(/\D/g, '').length < 10}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Dar acceso
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* Lista */}
      {cargando ? (
        <p className="text-sm text-slate-400 text-center py-4">Cargando accesos…</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
              <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                {m.role === 'OWNER' ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <Users className="w-4 h-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 text-sm truncate">{m.name ?? 'Sin nombre'}</p>
                <p className="text-xs text-slate-400 truncate">{m.phone}</p>
              </div>
              <span className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                {ROL_LABEL[m.role] ?? m.role}
              </span>
              <button
                onClick={() => void quitar(m)}
                className="shrink-0 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"
                title="Quitar acceso"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
