'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ticket, Loader2, Plus } from 'lucide-react'
import type { OperatorApi } from './api'
import { formatCOP } from '../moneda'

/**
 * Los códigos de descuento de la empresa para sus pasajes.
 *
 * POR QUÉ LOS EMITE ELLA Y NO NOSOTROS
 * ------------------------------------
 * En un viaje urbano el cupón lo paga la plataforma: estamos en medio del
 * dinero y el descuento sale de nuestra comisión. En un pasaje de bus no:
 * el pasajero le paga a la empresa y por la app no pasa un peso, así que un
 * cupón «de ZIPA» haría que la empresa cobrara menos sin haberlo decidido y
 * sin que nadie le reponga la diferencia.
 *
 * Por eso el código lo crea la empresa —para llenar una salida floja, para un
 * convenio con una universidad— y el descuento sale de su propio precio. El
 * conductor lo ve en el manifiesto, junto a lo que tiene que cobrar.
 */

interface Promo {
  id: string
  code: string
  description: string | null
  type: 'PERCENT' | 'FIXED'
  value: number
  minAmount: number
  maxDiscount: number | null
  maxRedemptions: number | null
  perUserLimit: number
  expiresAt: string | null
  active: boolean
  redemptions: number
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

export default function PromosManager({ api }: { api: OperatorApi }) {
  const [promos, setPromos] = useState<Promo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallo, setFallo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [code, setCode] = useState('')
  const [tipo, setTipo] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [valor, setValor] = useState('10')
  const [minimo, setMinimo] = useState('')
  const [usos, setUsos] = useState('')
  const [vence, setVence] = useState('')

  const load = useCallback(async () => {
    try {
      setPromos(await api<Promo[]>('/operator/promos'))
      setFallo(false)
    } catch {
      // Cargando, falló y «no hay ninguno» son tres cosas distintas: sin esto,
      // una petición caída se leería como «no tienes códigos».
      setFallo(true)
      setPromos(null)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  const crear = async () => {
    setGuardando(true)
    setError(null)
    try {
      await api('/operator/promos', {
        method: 'POST',
        body: JSON.stringify({
          code,
          type: tipo,
          value: Number(valor),
          ...(minimo ? { minAmount: Number(minimo) } : {}),
          ...(usos ? { maxRedemptions: Number(usos) } : {}),
          ...(vence ? { expiresAt: new Date(vence).toISOString() } : {}),
        }),
      })
      setCode('')
      setMinimo('')
      setUsos('')
      setVence('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el código.')
    } finally {
      setGuardando(false)
    }
  }

  const alternar = async (p: Promo) => {
    try {
      await api(`/operator/promos/${p.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ active: !p.active }),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el código.')
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
          <Ticket className="w-4 h-4 text-emerald-600" /> Códigos de descuento
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Para tus pasajes. El descuento sale de tu tarifa —el pasaje te lo
          pagan a ti— y el conductor ve en el manifiesto cuánto cobrar.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <input
          className={`${INPUT} col-span-2 uppercase`}
          placeholder="CODIGO"
          value={code}
          maxLength={24}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <select className={INPUT} value={tipo} onChange={(e) => setTipo(e.target.value as 'PERCENT' | 'FIXED')}>
          <option value="PERCENT">%</option>
          <option value="FIXED">$</option>
        </select>
        <input
          className={INPUT}
          type="number"
          min={1}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <input
          className={INPUT}
          type="number"
          min={0}
          placeholder="Usos"
          value={usos}
          onChange={(e) => setUsos(e.target.value)}
        />
        <input
          className={INPUT}
          type="date"
          value={vence}
          onChange={(e) => setVence(e.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        onClick={() => void crear()}
        disabled={guardando || !code.trim()}
        className="inline-flex items-center gap-1.5 py-2 px-4 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Crear código
      </button>

      {fallo ? (
        <p className="text-sm text-amber-700">
          No pudimos cargar tus códigos. Reintenta en un momento.
        </p>
      ) : promos == null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : promos.length === 0 ? (
        <p className="text-sm text-slate-500">
          Todavía no has creado ninguno.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {promos.map((p) => (
            <li key={p.id} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{p.code}</p>
                <p className="text-[11px] text-slate-500">
                  {p.type === 'PERCENT' ? `${p.value}% de descuento` : `${formatCOP(p.value)} de descuento`}
                  {p.minAmount ? ` · desde ${formatCOP(p.minAmount)}` : ''}
                  {` · usado ${p.redemptions}${p.maxRedemptions ? ` de ${p.maxRedemptions}` : ''}`}
                  {p.expiresAt ? ` · vence ${new Date(p.expiresAt).toLocaleDateString('es-CO')}` : ''}
                </p>
              </div>
              <button
                onClick={() => void alternar(p)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  p.active
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}
              >
                {p.active ? 'Activo' : 'Inactivo'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
