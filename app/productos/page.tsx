import { ProductCard } from '@/components/product/ProductCard'
import { products, collections, type CollectionHandle } from '@/lib/mockData'

type SearchParams = { sort?: string; categoria?: CollectionHandle }

export const metadata = {
  title: 'Productos',
  description: 'Catálogo completo de productos Nexum. GPS mascotas, accesorios auto y gadgets premium.',
}

const SORT_OPTIONS = [
  { value: 'default',     label: 'Destacados'   },
  { value: 'new',         label: 'Más nuevos'   },
  { value: 'bestselling', label: 'Más vendidos' },
  { value: 'price-asc',   label: 'Precio: menor'  },
  { value: 'price-desc',  label: 'Precio: mayor'  },
]

export default function ProductosPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { sort, categoria } = searchParams

  let filtered = [...products]

  // Filtro por categoría
  if (categoria) {
    filtered = filtered.filter(p => p.category === categoria)
  }

  // Filtro por sort
  if (sort === 'new') {
    filtered = filtered.filter(p => p.isNew).concat(filtered.filter(p => !p.isNew))
  } else if (sort === 'bestselling') {
    filtered = filtered.filter(p => p.isBestseller).concat(filtered.filter(p => !p.isBestseller))
  } else if (sort === 'price-asc') {
    filtered = [...filtered].sort((a, b) => a.price - b.price)
  } else if (sort === 'price-desc') {
    filtered = [...filtered].sort((a, b) => b.price - a.price)
  }

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-10 space-y-2">
          <span className="gold-line" />
          <h1 className="font-heading font-black text-display-sm text-ghost">
            {categoria
              ? collections.find(c => c.handle === categoria)?.title ?? 'Productos'
              : 'Todos los productos'}
          </h1>
          <p className="text-ghost-muted text-sm">
            {filtered.length} producto{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8
                        pb-6 border-b border-white/5">

          {/* Category filters */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/productos"
              className={`badge text-xs ${!categoria ? 'badge-gold' : 'badge-ghost hover:badge-gold'} transition-all`}
            >
              Todos
            </a>
            {collections.map(col => (
              <a
                key={col.handle}
                href={`/productos?categoria=${col.handle}${sort ? `&sort=${sort}` : ''}`}
                className={`badge text-xs ${
                  categoria === col.handle ? 'badge-gold' : 'badge-ghost'
                } transition-all`}
              >
                {col.title}
              </a>
            ))}
          </div>

          {/* Sort */}
          <select
            className="bg-obsidian-50 border border-white/10 text-ghost-muted text-sm
                       rounded-nexum px-4 py-2 focus:outline-none focus:border-gold/50
                       focus:text-ghost transition-colors cursor-pointer"
            defaultValue={sort ?? 'default'}
            onChange={e => {
              const url = new URL(window.location.href)
              if (e.target.value === 'default') url.searchParams.delete('sort')
              else url.searchParams.set('sort', e.target.value)
              window.location.href = url.toString()
            }}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((product, i) => (
              <ProductCard key={product.id} product={product} priority={i < 4} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-ghost-muted text-lg">No se encontraron productos.</p>
            <a href="/productos" className="btn-outline-gold mt-6 inline-flex">
              Ver todos los productos
            </a>
          </div>
        )}

      </div>
    </div>
  )
}
