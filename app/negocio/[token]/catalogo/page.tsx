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
  ImagePlus,
  Pencil,
  Check,
  X,
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

// Sugerencias por defecto; el dueño puede escribir SUS propias secciones.
const CATEGORIES = ['General', 'Entradas', 'Platos fuertes', 'Bebidas', 'Postres', 'Combos', 'Promociones']

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductPhoto {
  id: string
  url: string
}

interface Product {
  id: string
  name: string
  description: string
  price: number
  category: string
  imageUrl?: string
  isAvailable: boolean
  images: ProductPhoto[]
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
  const [editing, setEditing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // Campos de edición inline
  const [eName, setEName] = useState(product.name)
  const [ePrice, setEPrice] = useState(String(product.price))
  const [eCategory, setECategory] = useState(product.category)
  const [eDescription, setEDescription] = useState(product.description)

  const patch = async (body: Partial<Product>) => {
    setBusy(true)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; data?: Product }
      if (json.success && json.data) onChanged(json.data)
      return json.success
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async () => {
    const priceNum = Number(ePrice.replace(/[^\d]/g, ''))
    if (eName.trim().length < 2 || !(priceNum > 0)) return
    const ok = await patch({
      name: eName.trim(),
      price: priceNum,
      category: eCategory.trim() || 'General',
      description: eDescription.trim(),
    })
    if (ok) setEditing(false)
  }

  const uploadPhoto = async (file: File, gallery: boolean) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const path = gallery
        ? `${BACKEND_URL}/business/${token}/products/${product.id}/gallery`
        : `${BACKEND_URL}/business/${token}/products/${product.id}/photo`
      const res = await fetch(path, { method: 'POST', body: fd })
      const json = (await res.json()) as { success: boolean; data?: Product }
      if (json.success && json.data) onChanged(json.data)
    } finally {
      setBusy(false)
    }
  }

  const removeGalleryPhoto = async (photoId: string) => {
    setBusy(true)
    try {
      const res = await fetch(
        `${BACKEND_URL}/business/${token}/products/${product.id}/gallery/${photoId}`,
        { method: 'DELETE' },
      )
      const json = (await res.json()) as { success: boolean; data?: Product }
      if (json.success && json.data) onChanged(json.data)
    } finally {
      setBusy(false)
    }
  }

  const toggleAvailable = () => void patch({ isAvailable: !product.isAvailable })

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
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden ${
      product.isAvailable ? 'border-slate-200' : 'border-slate-200 opacity-60'
    }`}>
      <div className="flex">
        {/* Foto de portada del producto */}
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
            if (f) void uploadPhoto(f, false)
            e.target.value = ''
          }}
        />

        {/* Info / edición */}
        <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
          {editing ? (
            <div className="space-y-2">
              <input className={INPUT} value={eName} onChange={(e) => setEName(e.target.value)} maxLength={80} placeholder="Nombre" />
              <div className="grid grid-cols-2 gap-2">
                <input className={INPUT} value={ePrice} onChange={(e) => setEPrice(e.target.value)} inputMode="numeric" maxLength={12} placeholder="Precio" />
                <input className={INPUT} list="cat-list" value={eCategory} onChange={(e) => setECategory(e.target.value)} maxLength={40} placeholder="Sección" />
              </div>
              <input className={INPUT} value={eDescription} onChange={(e) => setEDescription(e.target.value)} maxLength={140} placeholder="Descripción" />
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
                  <Check className="w-3.5 h-3.5" /> Guardar
                </button>
                <button onClick={() => { setEditing(false); setEName(product.name); setEPrice(String(product.price)); setECategory(product.category); setEDescription(product.description) }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <>
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
                    product.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {product.isAvailable ? 'Disponible' : 'Agotado'}
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(true)} disabled={busy} className="text-slate-300 hover:text-teal-600 transition-colors p-1" aria-label="Editar producto">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={remove} disabled={busy} className="text-slate-300 hover:text-red-500 transition-colors p-1" aria-label="Eliminar producto">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Galería de fotos adicionales */}
      <div className="flex items-center gap-2 px-3 pb-3 pt-1 overflow-x-auto">
        {product.images.map((ph) => (
          <div key={ph.id} className="relative w-14 h-14 shrink-0 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveImg(ph.url)} alt="" className="w-14 h-14 object-cover rounded-lg border border-slate-200" />
            <button
              onClick={() => void removeGalleryPhoto(ph.id)}
              disabled={busy}
              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600"
              aria-label="Quitar foto"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => galleryRef.current?.click()}
          disabled={busy}
          className="w-14 h-14 shrink-0 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-teal-500 hover:text-teal-600"
          aria-label="Agregar foto a la galería"
        >
          <ImagePlus className="w-4 h-4" />
          <span className="text-[9px] font-medium">Foto</span>
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void uploadPhoto(f, true)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

// ─── Cover (foto de portada del local) ────────────────────────────────────────

function CoverSection({ token }: { token: string }) {
  const [cover, setCover] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/business/${token}/info`, { cache: 'no-store' })
        const json = (await res.json()) as { success: boolean; data?: { imageUrl?: string } }
        if (alive && json.success) setCover(json.data?.imageUrl ?? null)
      } catch {
        // sin conexión: se muestra el placeholder
      }
    })()
    return () => {
      alive = false
    }
  }, [token])

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${BACKEND_URL}/business/${token}/cover`, { method: 'POST', body: fd })
      const json = (await res.json()) as { success: boolean; data?: { imageUrl?: string } }
      if (json.success && json.data?.imageUrl) setCover(json.data.imageUrl)
    } finally {
      setBusy(false)
    }
  }

  const img = resolveImg(cover ?? undefined)

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="relative w-full h-36 bg-slate-100 group block"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="Portada del local" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1">
            <ImagePlus className="w-7 h-7" />
            <span className="text-xs font-medium">Agrega la foto de portada de tu local</span>
          </div>
        )}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 bg-black/60 text-white text-xs font-semibold rounded-lg px-2.5 py-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {img ? 'Cambiar portada' : 'Subir portada'}
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
          e.target.value = ''
        }}
      />
    </section>
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

  // Secciones = categorías por defecto + las que el dueño ya usó (sin repetir).
  const allCategories = Array.from(
    new Set([...CATEGORIES, ...products.map((p) => p.category)]),
  )

  // Agrupa los productos por sección para mostrarlos como un menú real.
  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p)
    return acc
  }, {})
  const sectionNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'es'))

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
        {/* Portada del local */}
        <CoverSection token={token} />

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
            <input
              className={INPUT}
              list="cat-list"
              placeholder="Sección (ej: Bebidas, Combos…)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={40}
            />
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
          <div className="space-y-6">
            <p className="text-sm text-slate-500">
              {products.length} producto{products.length !== 1 ? 's' : ''} en {sectionNames.length} secci{sectionNames.length !== 1 ? 'ones' : 'ón'}
            </p>
            {sectionNames.map((section) => (
              <section key={section} className="space-y-3">
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span className="w-1.5 h-4 rounded-full bg-teal-600" />
                  {section}
                  <span className="text-xs font-normal text-slate-400">({grouped[section].length})</span>
                </h2>
                <div className="space-y-3">
                  {grouped[section].map((p) => (
                    <ProductCard
                      key={p.id}
                      token={token}
                      product={p}
                      onChanged={onChanged}
                      onDeleted={onDeleted}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Secciones sugeridas (datalist compartido por el alta y la edición) */}
      <datalist id="cat-list">
        {allCategories.map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
  )
}
