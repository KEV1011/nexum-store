import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// ── Las fuentes viven en el repo, no se descargan al construir ──────────────
//
// POR QUÉ. `next/font/google` baja el .woff2 de fonts.gstatic.com DURANTE el
// build. Es cómodo, pero convierte a Google en una dependencia de despliegue:
// un tropiezo de red suyo —o del runner— tumba el deploy con un montón de
// «module not found» sobre un CSS generado, sin que haya una sola línea rota
// en el repositorio. Pasó aquí: el mismo commit falló y a la segunda salió
// verde. Un build que depende del humor de la red no es reproducible, y el
// error no se parece en nada a su causa, que es lo que lo hace caro.
//
// Autoalojarlas quita la descarga del camino crítico. El navegador ya recibía
// los archivos desde nuestro dominio (eso lo hacía igual `next/font/google`,
// que descarga en build y sirve local), así que para quien visita la web NO
// cambia nada: ni una petición más ni una menos.
//
// Los dos archivos son el subconjunto **latin**, que cubre todo el español
// (áéíóúñü¿¡ comprobado carácter por carácter) y son fuentes VARIABLES de
// 100 a 900, así que un solo archivo por familia da todos los pesos: 86 KB
// entre las dos, menos que los cuatro estáticos que se bajaban antes.
//
// Para actualizarlas: `tools/descargar-fuentes.py`.
const inter = localFont({
  src:      './fonts/Inter-latin.woff2',
  variable: '--font-inter',
  display:  'swap',
  weight:   '100 900',
})

// El rango completo y no «600 800» como pedía la config vieja: `font-black`
// (900) se usa en loading.tsx y not-found.tsx, y como 900 no estaba entre los
// pesos cargados el navegador lo resolvía con el más cercano —800—. Pedía un
// peso y recibía otro, en silencio. El archivo variable lo trae sin coste.
const montserrat = localFont({
  src:      './fonts/Montserrat-latin.woff2',
  variable: '--font-montserrat',
  display:  'swap',
  weight:   '100 900',
})

export const metadata: Metadata = {
  title: {
    default:  'ZIPA — Movilidad y envíos',
    template: '%s | ZIPA',
  },
  description:
    'Plataforma de movilidad, envíos y pedidos en Colombia. ' +
    'Portal de negocios aliados con seguimiento de pedidos en tiempo real.',
  keywords: ['transporte', 'envíos', 'domicilios', 'Colombia', 'ZIPA'],
  authors:  [{ name: 'ZIPA' }],
  openGraph: {
    type:        'website',
    locale:      'es_CO',
    siteName:    'ZIPA',
    title:       'ZIPA — Movilidad y envíos',
    description: 'Transporte, envíos y pedidos con seguimiento en tiempo real.',
  },
  robots: { index: true, follow: true },
}

// Sin esto el móvil renderiza la página a ~980 px y la escala: los portales se
// ven diminutos e inservibles en el celular, que es donde el dueño de un
// negocio abre su panel de pedidos. `maximum-scale` se deja libre para no
// impedir el zoom (accesibilidad).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
