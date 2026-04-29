'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X, ShoppingBag, Trash2, Plus, Minus, ArrowRight } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { formatPrice } from '@/lib/mockData'

export function CartDrawer() {
  const { items, isOpen, itemCount, subtotal, closeCart, removeItem, updateQty, formattedSubtotal } = useCart()

  // Bloquea scroll del body cuando el drawer está abierto
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Cierra con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCart() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closeCart])

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-obsidian/80 backdrop-blur-sm animate-fade-in"
          onClick={closeCart}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carrito de compras"
        className={`
          fixed top-0 right-0 z-50 h-full w-full max-w-md
          bg-obsidian-50 border-l border-white/5 shadow-nexum
          flex flex-col transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-gold" />
            <h2 className="font-heading font-bold text-ghost text-lg">
              Carrito
            </h2>
            {itemCount > 0 && (
              <span className="badge-gold text-xs">{itemCount}</span>
            )}
          </div>
          <button
            onClick={closeCart}
            className="p-2 rounded-nexum text-ghost-muted hover:text-ghost hover:bg-white/5 transition-all"
            aria-label="Cerrar carrito"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 no-scrollbar">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-20">
              <div className="w-16 h-16 rounded-nexum-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <ShoppingBag className="w-7 h-7 text-ghost-subtle" />
              </div>
              <div>
                <p className="font-heading font-semibold text-ghost">Tu carrito está vacío</p>
                <p className="text-ghost-subtle text-sm mt-1">Agrega productos para continuar</p>
              </div>
              <button onClick={closeCart} className="btn-outline-gold text-sm px-6 py-2.5">
                Ver productos
              </button>
            </div>
          ) : (
            items.map(({ product, quantity }) => (
              <div
                key={product.id}
                className="flex gap-4 p-4 rounded-nexum-lg bg-gradient-card border border-white/5 animate-fade-in"
              >
                {/* Imagen placeholder */}
                <div className="w-16 h-16 rounded-nexum bg-white/5 border border-white/10 flex-shrink-0 flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6 text-gold/40" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-heading font-semibold text-ghost text-sm leading-tight truncate">
                    {product.title}
                  </p>
                  <p className="text-ghost-subtle text-xs truncate">{product.subtitle}</p>
                  <p className="text-gold font-bold text-sm">
                    {formatPrice(product.price * quantity, product.currency)}
                  </p>
                </div>

                {/* Quantity + Remove */}
                <div className="flex flex-col items-end justify-between gap-2">
                  <button
                    onClick={() => removeItem(product.id)}
                    className="p-1 text-ghost-subtle hover:text-red-400 transition-colors"
                    aria-label="Eliminar producto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(product.id, quantity - 1)}
                      className="w-6 h-6 rounded-[6px] bg-white/5 border border-white/10 flex items-center justify-center
                                 hover:border-gold/30 hover:text-gold transition-all text-ghost-muted"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-ghost text-sm font-medium">
                      {quantity}
                    </span>
                    <button
                      onClick={() => updateQty(product.id, quantity + 1)}
                      className="w-6 h-6 rounded-[6px] bg-white/5 border border-white/10 flex items-center justify-center
                                 hover:border-gold/30 hover:text-gold transition-all text-ghost-muted"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer — Checkout */}
        {items.length > 0 && (
          <div className="px-6 py-5 border-t border-white/5 space-y-4">
            {/* Subtotal */}
            <div className="flex items-center justify-between">
              <span className="text-ghost-muted text-sm">Subtotal</span>
              <span className="font-heading font-bold text-ghost text-lg">
                {formattedSubtotal}
              </span>
            </div>
            <p className="text-ghost-subtle text-xs">
              Envío y descuentos calculados en el checkout
            </p>

            {/* CTA */}
            <Link
              href="/cart"
              onClick={closeCart}
              className="btn-primary w-full py-4 text-sm"
            >
              Ir al checkout
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={closeCart}
              className="btn-ghost w-full py-3 text-sm"
            >
              Seguir comprando
            </button>
          </div>
        )}
      </div>
    </>
  )
}
