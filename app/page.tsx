import Link from 'next/link'
import { ArrowRight, Shield, Zap, Star, Truck } from 'lucide-react'
import { ProductCard } from '@/components/product/ProductCard'
import { getBestsellers, getNewArrivals, collections, formatPrice } from '@/lib/mockData'

// Esta página es SSG por defecto en Next.js 14 — óptima para Core Web Vitals

const TRUST_BADGES = [
  { icon: Truck,  label: 'Envío gratis',    sub: 'En compras +$200.000'  },
  { icon: Shield, label: 'Garantía',         sub: '12 meses incluidos'    },
  { icon: Zap,    label: 'Despacho rápido',  sub: 'En 24-48 horas'        },
  { icon: Star,   label: 'Top rated',        sub: '4.9 / 5 en reseñas'   },
]

export default function HomePage() {
  const bestsellers = getBestsellers()
  const newArrivals = getNewArrivals()

  return (
    <>
      {/* ════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero">

        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px]
                          rounded-full bg-gold/5 blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px]
                          rounded-full bg-gold/3 blur-[100px]" />
        </div>

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(248,249,250,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(248,249,250,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 text-center">

          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 badge-gold mb-8 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            <span className="text-xs tracking-widest uppercase">Nueva colección disponible</span>
          </div>

          {/* Headline */}
          <h1 className="font-heading font-black text-display-xl text-ghost text-balance animate-slide-up">
            Tecnología que{' '}
            <span className="relative inline-block">
              <span className="text-gold">eleva</span>
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 200 8"
                fill="none"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 6 Q100 0 200 6"
                  stroke="#D4AF37"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>{' '}
            tu vida diaria
          </h1>

          {/* Subheadline */}
          <p className="mt-6 text-ghost-muted text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed text-balance animate-slide-up">
            GPS de alta precisión para mascotas, accesorios premium para auto
            y gadgets de diseño. Todo en un solo lugar.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
            <Link href="/productos" className="btn-primary text-sm px-8 py-4">
              Explorar productos
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/colecciones/pet-tracking" className="btn-ghost text-sm px-8 py-4">
              Ver GPS Mascotas
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-md mx-auto animate-fade-in">
            {[
              { value: '+500',  label: 'Clientes' },
              { value: '4.9★', label: 'Rating' },
              { value: '24h',   label: 'Despacho' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <div className="font-heading font-black text-2xl text-gold">{stat.value}</div>
                <div className="text-ghost-subtle text-xs mt-0.5 uppercase tracking-widest">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-fade-in">
          <span className="text-ghost-subtle text-xs uppercase tracking-widest">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-ghost-subtle to-transparent" />
        </div>
      </section>

      {/* ════════════════════════════════════════════
          TRUST BADGES
      ════════════════════════════════════════════ */}
      <section className="border-y border-white/5 bg-obsidian-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8">
            {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-nexum bg-gold-glow
                               border border-gold/20 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-gold" />
                </div>
                <div>
                  <p className="font-heading font-semibold text-ghost text-sm">{label}</p>
                  <p className="text-ghost-subtle text-xs">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ════════════════════════════════════════════
            CATEGORÍAS
        ════════════════════════════════════════════ */}
        <section className="py-20">
          <div className="flex items-end justify-between mb-10">
            <div className="space-y-3">
              <span className="gold-line" />
              <h2 className="section-heading">
                Explora nuestras <span>categorías</span>
              </h2>
            </div>
            <Link
              href="/productos"
              className="hidden sm:flex items-center gap-1.5 text-ghost-muted
                         hover:text-gold text-sm font-medium transition-colors"
            >
              Ver todo <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {collections.map((col, i) => (
              <Link
                key={col.handle}
                href={`/colecciones/${col.handle}`}
                className="group relative rounded-nexum-xl overflow-hidden border border-white/5
                           hover:border-gold/30 transition-all duration-300 hover:shadow-nexum-gold"
                style={{ aspectRatio: i === 0 ? '4/5' : '4/4' }}
              >
                {/* Placeholder visual */}
                <div className="absolute inset-0 bg-gradient-card flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="w-20 h-20 mx-auto rounded-nexum-lg bg-white/5
                                    border border-white/10 flex items-center justify-center
                                    group-hover:border-gold/30 transition-colors">
                      <Zap className="w-9 h-9 text-gold/50 group-hover:text-gold transition-colors" />
                    </div>
                  </div>
                </div>

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/40 to-transparent" />

                {/* Content */}
                <div className="absolute bottom-0 inset-x-0 p-6">
                  <p className="text-ghost-subtle text-xs uppercase tracking-widest mb-1">
                    {col.productCount} productos
                  </p>
                  <h3 className="font-heading font-bold text-ghost text-2xl leading-none">
                    {col.title}{' '}
                    <span className="text-gold">{col.subtitle}</span>
                  </h3>
                  <p className="text-ghost-muted text-sm mt-2 line-clamp-2">
                    {col.description}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-gold text-sm font-medium
                                  group-hover:gap-2.5 transition-all duration-300">
                    Explorar <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ════════════════════════════════════════════
            BESTSELLERS
        ════════════════════════════════════════════ */}
        <section className="pb-20">
          <div className="flex items-end justify-between mb-10">
            <div className="space-y-3">
              <span className="gold-line" />
              <h2 className="section-heading">
                Los más <span>vendidos</span>
              </h2>
            </div>
            <Link
              href="/productos?sort=bestselling"
              className="hidden sm:flex items-center gap-1.5 text-ghost-muted
                         hover:text-gold text-sm font-medium transition-colors"
            >
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {bestsellers.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={i === 0}
              />
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ════════════════════════════════════════════
            NUEVOS INGRESOS
        ════════════════════════════════════════════ */}
        <section className="pb-20">
          <div className="flex items-end justify-between mb-10">
            <div className="space-y-3">
              <span className="gold-line" />
              <h2 className="section-heading">
                Nuevos <span>ingresos</span>
              </h2>
            </div>
            <Link
              href="/productos?sort=new"
              className="hidden sm:flex items-center gap-1.5 text-ghost-muted
                         hover:text-gold text-sm font-medium transition-colors"
            >
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {newArrivals.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        <div className="divider" />

        {/* ════════════════════════════════════════════
            CTA FINAL — Meta Ads landing anchor
        ════════════════════════════════════════════ */}
        <section className="pb-24 text-center">
          <div className="relative rounded-nexum-xl bg-gradient-card border border-white/5
                          overflow-hidden px-8 py-16">

            {/* Ambient */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-1/4 top-0 h-px bg-gradient-to-r
                              from-transparent via-gold/40 to-transparent" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                              w-[400px] h-[400px] rounded-full bg-gold/5 blur-[80px]" />
            </div>

            <div className="relative space-y-6 max-w-xl mx-auto">
              <span className="badge-gold mx-auto text-xs uppercase tracking-widest">
                Tecnología premium
              </span>
              <h2 className="font-heading font-black text-display-md text-ghost text-balance">
                Equipado para el{' '}
                <span className="text-gold">siguiente nivel</span>
              </h2>
              <p className="text-ghost-muted leading-relaxed">
                Descubre el ecosistema completo de Nexum. Desde el rastreador GPS
                de tu mascota hasta el sistema de cámara de tu auto.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/productos" className="btn-primary px-8 py-4">
                  Ver catálogo completo <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/contacto" className="btn-outline-gold px-8 py-4">
                  Hablar con un asesor
                </Link>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  )
}
