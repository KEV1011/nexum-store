'use client'

import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'
import { type Product, formatPrice } from '@/lib/mockData'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CartItem = {
  product:  Product
  quantity: number
}

type CartState = {
  items:     CartItem[]
  isOpen:    boolean
  itemCount: number
  subtotal:  number
}

type CartAction =
  | { type: 'ADD_ITEM';    product: Product; quantity?: number }
  | { type: 'REMOVE_ITEM'; productId: string }
  | { type: 'UPDATE_QTY';  productId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'OPEN_CART' }
  | { type: 'CLOSE_CART' }
  | { type: 'HYDRATE'; items: CartItem[] }

type CartContextValue = CartState & {
  addItem:    (product: Product, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQty:  (productId: string, quantity: number) => void
  clearCart:  () => void
  openCart:   () => void
  closeCart:  () => void
  formattedSubtotal: string
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function computeDerived(items: CartItem[]) {
  return {
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotal:  items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
  }
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const qty      = action.quantity ?? 1
      const existing = state.items.find(i => i.product.id === action.product.id)
      const items    = existing
        ? state.items.map(i =>
            i.product.id === action.product.id
              ? { ...i, quantity: i.quantity + qty }
              : i
          )
        : [...state.items, { product: action.product, quantity: qty }]
      return { ...state, items, ...computeDerived(items), isOpen: true }
    }
    case 'REMOVE_ITEM': {
      const items = state.items.filter(i => i.product.id !== action.productId)
      return { ...state, items, ...computeDerived(items) }
    }
    case 'UPDATE_QTY': {
      const items = action.quantity <= 0
        ? state.items.filter(i => i.product.id !== action.productId)
        : state.items.map(i =>
            i.product.id === action.productId
              ? { ...i, quantity: action.quantity }
              : i
          )
      return { ...state, items, ...computeDerived(items) }
    }
    case 'CLEAR':
      return { ...state, items: [], itemCount: 0, subtotal: 0 }
    case 'OPEN_CART':
      return { ...state, isOpen: true }
    case 'CLOSE_CART':
      return { ...state, isOpen: false }
    case 'HYDRATE':
      return { ...state, items: action.items, ...computeDerived(action.items) }
    default:
      return state
  }
}

const INITIAL_STATE: CartState = {
  items:     [],
  isOpen:    false,
  itemCount: 0,
  subtotal:  0,
}

// ── Context ───────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, INITIAL_STATE)

  // Persistencia en localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexum-cart')
      if (saved) {
        const items = JSON.parse(saved) as CartItem[]
        dispatch({ type: 'HYDRATE', items })
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('nexum-cart', JSON.stringify(state.items))
    } catch {}
  }, [state.items])

  const value: CartContextValue = {
    ...state,
    formattedSubtotal: formatPrice(state.subtotal),
    addItem:    (product, quantity) => dispatch({ type: 'ADD_ITEM', product, quantity }),
    removeItem: (productId)         => dispatch({ type: 'REMOVE_ITEM', productId }),
    updateQty:  (productId, quantity) => dispatch({ type: 'UPDATE_QTY', productId, quantity }),
    clearCart:  ()                  => dispatch({ type: 'CLEAR' }),
    openCart:   ()                  => dispatch({ type: 'OPEN_CART' }),
    closeCart:  ()                  => dispatch({ type: 'CLOSE_CART' }),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>')
  return ctx
}
