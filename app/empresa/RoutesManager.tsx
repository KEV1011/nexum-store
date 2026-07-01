'use client'

import { useCallback, useEffect, useState } from 'react'
import { Route as RouteIcon, Plus, Trash2, ShieldCheck, Clock, Loader2 } from 'lucide-react'
import type { OperatorApi } from './api'

// Ciudades intermunicipales soportadas (coinciden con el enum IntercityCity del
// backend). El código se guarda en mayúsculas; se muestra el label legible.
const CITIES: { code: string; label: string }[] = [
  { code: 'PAMPLONA', label: 'Pamplona' },
  { code: 'CUCUTA', label: 'Cúcuta' },
  { code: 'BUCARAMANGA', label: 'Bucaramanga' },
  { code: 'CHITAGA', label: 'Chitagá' },
  { code: 'MALAGA', label: 'Málaga' },
  { code: 'OCANA', label: 'Ocaña' },
  { code: 'BOGOTA', label: 'Bogotá' },
]
const CITY_LABEL: Record<string, string> = Object.fromEntries(CITIES.map((c) => [c.code, c.label]))

interface OperatorRoute {
  id: string
  originCity: string
  destCity: string
  authorized: boolean
}

export default function RoutesManager({ api }: { api: OperatorApi }) {
  const [routes, setRoutes] = useState<OperatorRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState('PAMPLONA')
  const [dest, setDest] = useState('CUCUTA')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<OperatorRoute[]>('/operator/routes')
      setRoutes(Array.isArray(data) ? data : [])
    } catch {
      /* el error puntual se muestra al accionar; aquí no bloqueamos el portal */
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  async function addRoute() {
    setError(null)
    if (origin === dest) { setError('El origen y el destino deben ser diferentes.'); return }
    setSaving(true)
    try {
      await api('/operator/routes', { method: 'POST', body: JSON.stringify({ originCity: origin, destCity: dest }) })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la ruta.')
    } finally {
      setSaving(false)
    }
  }

  async function removeRoute(id: string) {
    try {
      await api(`/operator/routes/${id}`, { method: 'DELETE' })
      setRoutes((rs) => rs.filter((r) => r.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la ruta.')
    }
  }

  return (
    <section>
      <h2 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-2">
        <RouteIcon className="w-4 h-4 text-emerald-600" /> Rutas troncales
        <span className="text-slate-400 font-normal">({routes.length})</span>
      </h2>
      <p className="text-xs text-slate-400 mb-3">
        Declara las rutas intermunicipales que operas. Nexum las autoriza tras verificar tu habilitación;
        solo entonces recibirás despachos de esos trayectos.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-3">
        <div className="flex flex-wrap items-end gap-2">
          <CitySelect label="Origen" value={origin} onChange={setOrigin} />
          <span className="text-slate-400 pb-2.5">→</span>
          <CitySelect label="Destino" value={dest} onChange={setDest} />
          <button
            onClick={addRoute}
            disabled={saving}
            className="ml-auto py-2 px-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Cargando rutas…</div>
      ) : routes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <RouteIcon className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Aún no has declarado rutas troncales.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {routes.map((r) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 text-sm">
                  {CITY_LABEL[r.originCity] ?? r.originCity} <span className="text-slate-400">→</span> {CITY_LABEL[r.destCity] ?? r.destCity}
                </p>
              </div>
              {r.authorized ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="w-3 h-3" /> Autorizada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  <Clock className="w-3 h-3" /> En revisión
                </span>
              )}
              <button
                onClick={() => removeRoute(r.id)}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                title="Eliminar ruta"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function CitySelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
      >
        {CITIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>
    </div>
  )
}
