import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart, Shield, Truck, RotateCcw, Star, Zap } from 'lucide-react'
import { getProductByHandle, products, formatPrice } from '@/lib/mockData'
import { ProductCard } from '@/components/product/ProductCard'

// Genera rutas estáticas para todos los productos en build time
export async function generateStaticParams() {
  return products.map(p => ({ slug: p.handle }))
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const product = getProductByHandle(params.slug)
  if (!product) return {}
  return {
    title:       product.title,
    description: product.description,
    openGraph: {
      title:       `${product.title} | Nexum`,
      description: product.description,
    },
  }
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProductByHandle(params.slug)
  if (!product) notFound()

  const discount     = product.comparePrice
    ? Math.round((1 - product.price / product.comparePrice) * 100)
    : 0

  // Productos relacionados de la misma categoría
  const related = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4)

  const GUARANTEES = [
    { icon: Shield,    label: 'Garantía 12 meses'       },
    { icon: Truck,     label: 'Envío gratis +$200k'     },
    { icon: RotateCcw, label: 'Devolución 30 días'      },
  ]

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-8 flex items-center gap-2 text-sm text-ghost-subtle">
          <Link href="/productos" className="flex items-center gap-1.5 hover:text-ghost transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Productos
          </Link>
          <span>/</span>
          <span className="text-ghost">{product.title}</span>
        </div>

        {/* Main product section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">

          {/* ── Gallery ── */}
          <div className="space-y-4">
            {/* Main image */}
            <div className="relative aspect-square rounded-nexum-xl overflow-hidden
                           bg-gradient-card border border-white/5">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="w-24 h-24 mx-auto rounded-nexum-lg bg-white/5
                                  border border-white/10 flex items-center justify-center">
                    <Zap className="w-11 h-11 text-gold/60" />
                  </div>
                  <p className="text-ghost-subtle text-sm font-medium">{product.title}</p>
                  <p className="text-ghost-subtle/60 text-xs">Imagen disponible al conectar Shopify</p>
                </div>
              </div>
              {/* Badges */}
              {product.badge && (
                <div className="absolute top-4 left-4">
                  <span className="badge-gold text-xs uppercase tracking-widest">
                    {product.badge}
                  </span>
                </div>
              )}
              {discount > 0 && (
                <div className="absolute top-4 right-4">
                  <span className="badge bg-red-500/20 text-red-400 border border-red-500/30 text-xs">
                    -{discount}% OFF
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails placeholder */}
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`aspect-square rounded-nexum overflow-hidden bg-gradient-card
                              border transition-all cursor-pointer
                              ${i === 0 ? 'border-gold/50' : 'border-white/5 hover:border-white/20'}`}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <Zap className="w-5 h-5 text-gold/20" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Info ── */}
          <div className="space-y-6">

            {/* Category + rating */}
            <div className="flex items-center justify-between">
              <Link
                href={`/colecciones/${product.category}`}
                className="badge-ghost hover:badge-gold transition-all text-xs uppercase tracking-widest"
              >
                {product.category.replace(/-/g, ' ')}
              </Link>
              <div className="flex items-center gap-1 text-gold text-sm">
                {Array(5).fill(0).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-gold text-gold" />
                ))}
                <span className="text-ghost-subtle text-xs ml-1">(48)</span>
              </div>
            </div>

            {/* Title */}
            <div>
              <p className="text-ghost-subtle text-sm mb-1">{product.subtitle}</p>
              <h1 className="font-heading font-black text-display-sm text-ghost leading-tight">
                {product.title}
              </h1>
            </div>

            {/* Price */}
            <div className="flex items-center gap-4">
              <span className="font-heading font-black text-3xl text-gold">
                {formatPrice(product.price, product.currency)}
              </span>
              {product.comparePrice && (
                <div className="flex flex-col">
                  <span className="text-ghost-subtle text-base line-through">
                    {formatPrice(product.comparePrice, product.currency)}
                  </span>
                  <span className="text-red-400 text-xs font-medium">
                    Ahorras {formatPrice(product.comparePrice - product.price, product.currency)}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            <p className="text-ghost-muted leading-relaxed">
              {product.description}
            </p>

            {/* Highlights */}
            <div className="space-y-2">
              <p className="font-heading font-semibold text-ghost text-sm uppercase tracking-widest">
                Características
              </p>
              <ul className="space-y-2">
                {product.highlights.map(h => (
                  <li key={h} className="flex items-center gap-3 text-ghost-muted text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* Stock */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${product.inStock ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-sm text-ghost-muted">
                {product.inStock ? 'En stock — listo para enviar' : 'Sin stock temporalmente'}
              </span>
            </div>

            {/* CTA */}
            <div className="space-y-3 pt-2">
              <button
                disabled={!product.inStock}
                className="btn-primary w-full py-4 text-base"
                // TODO: conectar con addToCart + CartContext en Sprint 2
              >
                <ShoppingCart className="w-5 h-5" />
                {product.inStock ? 'Agregar al carrito' : 'Sin disponibilidad'}
              </button>
              <button className="btn-ghost w-full py-3 text-sm">
                Comprar ahora
              </button>
            </div>

            {/* Guarantees */}
            <div className="pt-4 border-t border-white/5">
              <div className="grid grid-cols-3 gap-4">
                {GUARANTEES.map(({ icon: Icon, label }) => (
                  <div key={label} className="text-center space-y-2">
                    <div className="w-9 h-9 mx-auto rounded-nexum bg-gold-glow
                                    border border-gold/20 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-gold" />
                    </div>
                    <p className="text-ghost-subtle text-xs leading-tight">{label}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Related Products ── */}
        {related.length > 0 && (
          <section className="mt-20 pt-16 border-t border-white/5">
            <div className="mb-8 space-y-3">
              <span className="gold-line" />
              <h2 className="font-heading font-bold text-display-sm text-ghost">
                También te puede <span className="text-gold">interesar</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
