import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: {
    default:  'Nexum — Tecnología de Alto Estatus',
    template: '%s | Nexum',
  },
  description: 'GPS para mascotas, accesorios premium para auto y gadgets de diseño. Tecnología que eleva tu vida diaria.',
  keywords:    ['GPS mascotas', 'accesorios auto', 'gadgets premium', 'tecnología', 'Nexum'],
  authors:     [{ name: 'Nexum' }],
  openGraph: {
    type:        'website',
    locale:      'es_CO',
    siteName:    'Nexum',
    title:       'Nexum — Tecnología de Alto Estatus',
    description: 'GPS para mascotas, accesorios premium para auto y gadgets de diseño.',
  },
  twitter: {
    card:  'summary_large_image',
    title: 'Nexum — Tecnología de Alto Estatus',
  },
  robots: {
    index:  true,
    follow: true,
  },
  themeColor: '#0D0D0D',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es-CO" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-obsidian text-ghost antialiased">
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
