'use client'

import { useCallback, useEffect, useState } from 'react'
import { Users, UserPlus, ShieldCheck, Clock, Star, Loader2 } from 'lucide-react'
import type { OperatorApi } from './api'

interface OperatorDriver {
  id: string
  name: string
  phone: string
  status: string // OFFLINE | ONLINE | ON_TRIP
  isVerified: boolean
  rating: number
  totalTrips: number
  employmentType: string | null // OWN | AFFILIATED
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  ONLINE: { label: 'En línea', cls: 'bg-emerald-100 text-emerald-700' },
  ON_TRIP: { label: 'En viaje', cls: 'bg-blue-100 text-blue-700' },
  OFFLINE: { label: 'Desconectado', cls: 'bg-slate-100 text-slate-500' },
}

export default function DriversManager({ api, onChanged }: { api: OperatorApi; onChanged?: () => void }) {
  const [drivers, setDrivers] = useState<OperatorDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<OperatorDriver[]>('/operator/drivers')
      setDrivers(Array.isArray(data) ? data : [])
    } catch {
      /* el error puntual se muestra al accionar */
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  async function invite() {
    setError(null)
    setNotice(null)
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) { setError('Ingresa un celular colombiano válido (10 dígitos).'); return }
    setSaving(true)
    try {
      const created = await api<{ phone: string }>('/operator/drivers/invite', {
        method: 'POST',
        body: JSON.stringify({ phone, name: name.trim() || undefined }),
      })
      setNotice(`Conductor afiliado con el número ${created.phone}. Podrá operar cuando complete sus documentos en la app.`)
      setPhone('')
      setName('')
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo afiliar el conductor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-2">
        <Users className="w-4 h-4 text-emerald-600" /> Conductores
        <span className="text-slate-400 font-normal">({drivers.length})</span>
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Afilia conductores por su celular. Al ingresar a la app con ese número quedarán
        vinculados a tu empresa; podrán operar cuando Nexum apruebe sus documentos.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Celular</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="3001234567"
              inputMode="tel"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none w-40"
            />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Nombre (opcional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del conductor"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
          <button
            onClick={invite}
            disabled={saving}
            className="py-2 px-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Afiliar
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {notice && <p className="text-sm text-emerald-700 mt-2">{notice}</p>}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Cargando conductores…</div>
      ) : drivers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <Users className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aún no tienes conductores afiliados.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {drivers.map((d) => {
            const st = STATUS_STYLE[d.status] ?? STATUS_STYLE.OFFLINE
            return (
              <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 text-sm truncate">{d.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {d.phone}
                    {d.totalTrips > 0 && (
                      <span className="inline-flex items-center gap-0.5 ml-2">
                        <Star className="w-3 h-3 text-amber-400 inline" /> {d.rating.toFixed(2)} · {d.totalTrips} viajes
                      </span>
                    )}
                  </p>
                </div>
                {d.isVerified ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 shrink-0">
                    <ShieldCheck className="w-3 h-3" /> Verificado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 shrink-0" title="Debe completar sus documentos en la app para poder operar">
                    <Clock className="w-3 h-3" /> Docs pendientes
                  </span>
                )}
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${st.cls}`}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
