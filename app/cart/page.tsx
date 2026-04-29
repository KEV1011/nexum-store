'use client'

import Link from 'next/link'
import { ShoppingBag, ArrowLeft, ArrowRight, Trash2, Plus, Minus } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { formatPrice } from '@/lib/mockData'

const SHIPPING_THRESHOLD = 200000

export default function CartPage() {
  const { items, itemCount, subtotal, formattedSubtotal, removeItem, updateQty, clearCart } = useCart()

  const freeShipping    = subtotal >= SHIPPING_THRESHOLD
  const remaining       = SHIPPING_THRESHOLD - subtotal
  const shippingProgress = Math.min((subtotal / SHIPPING_THRESHOLD) * 100, 100)

  return (
    <div className="pt-24 pb-20 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="space-y-2">
            <Link
              href="/productos"
              className="inline-flex items-center gap-1.5 text-ghost-subtle hover:text-ghost text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Seguir comprando
            </Link>
            <h1 className="font-heading font-black text-display-sm text-ghost">
              Tu carrito{' '}
              {itemCount > 0 && (
                <span className="text-gold">({itemCount})</span>
              )}
            </h1>
          </div>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-ghost-subtle hover:text-red-400 text-sm transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Vaciar carrito
            </button>
          )}
        </div>

        {items.length === 0 ? (
          /* ── Empty state ── */
          <div className="text-center py-24 space-y-6">
            <div className="w-20 h-20 mx-auto rounded-nexum-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <ShoppingBag className="w-9 h-9 text-ghost-subtle" />
            </div>
            <div>
              <p className="font-heading font-bold text-ghost text-xl">Tu carrito está vacío</p>
              <p className="text-ghost-muted text-sm mt-2">Descubre nuestros productos y agrega los que más te gusten</p>
            </div>
            <Link href="/productos" className="btn-primary inline-flex px-8 py-4">
              Explorar productos
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ── Items ── */}
            <div className="lg:col-span-2 space-y-4">

              {/* Envío gratis progress */}
              <div className="p-4 rounded-nexum-lg bg-gradient-card border border-white/5 space-y-2">
                {freeShipping ? (
                  <p className="text-sm text-green-400 font-medium">
                    ¡Tienes envío gratis en tu pedido!
                  </p>
                ) : (
                  <p className="text-sm text-ghost-muted">
                    Agrega{' '}
                    <span className="text-gold font-semibold">{formatPrice(remaining)}</span>
                    {' '}más para obtener envío gratis
                  </p>
                )}
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-gold rounded-full transition-all duration-500"
                    style={{ width: `${shippingProgress}%` }}
                  />
                </div>
              </div>

              {/* Product list */}
              {items.map(({ product, quantity }) => (
                <div
                  key={product.id}
                  className="flex gap-5 p-5 rounded-nexum-lg bg-gradient-card border border-white/5"
                >
                  {/* Image placeholder */}
                  <div className="w-20 h-20 rounded-nexum bg-white/5 border border-white/10 flex-shrink-0 flex items-center justify-center">
                    <ShoppingBag className="w-7 h-7 text-gold/40" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/p/${product.handle}`}
                          className="font-heading font-semibold text-ghost hover:text-gold transition-colors"
                        >
                          {product.title}
                        </Link>
                        <p className="text-ghost-subtle text-sm mt-0.5">{product.subtitle}</p>
                      </div>
                      <button
                        onClick={() => removeItem(product.id)}
                        className="p-1.5 text-ghost-subtle hover:text-red-400 transition-colors flex-shrink-0"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      {/* Quantity */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(product.id, quantity - 1)}
                          className="w-8 h-8 rounded-nexum bg-white/5 border border-white/10 flex items-center justify-center
                                     hover:border-gold/30 hover:text-gold transition-all text-ghost-muted"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-ghost font-medium">{quantity}</span>
                        <button
                          onClick={() => updateQty(product.id, quantity + 1)}
                          className="w-8 h-8 rounded-nexum bg-white/5 border border-white/10 flex items-center justify-center
                                     hover:border-gold/30 hover:text-gold transition-all text-ghost-muted"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Price */}
                      <div className="text-right">
                        <p className="font-heading font-bold text-gold">
                          {formatPrice(product.price * quantity, product.currency)}
                        </p>
                        {quantity > 1 && (
                          <p className="text-ghost-subtle text-xs">
                            {formatPrice(product.price, product.currency)} c/u
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Order Summary ── */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 rounded-nexum-xl bg-gradient-card border border-white/5 p-6 space-y-5">
                <h2 className="font-heading font-bold text-ghost text-lg">Resumen del pedido</h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-ghost-muted">
                    <span>Subtotal ({itemCount} items)</span>
                    <span className="text-ghost">{formattedSubtotal}</span>
                  </div>
                  <div className="flex justify-between text-ghost-muted">
                    <span>Envío</span>
                    <span className={freeShipping ? 'text-green-400' : 'text-ghost'}>
                      {freeShipping ? 'Gratis' : 'Calculado al pagar'}
                    </span>
                  </div>
                  <div className="border-t border-white/5 pt-3 flex justify-between">
                    <span className="font-heading font-bold text-ghost">Total</span>
                    <span className="font-heading font-black text-gold text-lg">
                      {formattedSubtotal}
                    </span>
                  </div>
                </div>

                {/* Checkout CTA */}
                <button className="btn-primary w-full py-4">
                  Proceder al pago
                  <ArrowRight className="w-4 h-4" />
                </button>
                {/* TODO Sprint 2: conectar con Shopify Checkout URL */}

                {/* Trust */}
                <div className="pt-2 space-y-2">
                  {['Pago 100% seguro', 'Devolución en 30 días', 'Garantía 12 meses'].map(t => (
                    <div key={t} className="flex items-center gap-2 text-ghost-subtle text-xs">
                      <span className="w-1 h-1 rounded-full bg-gold flex-shrink-0" />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
