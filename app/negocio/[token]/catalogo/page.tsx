'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Loader2,
  Camera,
  Trash2,
  Package,
  ImageOff,
  AlertCircle,
} from 'lucide-react'

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://nexum-api-trxr.onrender.com')

// Convierte una URL relativa (/uploads/...) del backend en absoluta.
function resolveImg(url?: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http')) return url
  return `${BACKEND_URL}${url}`
}

const CATEGORIES = ['General', 'Entradas', 'Platos fuertes', 'Bebidas', 'Postres', 'Combos', 'Promociones']

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  description: string
  price: number
  category: string
  imageUrl?: string
  isAvailable: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20'

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  token,
  product,
  onChanged,
  onDeleted,
}: {
  token: string
  product: Product
  onChanged: (p: Product) => void
  onDeleted: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadPhoto = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${product.id}/photo`, {
        method: 'POST',
        body: fd,
      })
      const json = (await res.json()) as { success: boolean; data?: Product }
      if (json.success && json.data) onChanged(json.data)
    } finally {
      setBusy(false)
    }
  }

  const toggleAvailable = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: !product.isAvailable }),
      })
      const json = (await res.json()) as { success: boolean; data?: Product }
      if (json.success && json.data) onChanged(json.data)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm(`¿Eliminar "${product.name}" del catálogo?`)) return
    setBusy(true)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${product.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success: boolean }
      if (json.success) onDeleted(product.id)
    } finally {
      setBusy(false)
    }
  }

  const img = resolveImg(product.imageUrl)

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden flex ${
      product.isAvailable ? 'border-slate-200' : 'border-slate-200 opacity-60'
    }`}>
      {/* Foto */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="relative w-24 h-24 shrink-0 bg-slate-100 flex items-center justify-center group"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <ImageOff className="w-6 h-6 text-slate-300" />
        )}
        <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera className="w-5 h-5 text-white" />
        </span>
        {busy && (
          <span className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void uploadPhoto(f)
          e.target.value = ''
        }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-slate-900 text-sm truncate">{product.name}</p>
            <p className="font-bold text-teal-700 text-sm shrink-0">{formatCOP(product.price)}</p>
          </div>
          <p className="text-xs text-slate-400">{product.category}</p>
          {product.description ? (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{product.description}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={toggleAvailable}
            disabled={busy}
            className={`text-xs font-semibold px-2 py-1 rounded-full ${
              product.isAvailable
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {product.isAvailable ? 'Disponible' : 'Agotado'}
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="text-slate-300 hover:text-red-500 transition-colors p-1"
            aria-label="Eliminar producto"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CatalogoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form de alta
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products`, { cache: 'no-store' })
      if (res.status === 404) {
        setError('Este negocio no existe en el servidor. Verifica tu enlace.')
        return
      }
      const json = (await res.json()) as { success: boolean; data?: Product[] }
      if (json.success && json.data) {
        setProducts(json.data)
        setError(null)
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const createProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    const priceNum = Number(price.replace(/[^\d]/g, ''))
    if (name.trim().length < 2) { setFormError('Escribe el nombre del producto.'); return }
    if (!(priceNum > 0)) { setFormError('Escribe un precio válido.'); return }
    setCreating(true)
    setFormError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          price: priceNum,
          category,
          description: description.trim() || undefined,
        }),
      })
      const json = (await res.json()) as { success: boolean; data?: Product; error?: string }
      if (!res.ok || !json.success || !json.data) {
        setFormError(json.error ?? 'No se pudo crear el producto.')
        return
      }
      setProducts((prev) => [...prev, json.data as Product])
      setName(''); setPrice(''); setDescription(''); setCategory(CATEGORIES[0])
    } catch {
      setFormError('No se pudo conectar con el servidor.')
    } finally {
      setCreating(false)
    }
  }

  const onChanged = (p: Product) => setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)))
  const onDeleted = (id: string) => setProducts((prev) => prev.filter((x) => x.id !== id))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href={`/negocio/${token}`} className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal-700 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">Mi catálogo</p>
              <p className="text-xs text-slate-400">Productos que verá el cliente</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Alta */}
        <form onSubmit={createProduct} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-teal-600" />
            Agregar producto
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={INPUT} placeholder="Nombre (ej: Hamburguesa clásica)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <input className={INPUT} placeholder="Precio (ej: 18000)" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" maxLength={12} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select className={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className={INPUT} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} />
          </div>
          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}
          <button
            type="submit"
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Agregar al catálogo
          </button>
          <p className="text-xs text-slate-400 text-center">La foto se agrega después, tocando la imagen del producto.</p>
        </form>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 text-teal-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white border border-red-100 rounded-2xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-medium text-slate-600">Tu catálogo está vacío</p>
            <p className="text-slate-400 text-sm mt-1">Agrega tu primer producto arriba. Aparecerá en la app del cliente.</p>
          </div>
        ) : (
          <section className="space-y-3">
            <h2 className="font-semibold text-slate-900 text-sm">
              {products.length} producto{products.length !== 1 ? 's' : ''}
            </h2>
            <div className="space-y-3">
              {products.map((p) => (
                <ProductCard key={p.id} token={token} product={p} onChanged={onChanged} onDeleted={onDeleted} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
