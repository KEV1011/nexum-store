// ── La línea de tiempo del pedido, para el comensal ──────────────────────────
//
// Los pasos y su orden los manda el SERVIDOR (`lib/linea-tiempo-pedido.ts`).
// Aquí no se decide ninguno: si esta pantalla los dedujera del estado, cada
// despliegue contaría una historia distinta de la que cuenta la app del
// cliente, y para un pedido en mesa habría que recordar que aquí no hay
// repartidor — que es justo el error que la plantilla del servidor evita.
//
// La hora se escribe con el huso del NAVEGADOR y no con el de Colombia a la
// fuerza: quien mira esto está sentado en el local, así que su reloj es el
// bueno. Un paso sin hora no escribe nada: el servidor manda `null` cuando no
// hay registro, y poner la de otro paso sería peor que el hueco.

'use client'

import { Check } from 'lucide-react'
import type { PasoPedido } from './api'

function hora(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export function LineaTiempo({ pasos }: { pasos: PasoPedido[] }) {
  if (pasos.length === 0) return null

  return (
    <ol className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1
        const hecho = p.estado === 'cumplido' || p.estado === 'cancelado'
        const activo = p.estado === 'actual'
        return (
          <li key={p.clave} className="flex gap-3">
            {/* Columna del riel: el punto y la línea que baja al siguiente */}
            <div className="flex flex-col items-center">
              <span
                className={
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ' +
                  // Rojo y no `rose`: un paso cancelado es el estado
                  // «problema», y en todo ZIPA ese estado es rojo. `rose` era
                  // un segundo rojo que no quería decir nada distinto.
                  (p.estado === 'cancelado'
                    ? 'border-red-300 bg-red-50'
                    : hecho
                      ? 'border-emerald-500 bg-emerald-500'
                      : activo
                        ? 'border-emerald-500 bg-white'
                        : 'border-slate-200 bg-white')
                }
              >
                {hecho && p.estado !== 'cancelado' && (
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                )}
                {activo && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              </span>
              {!ultimo && (
                <span
                  className={
                    'w-0.5 flex-1 ' + (hecho ? 'bg-emerald-200' : 'bg-slate-100')
                  }
                />
              )}
            </div>

            <div className={'min-w-0 flex-1 ' + (ultimo ? 'pb-0' : 'pb-4')}>
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={
                    'text-sm ' +
                    (activo
                      ? 'font-bold text-slate-900'
                      : hecho
                        ? 'font-semibold text-slate-700'
                        : 'text-slate-400')
                  }
                >
                  {p.titulo}
                </p>
                {p.at && (
                  <span className="shrink-0 text-xs font-semibold text-slate-400">
                    {hora(p.at)}
                  </span>
                )}
              </div>
              {p.detalle && <p className="mt-0.5 text-xs text-slate-500">{p.detalle}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
