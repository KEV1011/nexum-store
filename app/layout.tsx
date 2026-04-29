import type { Metadata } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'
import { Navbar }      from '@/components/layout/Navbar'
import { Footer }      from '@/components/layout/Footer'
import { CartProvider } from '@/context/CartContext'
import { CartDrawer }  from '@/components/cart/CartDrawer'

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
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO" className={`scroll-smooth ${inter.variable} ${montserrat.variable}`}>
      <body className="bg-obsidian text-ghost antialiased">
        <CartProvider>
          <Navbar />
          <CartDrawer />
          <main>{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  )
}
