'use client'

// Campañas de temporada en el portal del negocio («Burger Show»).
//
// El admin de ZIPA crea la campaña con sus fechas; aquí el local inscribe SUS
// productos. Lo especial solo existe mientras la campaña rige: aparece el día
// que abre y se va solo cuando termina, sin que el dueño tenga que acordarse
// de borrarlo.

import { Megaphone } from 'lucide-react'

export interface Campana {
  id: string
  title: string
  subtitle: string | null
  /** AAAA-MM-DD, día de Colombia. */
  desde: string
  hasta: string
  estado: 'proxima' | 'vigente' | 'terminada' | 'apagada'
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function dia(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number)
  return `${d} ${MESES[(m ?? 1) - 1] ?? ''}`
}

/** «del 27 nov al 3 dic» (o «el 27 nov» si es de un solo día). */
export function fechasDeCampana(c: Pick<Campana, 'desde' | 'hasta'>): string {
  return c.desde === c.hasta ? `el ${dia(c.desde)}` : `del ${dia(c.desde)} al ${dia(c.hasta)}`
}

/** El anuncio arriba del catálogo: sin esto el dueño no se entera de que
 *  existe la campaña hasta que alguien se lo dice. */
export function AvisoCampanas({ campanas }: { campanas: Campana[] }) {
  if (campanas.length === 0) return null
  return (
    <div className="space-y-2">
      {campanas.map((c) => (
        <div key={c.id} className="flex items-start gap-3 rounded-2xl bg-red-50 ring-1 ring-red-200 px-4 py-3">
          <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm text-red-900">
            <p className="font-bold">
              {c.title} · {fechasDeCampana(c)}
              {c.estado === 'vigente' ? ' · ¡en curso!' : ''}
            </p>
            {c.subtitle ? <p className="text-red-800/90">{c.subtitle}</p> : null}
            <p className="mt-1 text-xs text-red-800/80">
              Crea tus productos especiales y elige «{c.title}» al crearlos. Salen en la
              sección de la campaña en la app, aparecen el día que abre y se retiran
              solos al terminar.
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Elegir campaña para un producto. Lo usan el alta y la edición, para que los
 * dos manden lo mismo.
 */
export function ElegirCampana({
  campanas,
  campanaId,
  soloEvento,
  onCampana,
  onSoloEvento,
  actual,
}: {
  campanas: Campana[]
  campanaId: string
  soloEvento: boolean
  onCampana: (id: string) => void
  onSoloEvento: (v: boolean) => void
  /** La campaña que ya tiene el producto, aunque haya terminado. */
  actual?: { id: string; title: string }
}) {
  const fueraDeLista = actual && !campanas.some((c) => c.id === actual.id)
  if (campanas.length === 0 && !actual) return null
  return (
    <div className="space-y-2 rounded-xl bg-red-50/60 ring-1 ring-red-200 px-3 py-2.5">
      <label className="block text-xs font-semibold text-red-900">
        Campaña
        <select
          className="mt-1 block w-full rounded-lg border border-red-200 bg-white px-2 py-2 text-sm text-slate-900"
          value={campanaId}
          onChange={(e) => onCampana(e.target.value)}
        >
          <option value="">Ninguna (producto de siempre)</option>
          {fueraDeLista ? (
            <option value={actual.id} disabled>
              {actual.title} (terminada)
            </option>
          ) : null}
          {campanas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {fechasDeCampana(c)}
            </option>
          ))}
        </select>
      </label>
      {campanaId ? (
        <label className="flex items-start gap-2 text-sm text-red-900 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={soloEvento}
            onChange={(e) => onSoloEvento(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Solo mientras dure la campaña</span>
            <span className="block text-xs text-red-800/80">
              {soloEvento
                ? 'Especial del evento: aparece el día que abre y se retira solo al terminar.'
                : 'Producto de siempre: sale en la sección de la campaña y se queda en tu carta después.'}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  )
}
