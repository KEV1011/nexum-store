import Link from 'next/link'
import { ArrowRight, Store, Car, Package } from 'lucide-react'

// Landing mínima: la web pública de ZIPA es el portal de negocios.
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
            ZIPA
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

          {/* Dos aliados = dos portales distintos. Antes solo estaba el de
              negocios; las empresas de transporte no tenían cómo registrarse. */}
          <div className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto">
            <Link
              href="/negocio/registro"
              className="group flex flex-col items-center gap-1 rounded-2xl
                         bg-emerald-500 hover:bg-emerald-400 transition-colors
                         px-6 py-4 text-slate-950"
            >
              <span className="inline-flex items-center gap-2 font-bold">
                <Store className="w-4 h-4" />
                Registra tu negocio
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <span className="text-xs font-medium text-emerald-950/70">
                Restaurantes, tiendas y farmacias
              </span>
            </Link>

            <Link
              href="/empresa/registro"
              className="group flex flex-col items-center gap-1 rounded-2xl
                         border border-slate-700 bg-slate-900 hover:border-emerald-500
                         transition-colors px-6 py-4 text-slate-50"
            >
              <span className="inline-flex items-center gap-2 font-bold">
                <Car className="w-4 h-4 text-emerald-400" />
                Empresa de transporte
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <span className="text-xs font-medium text-slate-400">
                Taxi e intermunicipal · gestiona tu flota
              </span>
            </Link>
          </div>

          <p className="mt-6 text-sm text-slate-500">
            ¿Ya tienes cuenta?{' '}
            <Link href="/empresa" className="text-emerald-400 hover:underline">
              Ingreso de empresas
            </Link>
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-6 text-center text-sm text-slate-500 space-y-2">
        <p>© {new Date().getFullYear()} ZIPA · Colombia</p>
        {/* Transparencia de IA (FTC/Ley 1581): declaración pública del uso de
            algoritmos en el emparejamiento, rutas y prevención de fraude. */}
        <p className="text-xs text-slate-600 max-w-xl mx-auto px-4">
          ZIPA usa inteligencia artificial para emparejar servicios con conductores,
          estimar rutas y tarifas, y detectar fraudes y anomalías de seguridad.
        </p>
      </footer>
    </main>
  )
}
