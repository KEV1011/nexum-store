'use client'

/**
 * «Tomar pedido»: las mesas del local, cada una abre la carta para pedir por
 * ella. Es la MISMA carta del QR (`/carta/<código>?mesa=N`): el pedido sale por
 * el mismo camino que el del comensal, entra ya a su cuenta y a la cocina, y
 * no hay una segunda forma de crear pedidos que se pueda desviar de la primera.
 *
 * Si quien toma el pedido es alguien del equipo, su enlace va detrás del `#`
 * para que el pedido diga qué mesero lo tomó. El del dueño NO se pone nunca:
 * esa carta es pública y su enlace abre el portal entero.
 */

import { useEffect, useState } from 'react'
import { ClipboardList, Loader2 } from 'lucide-react'

import { BACKEND_URL } from '../../../backend'
import type { RolPortal } from '../../acceso'

export function TomarPedido({ token, rol }: { token: string; rol: RolPortal | null }) {
  const [mesas, setMesas] = useState<{ menuCode: string; tables: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void fetch(`${BACKEND_URL}/business/${token}/mesas`, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as {
          success?: boolean
          data?: { menuCode: string; tables: string[] }
          error?: string
        }
        if (!vivo) return
        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? 'No pudimos cargar las mesas.')
          return
        }
        setMesas(json.data)
      })
      .catch(() => {
        if (vivo) setError('No se pudo conectar con el servidor.')
      })
    return () => {
      vivo = false
    }
  }, [token])

  function enlace(mesa: string): string {
    const base = `/carta/${encodeURIComponent(mesas!.menuCode)}?mesa=${encodeURIComponent(mesa)}`
    return rol && rol !== 'DUENO' ? `${base}#personal=${encodeURIComponent(token)}` : base
  }

  if (error) {
    return <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
  }
  if (!mesas) {
    return (
      <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando mesas…
      </p>
    )
  }
  if (mesas.tables.length === 0) {
    return (
      <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
        El local todavía no tiene mesas configuradas. El dueño las agrega en Ajustes → Mesas.
      </p>
    )
  }
  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-900">
        <ClipboardList className="h-4 w-4 text-emerald-700" /> Tomar pedido
      </h2>
      <div className="flex flex-wrap gap-2">
        {mesas.tables.map((m) => (
          <a
            key={m}
            href={enlace(m)}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2
                       text-sm font-bold text-slate-800 hover:bg-emerald-50 hover:border-emerald-200"
          >
            Mesa {m}
          </a>
        ))}
      </div>
    </section>
  )
}
