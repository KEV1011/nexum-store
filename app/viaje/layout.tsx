import type { Metadata } from 'next'

// El seguimiento de un viaje es de quien lo recibió por WhatsApp, no de un
// buscador: el enlace lleva un viaje de verdad, con su origen y su destino.
export const metadata: Metadata = {
  title: 'Seguimiento de viaje · ZIPA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function ViajeLayout({ children }: { children: React.ReactNode }) {
  return children
}
