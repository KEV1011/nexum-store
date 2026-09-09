'use client'

/**
 * El horario de atención, día por día.
 *
 * Hasta ahora el horario era una frase suelta («Lun-Sáb 8am-9pm») que no
 * cerraba nada: la tienda solo se cerraba con el interruptor manual. Si el
 * dueño se iba a dormir sin apagarlo, a las 3 de la mañana entraba un pedido
 * que nadie iba a preparar — y el cliente no le reclama al local, le reclama a
 * la plataforma.
 *
 * Se edita por día con casilla + dos horas porque es como lo tiene en la
 * cabeza; el backend lo valida otra vez (`saneaHorario`) y es él quien decide
 * si la tienda está abierta.
 */

import { Plus, Trash2 } from 'lucide-react'

export interface Franja {
  dia: number
  abre: string
  cierra: string
}

const DIAS = [
  { n: 1, corto: 'Lun' },
  { n: 2, corto: 'Mar' },
  { n: 3, corto: 'Mié' },
  { n: 4, corto: 'Jue' },
  { n: 5, corto: 'Vie' },
  { n: 6, corto: 'Sáb' },
  { n: 0, corto: 'Dom' },
]

const HORA =
  'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 ' +
  'focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20'

export function HorarioEditor({
  franjas,
  onChange,
}: {
  franjas: Franja[]
  onChange: (f: Franja[]) => void
}) {
  const delDia = (d: number) => franjas.filter((f) => f.dia === d)

  const abrirDia = (d: number) => {
    onChange([...franjas, { dia: d, abre: '08:00', cierra: '20:00' }])
  }
  const cerrarDia = (d: number) => {
    onChange(franjas.filter((f) => f.dia !== d))
  }
  const editar = (idx: number, campo: 'abre' | 'cierra', valor: string) => {
    onChange(franjas.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)))
  }
  const quitarFranja = (idx: number) => {
    onChange(franjas.filter((_, i) => i !== idx))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-800 mb-1">Horario de atención</p>
      <p className="text-[11px] text-slate-500 mb-3">
        Fuera de estas horas tu local aparece cerrado y no entran pedidos, aunque se te
        olvide apagarlo. Si no marcas ningún día, recibes a cualquier hora (como hasta ahora).
      </p>

      <div className="space-y-2">
        {DIAS.map(({ n, corto }) => {
          const lista = delDia(n)
          const abierto = lista.length > 0
          return (
            <div key={n} className="flex items-start gap-2">
              <label className="flex items-center gap-2 w-24 shrink-0 pt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={abierto}
                  onChange={() => (abierto ? cerrarDia(n) : abrirDia(n))}
                  className="w-4 h-4 accent-teal-700"
                />
                <span className={`text-sm ${abierto ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>
                  {corto}
                </span>
              </label>

              {abierto ? (
                <div className="flex-1 space-y-1.5">
                  {lista.map((f) => {
                    const idx = franjas.indexOf(f)
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="time"
                          className={HORA}
                          value={f.abre}
                          onChange={(e) => editar(idx, 'abre', e.target.value)}
                        />
                        <span className="text-xs text-slate-400">a</span>
                        <input
                          type="time"
                          className={HORA}
                          value={f.cierra}
                          onChange={(e) => editar(idx, 'cierra', e.target.value)}
                        />
                        {lista.length > 1 && (
                          <button
                            type="button"
                            onClick={() => quitarFranja(idx)}
                            className="p-1 text-slate-400 hover:text-red-600"
                            title="Quitar esta franja"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {/* Dos franjas el mismo día: el local que cierra al mediodía. */}
                  {lista.length < 3 && (
                    <button
                      type="button"
                      onClick={() => abrirDia(n)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900"
                    >
                      <Plus className="w-3 h-3" /> Otra franja (cierro al mediodía)
                    </button>
                  )}
                </div>
              ) : (
                <span className="pt-1.5 text-xs text-slate-400">Cerrado</span>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-slate-500 mt-3">
        ¿Cierras después de medianoche? Pon la hora de cierre igual (por ejemplo 18:00 a 02:00)
        y se cuenta como la noche del mismo día.
      </p>
    </div>
  )
}
