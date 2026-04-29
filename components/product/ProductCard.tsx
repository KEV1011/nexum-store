'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ShoppingCart, Zap } from 'lucide-react'
import { type Product, formatPrice } from '@/lib/mockData'
import { useCart } from '@/context/CartContext'
import { clsx } from 'clsx'

interface ProductCardProps {
  product:   Product
  priority?: boolean
  className?: string
}

export function ProductCard({ product, priority = false, className }: ProductCardProps) {
  const { addItem } = useCart()
  const hasDiscount = product.comparePrice && product.comparePrice > product.price
  const discount    = hasDiscount
    ? Math.round((1 - product.price / product.comparePrice!) * 100)
    : 0

  return (
    <Link href={`/p/${product.handle}`} className={clsx('product-card group block', className)}>

      {/* ── Image container ── */}
      <div className="relative aspect-square overflow-hidden bg-obsidian-50 rounded-t-nexum-lg">

        {/* Placeholder cuando no hay imagen real */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-card">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-nexum bg-white/5 flex items-center justify-center">
              <Zap className="w-7 h-7 text-gold/60" />
            </div>
            <p className="text-xs text-ghost-subtle font-medium">{product.title}</p>
          </div>
        </div>

        {/* Imagen real del producto (activa cuando existan assets) */}
        {product.images[0] && !product.images[0].startsWith('/images/') && (
          <Image
            src={product.images[0]}
            alt={product.title}
            fill
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        )}

        {/* ── Badges ── */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {product.badge && (
            <span className="badge-gold text-[10px] uppercase tracking-widest">
              {product.badge}
            </span>
          )}
          {hasDiscount && (
            <span className="badge bg-red-500/20 text-red-400 border border-red-500/30 text-[10px]">
              -{discount}%
            </span>
          )}
        </div>

        {/* ── Quick add hover overlay ── */}
        <div className="absolute inset-x-3 bottom-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
          <button
            className="w-full btn-primary py-2.5 text-xs gap-1.5"
            onClick={e => {
              e.preventDefault()
              addItem(product)
            }}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Agregar al carrito
          </button>
        </div>
      </div>

      {/* ── Info ── */}
      <div className="p-4 space-y-1">
        <p className="text-xs text-ghost-subtle font-medium uppercase tracking-widest">
          {product.subtitle}
        </p>
        <h3 className="font-heading font-semibold text-ghost text-[15px] leading-tight">
          {product.title}
        </h3>

        {/* Precio */}
        <div className="flex items-center gap-2 pt-1">
          <span className="font-heading font-bold text-gold text-base">
            {formatPrice(product.price, product.currency)}
          </span>
          {hasDiscount && (
            <span className="text-ghost-subtle text-sm line-through">
              {formatPrice(product.comparePrice!, product.currency)}
            </span>
          )}
        </div>

        {/* Highlights — top 2 */}
        <ul className="pt-2 space-y-1">
          {product.highlights.slice(0, 2).map(h => (
            <li key={h} className="flex items-center gap-1.5 text-xs text-ghost-subtle">
              <span className="w-1 h-1 rounded-full bg-gold flex-shrink-0" />
              {h}
            </li>
          ))}
        </ul>
      </div>

    </Link>
  )
}
