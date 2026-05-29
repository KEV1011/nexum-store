import Link from 'next/link'
import {
  MapPin,
  ShieldCheck,
  MessageCircle,
  Link2,
  CheckCircle2,
  Store,
  Truck,
  ArrowRight,
  Package,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Feature {
  icon: React.ElementType
  title: string
  description: string
}

interface Step {
  number: number
  title: string
  description: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const DEMO_TOKEN = 'sabor-pamp-2024'

const FEATURES: Feature[] = [
  {
    icon: MapPin,
    title: 'Seguimiento en tiempo real',
    description:
      'Consulta el estado de cada pedido en vivo: pendiente, en recogida, en camino o entregado. Sin llamadas, sin esperas.',
  },
  {
    icon: ShieldCheck,
    title: 'Cadena de custodia',
    description:
      'Cada pedido registra evidencia fotográfica de recogida y entrega, más firma del cliente. Sabes exactamente qué pasó con cada envío.',
  },
  {
    icon: MessageCircle,
    title: 'Notificaciones por WhatsApp',
    description:
      'Recibe alertas automáticas cuando el repartidor recoge el pedido y cuando lo entrega. Sin instalar ninguna app.',
  },
  {
    icon: Link2,
    title: 'Enlace único y privado',
    description:
      'Tu portal es exclusivo para tu negocio, accesible desde cualquier dispositivo con tu enlace personalizado. Nada que configurar.',
  },
]

const HOW_IT_WORKS: Step[] = [
  {
    number: 1,
    title: 'El repartidor registra tu negocio',
    description:
      'Cuando un repartidor de Nexum entrega por primera vez en tu local, registra los datos de tu negocio en la app.',
  },
  {
    number: 2,
    title: 'Recibes tu enlace único',
    description:
      'Te enviamos por WhatsApp un enlace personalizado con tu token de acceso. Es solo tuyo y siempre activo.',
  },
  {
    number: 3,
    title: 'Consulta tu portal en cualquier momento',
    description:
      'Abre el enlace desde el celular o computador y ve el estado de todos tus pedidos del día en tiempo real.',
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, description }: Feature) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex gap-4">
      <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-teal-700" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
        <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function HowItWorksStep({ step }: { step: Step }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="w-9 h-9 rounded-full bg-teal-700 flex items-center justify-center shrink-0 text-white font-bold text-sm">
        {step.number}
      </div>
      <div className="pt-1">
        <p className="font-semibold text-slate-900 text-sm">{step.title}</p>
        <p className="text-slate-500 text-sm leading-relaxed mt-1">{step.description}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Portal de Negocios — Nexum',
  description:
    'Descubre cómo el portal de Nexum te permite seguir tus pedidos en tiempo real y mantener una cadena de custodia completa.',
}

export default function RegistroPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-700 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm leading-tight">Nexum Delivery</p>
            <p className="text-xs text-slate-400">Portal de negocios</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">

        {/* ── Hero ── */}
        <section className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-full
                          px-4 py-1.5 text-teal-700 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Sin costo para el negocio
          </div>
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">
            El portal de pedidos{' '}
            <span className="text-teal-700">para tu negocio</span>
          </h1>
          <p className="text-slate-500 leading-relaxed max-w-lg mx-auto">
            Nexum te da visibilidad total sobre tus domicilios. Sigue cada pedido en tiempo real,
            revisa la cadena de custodia y recibe notificaciones por WhatsApp — todo sin instalar
            nada.
          </p>
        </section>

        {/* ── Features grid ── */}
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-900 text-lg">¿Qué incluye el portal?</h2>
          <div className="space-y-3">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 text-lg flex items-center gap-2">
            <Truck className="w-5 h-5 text-teal-600" />
            ¿Cómo obtienes acceso?
          </h2>
          <div className="space-y-5">
            {HOW_IT_WORKS.map((step) => (
              <HowItWorksStep key={step.number} step={step} />
            ))}
          </div>
        </section>

        {/* ── Note about registration ── */}
        <section className="bg-slate-100 border border-slate-200 rounded-xl p-5 flex gap-3">
          <Store className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-800 text-sm">
              El registro lo hace el repartidor
            </p>
            <p className="text-slate-500 text-sm mt-1 leading-relaxed">
              Los negocios no necesitan registrarse por sí solos. Cuando un repartidor de Nexum
              hace una entrega en tu local, te registra directamente desde su app y te envía el
              enlace por WhatsApp. Si aún no tienes tu enlace, solicítaselo al repartidor de Nexum
              que atiende tu zona.
            </p>
          </div>
        </section>

        {/* ── Demo CTA ── */}
        <section className="bg-teal-700 rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-white/20 flex items-center justify-center">
            <MapPin className="w-6 h-6 text-white" />
          </div>
          <h2 className="font-bold text-white text-xl">
            ¿Quieres ver cómo funciona?
          </h2>
          <p className="text-teal-100 text-sm leading-relaxed">
            Explora el portal de demostración de <strong className="text-white">Sabor Pampero</strong>,
            nuestro negocio de prueba con pedidos de ejemplo y cadena de custodia completa.
          </p>
          <Link
            href={`/negocio/${DEMO_TOKEN}`}
            className="inline-flex items-center gap-2 bg-white text-teal-700 font-semibold
                       text-sm px-6 py-3 rounded-xl hover:bg-teal-50 transition-colors shadow-sm"
          >
            Ver demo de Sabor Pampero
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-teal-200 text-xs">Datos de prueba · Sin información real</p>
        </section>

        {/* ── Footer ── */}
        <footer className="text-center pb-6">
          <p className="text-xs text-slate-400">
            Nexum Delivery · Todos los derechos reservados
          </p>
        </footer>

      </div>
    </div>
  )
}
