'use client'

import Link from 'next/link'
import { ShoppingBag, UtensilsCrossed, Settings } from 'lucide-react'

/**
 * Navegación del portal del negocio en teléfono.
 *
 * En escritorio el header lleva las píldoras de Catálogo y Ajustes, pero
 * estaban marcadas `hidden sm:inline-flex`: por debajo de 640 px desaparecían
 * y no había ninguna otra entrada. El dueño que abría el portal en el celular
 * —que es como lo usa casi siempre— no podía llegar a su propio catálogo.
 *
 * Estas pestañas solo aparecen en móvil (`sm:hidden`), así que el escritorio
 * queda exactamente igual que hoy.
 */

const TABS = [
  { key: 'pedidos', label: 'Pedidos', icon: ShoppingBag, path: '' },
  { key: 'catalogo', label: 'Catálogo', icon: UtensilsCrossed, path: '/catalogo' },
  { key: 'ajustes', label: 'Ajustes', icon: Settings, path: '/ajustes' },
] as const

export type PortalTab = (typeof TABS)[number]['key']

export function PortalTabs({ token, activa }: { token: string; activa: PortalTab }) {
  return (
    // En el teléfono lo que debe quedar fijo al desplazar es la navegación, no
    // la marca: por eso el header pasa a `sm:sticky` y estas pestañas toman el
    // `top-0`. Así se evita además depender de la altura exacta del header.
    <nav className="sm:hidden bg-white border-b border-slate-200 sticky top-0 z-20">
      <div className="flex">
        {TABS.map((t) => {
          const esActiva = t.key === activa
          return (
            <Link
              key={t.key}
              href={`/negocio/${token}${t.path}`}
              aria-current={esActiva ? 'page' : undefined}
              // min-h-[52px]: objetivo táctil cómodo con el pulgar.
              className={`flex-1 min-h-[52px] flex flex-col items-center justify-center gap-0.5 border-b-2 transition-colors ${
                esActiva
                  ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                  : 'border-transparent text-slate-500 active:bg-slate-50'
              }`}
            >
              <t.icon className="w-4.5 h-4.5" />
              <span className="text-[11px] font-semibold">{t.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
