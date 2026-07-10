import Link from 'next/link'
import { ArrowRight, Store, Car, Package } from 'lucide-react'

// Landing mínima: la web pública de Nexum es el portal de negocios.
// Las apps (cliente y conductor) viven en GitHub Pages / stores.

const SERVICES = [
  {
    icon: Car,
    title: 'Transporte',
    sub: 'Carro, taxi y moto en tu ciudad y rutas intermunicipales.',
  },
  {
    icon: Package,
    title: 'Envíos y mandados',
    sub: 'Paquetes, compras y diligencias con seguimiento en tiempo real.',
  },
  {
    icon: Store,
    title: 'Negocios aliados',
    sub: 'Restaurantes, farmacias y tiendas con pedidos a domicilio.',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      <section className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.3em] uppercase text-emerald-400 mb-4">
            Nexum
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            Movilidad y envíos para tu ciudad
          </h1>
          <p className="text-slate-400 text-lg mb-10">
            Transporte, domicilios y mandados con seguimiento en tiempo real,
            estés donde estés.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 mb-12 text-left">
            {SERVICES.map(({ icon: Icon, title, sub }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <Icon className="w-6 h-6 text-emerald-400 mb-3" />
                <h2 className="font-bold mb-1">{title}</h2>
                <p className="text-sm text-slate-400">{sub}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/negocio/registro"
              className="inline-flex items-center justify-center gap-2 rounded-xl
                         bg-emerald-500 hover:bg-emerald-400 transition-colors
                         px-6 py-3 font-bold text-slate-950"
            >
              Registra tu negocio
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Nexum · Colombia
      </footer>
    </main>
  )
}
