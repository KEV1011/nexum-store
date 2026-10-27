import type { Metadata, Viewport } from 'next'

import { BACKEND_URL } from '../../backend'
import { COLOR_TEMA, ICONO_APPLE, nombreCorto, rutaDelPortal } from '../pwa'

export const viewport: Viewport = {
  themeColor: COLOR_TEMA,
}

/**
 * Lo que hace instalable el portal de cada negocio: su manifiesto, y para
 * iPhone (que no lo lee) el ícono y el nombre por etiqueta.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params
  let nombre = 'Mi negocio'
  try {
    const res = await fetch(`${BACKEND_URL}/business/${encodeURIComponent(token)}/info`, {
      next: { revalidate: 300 },
    })
    const json = (await res.json()) as { data?: { name?: string } }
    if (json.data?.name) nombre = json.data.name
  } catch {
    // Sin backend la página se abre igual; solo el nombre queda genérico.
  }
  return {
    manifest: `${rutaDelPortal(token)}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: nombreCorto(nombre), statusBarStyle: 'default' },
    icons: { apple: ICONO_APPLE },
    // Next solo emite `mobile-web-app-capable`; los iPhone anteriores a iOS
    // 16.4 necesitan el de Apple para abrirlo sin las barras de Safari.
    other: { 'apple-mobile-web-app-capable': 'yes' },
    // Un enlace de portal ES la llave del negocio: no puede salir en un
    // buscador.
    robots: { index: false, follow: false },
  }
}

export default function PortalNegocioLayout({ children }: { children: React.ReactNode }) {
  return children
}
