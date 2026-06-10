import type { Metadata } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

const montserrat = Montserrat({
  subsets:  ['latin'],
  variable: '--font-montserrat',
  weight:   ['600', '700', '800'],
  display:  'swap',
})

export const metadata: Metadata = {
  title: {
    default:  'Nexum — Movilidad y envíos en Pamplona',
    template: '%s | Nexum',
  },
  description:
    'Plataforma de movilidad, envíos y pedidos para Pamplona, Norte de Santander. ' +
    'Portal de negocios aliados con seguimiento de pedidos en tiempo real.',
  keywords: ['transporte', 'envíos', 'domicilios', 'Pamplona', 'Nexum'],
  authors:  [{ name: 'Nexum' }],
  openGraph: {
    type:        'website',
    locale:      'es_CO',
    siteName:    'Nexum',
    title:       'Nexum — Movilidad y envíos en Pamplona',
    description: 'Transporte, envíos y pedidos con seguimiento en tiempo real.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={`scroll-smooth ${inter.variable} ${montserrat.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
