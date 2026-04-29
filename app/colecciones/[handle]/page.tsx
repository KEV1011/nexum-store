import { notFound } from 'next/navigation'
import { collections, getProductsByCollection, type CollectionHandle } from '@/lib/mockData'
import { ProductCard } from '@/components/product/ProductCard'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export async function generateStaticParams() {
  return collections.map(c => ({ handle: c.handle }))
}

export async function generateMetadata({ params }: { params: { handle: string } }) {
  const col = collections.find(c => c.handle === params.handle)
  if (!col) return {}
  return {
    title:       `${col.title} ${col.subtitle}`,
    description: col.description,
  }
}

export default function ColeccionPage({ params }: { params: { handle: string } }) {
  const col = collections.find(c => c.handle === params.handle)
  if (!col) notFound()

  const productos = getProductsByCollection(col.handle as CollectionHandle)

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-8">
          <Link
            href="/productos"
            className="inline-flex items-center gap-1.5 text-ghost-subtle hover:text-ghost text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Todos los productos
          </Link>
        </div>

        {/* Hero de colección */}
        <div className="relative rounded-nexum-xl overflow-hidden bg-gradient-card border border-white/5 p-10 mb-12">
          {/* Ambient */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-64 h-64 rounded-full bg-gold/5 blur-[60px]" />
          </div>
          <div className="relative space-y-3 max-w-xl">
            <span className="gold-line" />
            <h1 className="font-heading font-black text-display-md text-ghost">
              {col.title}{' '}
              <span className="text-gold">{col.subtitle}</span>
            </h1>
            <p className="text-ghost-muted leading-relaxed">{col.description}</p>
            <p className="text-ghost-subtle text-sm">{productos.length} productos disponibles</p>
          </div>
        </div>

        {/* Grid de productos */}
        {productos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {productos.map((product, i) => (
              <ProductCard key={product.id} product={product} priority={i < 4} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-ghost-muted">Próximamente productos en esta categoría.</p>
          </div>
        )}

      </div>
    </div>
  )
}
