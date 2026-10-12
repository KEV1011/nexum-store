'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import { BarcodeScanner } from './BarcodeScanner'
import { CartaFoto } from './CartaFoto'
import { CsvImport } from './CsvImport'
import { PortalTabs } from '../PortalTabs'
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
  ChevronUp,
  ChevronDown,
  Check,
  X,
  AlertTriangle,
  Layers,
} from 'lucide-react'

import { formatCOP } from '../../../moneda'
import { etiquetaDeGrupo } from '../../../opciones-texto'
import { AdicionesManager } from './AdicionesManager'
import { CONTENEDOR, TARJETA } from '../../../ui'
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
import { MarcaDelLocal } from './MarcaDelLocal'
import { perfilDe } from '../../perfil-catalogo'
const CATEGORIES = ['General', 'Entradas', 'Platos fuertes', 'Bebidas', 'Postres', 'Combos', 'Promociones']

/** Unidades de venta para negocios que manejan inventario. */
const UNIDADES = ['unidad', 'kg', 'g', 'libra', 'litro', 'ml', 'paquete'] as const

/**
 * Los negocios con inventario (tienda de mercancía, supermercado, farmacia)
 * necesitan código de barras y existencias; un restaurante no — ahí esos
 * campos solo estorban.
 *
 * Es una lista de los que SÍ y no una excepción para el restaurante: si fuera
 * al revés, cada categoría nueva heredaría el formulario con inventario sin
 * que nadie lo decidiera.
 */
// La lista de categorías con inventario y el helper que la leía se
// retiraron: ahora lo decide `perfilDe()` en `app/negocio/perfil-catalogo.ts`,
// que además dice qué OTRAS herramientas tienen sentido. Con dos fuentes
// decidiendo lo mismo, la carta por foto acabaría otra vez en el cajón del
// inventario — que es el defecto que esto corrige.

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductPhoto {
  id: string
  url: string
}

interface ProductOption {
  id?: string
  name: string
  priceDelta: number
  isAvailable?: boolean
}

interface OptionGroup {
  id?: string
  name: string
  required: boolean
  minSelect: number
  maxSelect: number
  /** La frase que redacta el SERVIDOR. Solo llega al cargar. */
  label?: string
  /** En cuántos platos se usa. Solo lo trae la biblioteca. */
  usedBy?: number
  options: ProductOption[]
}

interface Product {
  barcode?: string
  sku?: string
  stock?: number
  unit?: string
  brand?: string
  id: string
  name: string
  description: string
  price: number
  /** Lo que DEVUELVE el servidor (ya saneado). Al enviar se manda texto o null:
   *  el backend es quien decide si «$30.000» es válido, no el formulario. */
  compareAtPrice?: number
  promoUntil?: string
  descuentoPct?: number
  category: string
  imageUrl?: string
  isAvailable: boolean
  suggestAsAddon?: boolean
  /** Posición en la carta. El cliente la ve en este orden. */
  sortOrder: number
  images: ProductPhoto[]
  optionGroups: OptionGroup[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * El orden de la carta: por `sortOrder` y, a igualdad, por nombre.
 *
 * Es el MISMO criterio que aplica el backend al servirle el menú al cliente
 * (`orderBy: [{ sortOrder }, { name }]`). Si los dos lados ordenaran distinto,
 * el dueño movería un plato en el portal y en la app seguiría donde estaba.
 */
function ordenarCarta(lista: Product[]): Product[] {
  return [...lista].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'es'),
  )
}

/**
 * Devuelve la carta con un plato movido un puesto dentro de su sección, ya
 * renumerada. `null` si no hay a dónde moverlo.
 *
 * Se renumera ENTERA con paso 10 en vez de intercambiar dos valores: un
 * catálogo que nunca se ordenó tiene todos los productos en cero, y cambiar
 * dos ceros por otros dos ceros no movería nada. Renumerar cuesta una sola
 * petición y deja hueco entre platos para insertar después.
 *
 * Se trabaja por secciones, no sobre la lista plana, porque dos platos de la
 * misma sección pueden tener `sortOrder` no consecutivos (con otra sección en
 * medio) y entonces "el de al lado" en la lista no es el de al lado en
 * pantalla. Al aplanar por secciones el orden guardado coincide con el que el
 * dueño está viendo.
 */
function cartaMovida(
  lista: Product[],
  productId: string,
  direccion: -1 | 1,
): Product[] | null {
  const ordenada = ordenarCarta(lista)
  // Secciones en orden de aparición de su primer plato.
  const secciones: string[] = []
  const porSeccion = new Map<string, Product[]>()
  for (const p of ordenada) {
    if (!porSeccion.has(p.category)) {
      secciones.push(p.category)
      porSeccion.set(p.category, [])
    }
    porSeccion.get(p.category)!.push(p)
  }

  const objetivo = ordenada.find((p) => p.id === productId)
  if (!objetivo) return null
  const grupo = porSeccion.get(objetivo.category)!
  const i = grupo.findIndex((p) => p.id === productId)
  const destino = i + direccion
  if (destino < 0 || destino >= grupo.length) return null
  ;[grupo[i], grupo[destino]] = [grupo[destino]!, grupo[i]!]

  return secciones
    .flatMap((c) => porSeccion.get(c)!)
    .map((p, k) => ({ ...p, sortOrder: (k + 1) * 10 }))
}

const INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20'

// ─── Editor de variantes / opciones ──────────────────────────────────────────

function OptionsEditor({
  token,
  product,
  onChanged,
  onClose,
}: {
  token: string
  product: Product
  onChanged: (p: Product) => void
  onClose: () => void
}) {
  const [groups, setGroups] = useState<OptionGroup[]>(
    () => JSON.parse(JSON.stringify(product.optionGroups ?? [])) as OptionGroup[],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // La biblioteca del negocio, para ADJUNTAR en vez de volver a escribir.
  const [biblioteca, setBiblioteca] = useState<OptionGroup[]>([])

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/business/${token}/option-groups`)
        const json = (await res.json()) as { success: boolean; data?: OptionGroup[] }
        if (vivo && json.success && json.data) setBiblioteca(json.data)
      } catch { /* sin biblioteca el editor sigue sirviendo para crear */ }
    })()
    return () => { vivo = false }
  }, [token])

  // Solo se ofrecen los que este plato NO tiene ya: volver a adjuntar el mismo
  // grupo lo duplicaría en la carta.
  const puestos = new Set(groups.map((g) => g.id).filter(Boolean))
  const disponibles = biblioteca.filter((g) => !puestos.has(g.id))

  const addGroup = () =>
    setGroups((g) => [...g, { name: '', required: false, minSelect: 0, maxSelect: 1, options: [{ name: '', priceDelta: 0 }] }])
  const removeGroup = (gi: number) => setGroups((g) => g.filter((_, i) => i !== gi))
  const patchGroup = (gi: number, patch: Partial<OptionGroup>) =>
    setGroups((g) => g.map((grp, i) => (i === gi ? { ...grp, ...patch } : grp)))
  const addOption = (gi: number) =>
    setGroups((g) => g.map((grp, i) => (i === gi ? { ...grp, options: [...grp.options, { name: '', priceDelta: 0 }] } : grp)))
  const removeOption = (gi: number, oi: number) =>
    setGroups((g) => g.map((grp, i) => (i === gi ? { ...grp, options: grp.options.filter((_, j) => j !== oi) } : grp)))
  const patchOption = (gi: number, oi: number, patch: Partial<ProductOption>) =>
    setGroups((g) => g.map((grp, i) => (i === gi ? { ...grp, options: grp.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : grp)))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${product.id}/options`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      })
      const json = (await res.json()) as { success: boolean; data?: Product; error?: string }
      if (json.success && json.data) {
        onChanged(json.data)
        onClose()
      } else {
        // Antes el fallo se tragaba entero: el dueño pulsaba «Guardar
        // opciones», no pasaba nada y no sabía por qué. El motivo lo redacta
        // el backend en español.
        setError(json.error ?? 'No se pudieron guardar las opciones.')
      }
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-600">
        Variantes y opciones (ej: Tamaño, Adiciones, Quitar)
      </p>

      {groups.map((g, gi) => (
        <div key={gi} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <input
              className={INPUT}
              placeholder="Nombre del grupo (ej: Tamaño)"
              value={g.name}
              onChange={(e) => patchGroup(gi, { name: e.target.value })}
              maxLength={40}
            />
            <button onClick={() => removeGroup(gi)} className="text-slate-300 hover:text-red-500 p-1" aria-label="Quitar grupo">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={g.required || g.minSelect > 0}
                onChange={(e) => patchGroup(gi, {
                  required: e.target.checked,
                  minSelect: e.target.checked ? Math.max(1, g.minSelect) : 0,
                })}
              />
              Obligatorio
            </label>
            {/* Números y no una casilla «selección múltiple». Esa casilla
                ponía el máximo igual al número de opciones, así que «puedes
                elegir hasta 10» no se podía expresar y «al menos 2 salsas»
                tampoco. */}
            <label className="inline-flex items-center gap-1.5">
              Mínimo
              <input
                className={`${INPUT} w-14`}
                inputMode="numeric"
                value={String(g.minSelect)}
                onChange={(e) => patchGroup(gi, {
                  minSelect: Number(e.target.value.replace(/[^\d]/g, '') || 0),
                })}
                maxLength={2}
              />
            </label>
            <label className="inline-flex items-center gap-1.5">
              Máximo
              <input
                className={`${INPUT} w-14`}
                inputMode="numeric"
                value={String(g.maxSelect)}
                onChange={(e) => patchGroup(gi, {
                  maxSelect: Number(e.target.value.replace(/[^\d]/g, '') || 1),
                })}
                maxLength={2}
              />
            </label>
            {/* Lo que va a leer el cliente, con la MISMA función que usa el
                servidor para redactarlo. */}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
              {etiquetaDeGrupo(g)}
            </span>
          </div>
          {(g.usedBy ?? 0) > 1 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Este grupo lo usan {g.usedBy} platos. Si lo cambias aquí, cambia en todos.
            </p>
          )}
          {g.options.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                className={INPUT}
                placeholder="Opción (ej: Grande)"
                value={o.name}
                onChange={(e) => patchOption(gi, oi, { name: e.target.value })}
                maxLength={40}
              />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-slate-400">+$</span>
                <input
                  className={`${INPUT} w-24`}
                  inputMode="numeric"
                  placeholder="0"
                  value={o.priceDelta ? String(o.priceDelta) : ''}
                  onChange={(e) => patchOption(gi, oi, { priceDelta: Number(e.target.value.replace(/[^\d]/g, '')) })}
                  maxLength={9}
                />
              </div>
              <button onClick={() => removeOption(gi, oi)} className="text-slate-300 hover:text-red-500 p-1" aria-label="Quitar opción">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button onClick={() => addOption(gi)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Agregar opción
          </button>
        </div>
      ))}

      {disponibles.length > 0 && (
        <label className="block text-xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-emerald-600" /> Usar una adición que ya creaste
          </span>
          <select
            className={`${INPUT} mt-1`}
            value=""
            onChange={(e) => {
              const g = disponibles.find((x) => x.id === e.target.value)
              if (g) setGroups((prev) => [...prev, JSON.parse(JSON.stringify(g)) as OptionGroup])
            }}
          >
            <option value="">Elegir de la biblioteca…</option>
            {disponibles.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} · {g.options.length} opciones
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <button onClick={addGroup} className="w-full rounded-lg border-2 border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-500 hover:border-emerald-500 hover:text-emerald-600 inline-flex items-center justify-center gap-1">
        <Plus className="w-4 h-4" /> Crear un grupo nuevo
      </button>

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Guardar opciones
        </button>
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          Cerrar
        </button>
      </div>
    </div>
  )
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  token,
  product,
  onChanged,
  onDeleted,
  onSubir,
  onBajar,
}: {
  token: string
  product: Product
  onChanged: (p: Product) => void
  onDeleted: (id: string) => void
  /** null cuando ya es el primero de su sección. */
  onSubir: (() => void) | null
  /** null cuando ya es el último. */
  onBajar: (() => void) | null
}) {
  const [busy, setBusy] = useState(false)
  // La foto que no carga: se recuerda para dejar el respaldo en su sitio.
  const [fotoCaida, setFotoCaida] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const optionCount = (product.optionGroups ?? []).length

  // Campos de edición inline
  const [eName, setEName] = useState(product.name)
  const [ePrice, setEPrice] = useState(String(product.price))
  const [eAntes, setEAntes] = useState(product.compareAtPrice ? String(product.compareAtPrice) : '')
  // `datetime-local` quiere «AAAA-MM-DDTHH:mm» y el servidor manda ISO con zona.
  const [eHasta, setEHasta] = useState(product.promoUntil ? product.promoUntil.slice(0, 16) : '')
  // El backend RECHAZA un «antes» al revés o increíble, y su mensaje explica
  // cuál de las dos cosas pasó. Tragárselo dejaría al dueño reintentando.
  const [eError, setEError] = useState<string | null>(null)
  const [eCategory, setECategory] = useState(product.category)
  const [eDescription, setEDescription] = useState(product.description)

  type CuerpoPatch = Omit<Partial<Product>, 'compareAtPrice' | 'promoUntil'> & {
    compareAtPrice?: string | number | null
    promoUntil?: string | null
  }

  const patch = async (body: CuerpoPatch) => {
    setBusy(true)
    setEError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; data?: Product; error?: string }
      if (json.success && json.data) onChanged(json.data)
      else setEError(json.error ?? 'No se pudo guardar.')
      return json.success
    } finally {
      setBusy(false)
    }
  }

  /// Alias tipado para el guardado que sí manda el «antes» como texto.
  const patchConAntes = (body: CuerpoPatch) => patch(body)

  const saveEdit = async () => {
    const priceNum = Number(ePrice.replace(/[^\d]/g, ''))
    if (eName.trim().length < 2 || !(priceNum > 0)) return
    const ok = await patchConAntes({
      name: eName.trim(),
      price: priceNum,
      // Vacío = quitar el descuento. Se manda siempre para que borrarlo
      // funcione, no solo ponerlo.
      compareAtPrice: eAntes.trim() === '' ? null : eAntes.trim(),
      promoUntil: eHasta.trim() === '' ? null : new Date(eHasta).toISOString(),
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
  // «Acompaña tu pedido»: sigue siendo un producto normal —descuenta
  // existencias y cuenta en el reporte—, solo que además se le propone al
  // cliente antes de cerrar el carrito.
  const toggleAddon = () => void patch({ suggestAsAddon: !product.suggestAsAddon })

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

  const img = fotoCaida ? null : resolveImg(product.imageUrl)

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
            // `onError` retira la foto caída y deja el respaldo de abajo. Sin
            // esto salía el icono de imagen rota del navegador, que se lee
            // como «el portal está roto» y no como «falta la foto» — y pasa de
            // verdad mientras las fotos vivan en el disco efímero del
            // servidor, que las borra en cada despliegue.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={() => setFotoCaida(true)}
            />
          ) : (
            <ImageOff className="w-6 h-6 text-slate-300" />
          )}
          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </span>
          {busy && (
            <span className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
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
                <input className={INPUT} value={eAntes} onChange={(e) => setEAntes(e.target.value)} inputMode="numeric" maxLength={12} placeholder="Precio normal (sin promoción)" title="El precio de siempre. Se muestra tachado junto al % de descuento." />
                <input className={INPUT} type="datetime-local" value={eHasta} onChange={(e) => setEHasta(e.target.value)} title="Hasta cuándo dura la promoción. Vacío = sin fecha de fin." />
                <input className={INPUT} list="cat-list" value={eCategory} onChange={(e) => setECategory(e.target.value)} maxLength={40} placeholder="Sección" />
              </div>
              <input className={INPUT} value={eDescription} onChange={(e) => setEDescription(e.target.value)} maxLength={140} placeholder="Descripción" />
              {eError && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-2 py-1.5 text-[11px] text-red-700">{eError}</p>
              )}
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                  <Check className="w-3.5 h-3.5" /> Guardar
                </button>
                <button onClick={() => { setEditing(false); setEError(null); setEName(product.name); setEPrice(String(product.price)); setEAntes(product.compareAtPrice ? String(product.compareAtPrice) : ''); setEHasta(product.promoUntil ? product.promoUntil.slice(0, 16) : ''); setECategory(product.category); setEDescription(product.description) }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900 text-sm truncate">{product.name}</p>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-emerald-700 text-sm">{formatCOP(product.price)}</p>
                    {/* El dueño ve exactamente lo que ve su cliente: si el
                        tachado quedó raro, se da cuenta aquí y no en una queja. */}
                    {product.descuentoPct != null && product.compareAtPrice != null && (
                      <p className="flex items-center justify-end gap-1 text-[11px]">
                        <span className="rounded bg-red-600 px-1 py-px font-bold text-white">-{product.descuentoPct} %</span>
                        <span className="text-slate-400 line-through">{formatCOP(product.compareAtPrice)}</span>
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {product.brand ? `${product.brand} · ` : ''}{product.category}
                  {product.unit && product.unit !== 'unidad' ? ` · por ${product.unit}` : ''}
                </p>
                {product.description ? (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{product.description}</p>
                ) : null}
                {/* Existencias y código: solo aparecen si el negocio los usa. */}
                {product.stock !== undefined || product.barcode ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {product.stock !== undefined ? (
                      <span
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          product.stock === 0
                            ? 'bg-red-50 text-red-600'
                            : product.stock <= 5
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {product.stock === 0 ? 'Sin existencias' : `${product.stock} en stock`}
                      </span>
                    ) : null}
                    {product.barcode ? (
                      <span className="text-[11px] font-mono text-slate-400">
                        {product.barcode}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {/* `flex-wrap`: son SEIS controles y la tarjeta ya cede 96 px a la
                  foto. A 360 px no caben en una fila y el último —Eliminar— se
                  salía por el borde derecho, que es lo que el dueño veía
                  cortado en su celular. Envolver es la salida honesta:
                  encogerlos más es como se llegó aquí. */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-y-2">
                <button
                  onClick={toggleAvailable}
                  disabled={busy}
                  className={`min-h-[36px] text-xs font-semibold px-3 rounded-full ${
                    product.isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {product.isAvailable ? 'Disponible' : 'Agotado'}
                </button>
                <button
                  onClick={toggleAddon}
                  disabled={busy}
                  title="Se ofrece al cliente antes de pagar, como una línea más del pedido"
                  className={`min-h-[36px] rounded-full px-3 text-xs font-semibold ${
                    product.suggestAsAddon
                      ? 'bg-amber-50 text-amber-800'
                      : 'text-slate-400 hover:text-amber-700'
                  }`}
                >
                  Acompañamiento
                </button>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setShowOptions((v) => !v)}
                    disabled={busy}
                    className={`min-h-[36px] text-xs font-semibold px-3 rounded-full ${
                      optionCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:text-emerald-600'
                    }`}
                  >
                    Opciones{optionCount > 0 ? ` (${optionCount})` : ''}
                  </button>
                  {/* Orden de la carta: entradas antes que postres. Se mueve
                      dentro de la sección; el orden entre secciones lo marca
                      su primer plato. */}
                  <button
                    onClick={() => onSubir?.()}
                    disabled={busy || !onSubir}
                    className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                    aria-label="Subir en la carta"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onBajar?.()}
                    disabled={busy || !onBajar}
                    className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                    aria-label="Bajar en la carta"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditing(true)} disabled={busy} className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:text-emerald-600 transition-colors" aria-label="Editar producto">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={remove} disabled={busy} className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:text-red-500 transition-colors" aria-label="Eliminar producto">
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
          className="w-14 h-14 shrink-0 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-emerald-500 hover:text-emerald-600"
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

      {/* Editor de variantes/opciones (expandible) */}
      {showOptions && (
        <OptionsEditor
          token={token}
          product={product}
          onChanged={onChanged}
          onClose={() => setShowOptions(false)}
        />
      )}
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
    <section className={`${TARJETA} overflow-hidden`}>
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
  // Inventario (solo visible en supermercado/farmacia/otro)
  const [barcode, setBarcode] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [warranty, setWarranty] = useState('')
  const [unit, setUnit] = useState<string>(UNIDADES[0])
  const [stock, setStock] = useState('')
  // Categoría del negocio: decide qué campos se muestran.
  const [bizCategory, setBizCategory] = useState<string | undefined>(undefined)
  // Todo lo que este local necesita ver, decidido en un solo sitio.
  const perfil = perfilDe(bizCategory)
  const [escaneando, setEscaneando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [seccionFiltro, setSeccionFiltro] = useState('todas')
  const [soloAgotados, setSoloAgotados] = useState(false)
  const [avisoEscaner, setAvisoEscaner] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<string | null>(null)

  /**
   * Un código leído. Si el negocio YA tiene ese producto se sube su ficha al
   * formulario para ajustar precio o sumar existencias — reponer es el caso
   * frecuente en un supermercado, no dar de alta. Si no lo tiene, se rellena el
   * código y queda listo para crearlo.
   */
  const onCodigoLeido = useCallback(async (code: string) => {
    setBarcode(code)
    setGuardado(null)
    try {
      const res = await fetch(
        `${BACKEND_URL}/business/${token}/products/barcode/${encodeURIComponent(code)}`,
        { cache: 'no-store' },
      )
      const json = (await res.json()) as {
        success: boolean
        data?: Product | null
        sugerencia?: { name: string; brand?: string; unit?: string; comercios: number } | null
      }
      const existente = json.success ? json.data : null
      if (existente) {
        // Reponer: se trae lo que ya estaba para no volver a teclearlo.
        setName(existente.name)
        setPrice(String(existente.price))
        setCategory(existente.category)
        setBrand(existente.brand ?? '')
        setUnit(existente.unit ?? UNIDADES[0])
        setStock(existente.stock !== undefined ? String(existente.stock) : '')
        setAvisoEscaner(
          `Ya tienes "${existente.name}". Ajusta el precio o las existencias y guarda para actualizarlo.`,
        )
        return
      }
      const s = json.success ? json.sugerencia : null
      if (s) {
        // El nombre lo PROPONE la plataforma a partir de cómo lo tienen otros
        // comercios. El precio no: lo pone cada tienda, y proponer el de otra
        // dejaría vendiendo al precio ajeno con un «Guardar» distraído.
        setName(s.name)
        if (s.brand) setBrand(s.brand)
        if (s.unit) setUnit(s.unit)
        setPrice('')
        setAvisoEscaner(
          `Propuesta: "${s.name}" — así lo tienen ${s.comercios === 1 ? 'otro comercio' : `${s.comercios} comercios`}. `
          + 'Revisa el nombre y escribe TU precio.',
        )
      } else {
        setAvisoEscaner('Producto nuevo: completa el nombre y el precio.')
      }
    } catch {
      setAvisoEscaner('Código capturado. No se pudo consultar el catálogo, complétalo a mano.')
    }
  }, [token])
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

  // El tipo de negocio decide el formulario: un restaurante no ve código de
  // barras ni existencias, un supermercado sí.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/business/${token}/info`, { cache: 'no-store' })
        const json = (await res.json()) as { success: boolean; data?: { category?: string } }
        if (json.success) setBizCategory(json.data?.category)
      } catch {
        // Sin la categoría se muestra el formulario básico: nunca bloquea.
      }
    })()
  }, [token])

  /**
   * Crea el producto con lo que haya en el formulario y devuelve el motivo si
   * no se pudo, o `null` si quedó guardado.
   *
   * Está separado del `submit` porque el mismo alta se dispara desde DENTRO de
   * la cámara («Guardar y seguir»): un segundo camino de escritura acabaría
   * mandando campos distintos que el de aquí, que es el defecto que ya se pagó
   * con el formateador de moneda en diecisiete copias.
   */
  const guardarProducto = async (): Promise<string | null> => {
    const priceNum = Number(price.replace(/[^\d]/g, ''))
    if (name.trim().length < 2) return 'Escribe el nombre del producto.'
    if (!(priceNum > 0)) return 'Escribe un precio válido.'
    setCreating(true)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          price: priceNum,
          category,
          description: description.trim() || undefined,
          // La ficha se manda según el perfil, no según el inventario: son
          // dos cosas distintas y antes iban juntas.
          ...(perfil.marca !== 'ninguno' && { brand: brand.trim() || undefined }),
          ...(perfil.marca === 'marca-modelo-garantia' && {
            model: model.trim() || undefined,
            warrantyMonths: warranty.trim() === '' ? null : Number(warranty),
          }),
          ...(perfil.existencias && {
            barcode: barcode.trim() || undefined,
            unit,
            // Vacío = el negocio no controla existencias de este producto.
            stock: stock.trim() === '' ? null : Number(stock.replace(/[^\d]/g, '')),
          }),
        }),
      })
      const json = (await res.json()) as { success: boolean; data?: Product; error?: string }
      if (!res.ok || !json.success || !json.data) {
        return json.error ?? 'No se pudo crear el producto.'
      }
      setProducts((prev) => [...prev, json.data as Product])
      setName(''); setPrice(''); setDescription(''); setCategory(CATEGORIES[0])
      setBarcode(''); setBrand(''); setStock(''); setModel(''); setWarranty('')
      return null
    } catch {
      return 'No se pudo conectar con el servidor.'
    } finally {
      setCreating(false)
    }
  }

  const createProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const motivo = await guardarProducto()
    setFormError(motivo)
  }

  /**
   * «Guardar y seguir» desde dentro de la cámara: el producto queda creado y el
   * escáner NO se cierra, para pasar al siguiente de la estantería. Sin esto el
   * dueño tenía que cerrar la cámara, bajar al formulario, guardar y volver a
   * abrirla por cada producto.
   */
  const guardarYSeguir = async () => {
    setFormError(null)
    setGuardado(null)
    const nombre = name.trim()
    const motivo = await guardarProducto()
    if (motivo) { setFormError(motivo); return }
    setAvisoEscaner(null)
    setGuardado(`"${nombre}" quedó en tu catálogo. Escanea el siguiente.`)
  }

  const onChanged = (p: Product) => setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)))
  const onDeleted = (id: string) => setProducts((prev) => prev.filter((x) => x.id !== id))

  /**
   * Mueve un plato dentro de su sección y guarda el orden nuevo.
   *
   * Se renumera la carta ENTERA con paso 10 en vez de intercambiar dos valores:
   * un catálogo que nunca se ordenó tiene todos los productos en cero, y
   * cambiar dos ceros por otros dos ceros no movería nada. Renumerar cuesta
   * una sola petición y deja hueco entre platos para las inserciones futuras.
   */
  const mover = async (productId: string, direccion: -1 | 1) => {
    const nuevo = cartaMovida(products, productId, direccion)
    if (!nuevo) return
    const order = nuevo.map((p) => ({ id: p.id, sortOrder: p.sortOrder }))
    // Optimista: la carta se reordena en pantalla al instante y se revierte si
    // el servidor dice que no.
    const antes = products
    setProducts(nuevo)
    try {
      const res = await fetch(`${BACKEND_URL}/business/${token}/products/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      const json = (await res.json()) as { success: boolean; data?: Product[] }
      if (!res.ok || !json.success || !json.data) throw new Error('rechazado')
      setProducts(json.data)
    } catch {
      setProducts(antes)
      alert('No se pudo guardar el orden. Revisa tu conexión e inténtalo otra vez.')
    }
  }

  // Secciones = categorías por defecto + las que el dueño ya usó (sin repetir).
  const allCategories = Array.from(
    new Set([...CATEGORIES, ...products.map((p) => p.category)]),
  )

  // Con cientos de referencias la lista completa deja de servir: se filtra por
  // texto (nombre, marca o código de barras), por sección, y se puede aislar lo
  // agotado —que es lo que el dueño necesita reponer.
  const q = busqueda.trim().toLowerCase()
  const visibles = products.filter((p) => {
    if (soloAgotados && !(p.stock === 0 || !p.isAvailable)) return false
    if (seccionFiltro !== 'todas' && p.category !== seccionFiltro) return false
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      (p.brand?.toLowerCase().includes(q) ?? false) ||
      (p.barcode?.includes(q) ?? false)
    )
  })
  const agotados = products.filter((p) => p.stock === 0 || !p.isAvailable).length

  // Agrupa los productos por sección para mostrarlos como un menú real, en el
  // MISMO orden en que los verá el cliente.
  const grouped = ordenarCarta(visibles).reduce<Record<string, Product[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p)
    return acc
  }, {})
  // Las secciones salen en el orden en que aparece su primer plato: subir un
  // plato al principio sube su sección. El dueño ordena una lista, no dos.
  const sectionNames = Object.keys(grouped)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sm:sticky sm:top-0 z-10">
        <div className={`${CONTENEDOR} flex items-center gap-3 py-3 sm:py-4`}>
          <Link href={`/negocio/${token}`} className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">Mi catálogo</p>
              <p className="text-xs text-slate-400">Productos que verá el cliente</p>
            </div>
          </div>
        </div>
      </header>

      <PortalTabs token={token} activa="catalogo" />

      <div className={`${CONTENEDOR} space-y-6 py-5 sm:py-6`}>
        {/* Portada del local */}
        <CoverSection token={token} />
        <MarcaDelLocal token={token} />

        {/* La biblioteca de adiciones. Solo en los rubros cuyo perfil usa
            opciones: un supermercado no vende «porción de aguacate». */}
        {perfil.opciones && (
          <AdicionesManager
            token={token}
            secciones={sectionNames}
            onAplicado={() => void load()}
          />
        )}

        {/* Alta */}
        <form onSubmit={createProduct} className={`${TARJETA} p-5 space-y-3`}>
          <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-600" />
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
              placeholder={`${perfil.seccion.una} (ej: ${perfil.ejemploSeccion})`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={40}
            />
            <input className={INPUT} placeholder="Descripción (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} />
          </div>

          {/* La ficha del producto. Va APARTE del inventario a propósito: un
              local de electrodomésticos que no cuente unidades sigue
              necesitando decir el modelo y la garantía, y antes esos campos
              colgaban del bloque de existencias. */}
          {perfil.marca !== 'ninguno' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                className={INPUT}
                placeholder={perfil.marca === 'marca' ? 'Marca (ej: Diana)' : 'Marca (ej: LG)'}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                maxLength={40}
              />
              {perfil.marca === 'marca-modelo-garantia' && (
                <>
                  <input
                    className={INPUT}
                    placeholder="Modelo (ej: WM-1200)"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    maxLength={60}
                  />
                  <input
                    className={INPUT}
                    placeholder="Garantía en meses"
                    value={warranty}
                    onChange={(e) => setWarranty(e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    maxLength={3}
                  />
                </>
              )}
            </div>
          ) : null}

          {/* Inventario: solo donde se cuentan unidades. Un restaurante marca
              el plato como agotado, no lleva «quedan 7 bandejas». */}
          {perfil.existencias ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Inventario
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className={INPUT}
                  placeholder="Código de barras (opcional)"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  inputMode="numeric"
                  maxLength={20}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select className={INPUT} value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>Se vende por {u}</option>
                  ))}
                </select>
                <input
                  className={INPUT}
                  placeholder="Existencias (vacío = no controlar)"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  inputMode="numeric"
                  maxLength={7}
                />
              </div>
              <p className="text-xs text-emerald-700/80">
                Si dejas las existencias vacías, el producto se vende sin llevar
                cuenta. Con un número, se descuenta en cada pedido y deja de
                venderse al llegar a cero.
              </p>
            </div>
          ) : null}

          {/* Escáner: solo donde los productos vienen con código impreso. */}
          {perfil.codigoDeBarras ? (
            <button
              type="button"
              onClick={() => { setAvisoEscaner(null); setEscaneando(true) }}
              className="w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Escanear código de barras
            </button>
          ) : null}
          {avisoEscaner ? (
            <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {avisoEscaner}
            </p>
          ) : null}

          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}
          <button
            type="submit"
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Agregar al catálogo
          </button>
          <p className="text-xs text-slate-400 text-center">La foto se agrega después, tocando la imagen del producto.</p>
        </form>

        {/* Las dos formas de no teclear el catálogo, y NO son del mismo
            público — estaban juntas y por eso la carta por foto quedó oculta
            justo para los restaurantes, que son quienes tienen una carta
            impresa. Un supermercado recibe un CSV de su proveedor. */}
        {(perfil.cartaPorFoto || perfil.csvMasivo) && (
          <div className="mt-4 space-y-4">
            {perfil.cartaPorFoto && (
              <CartaFoto token={token} onImported={() => void load()} />
            )}
            {perfil.csvMasivo && (
              <CsvImport token={token} onImported={() => void load()} />
            )}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-white border border-red-100 rounded-2xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-slate-600">{error}</p>
          </div>
        ) : products.length > 0 ? (
          <>
          {/* Buscador: con cientos de referencias la lista sola no sirve. */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-4 space-y-2.5">
            <input
              className={INPUT}
              placeholder="Buscar por nombre, marca o código…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700"
                value={seccionFiltro}
                onChange={(e) => setSeccionFiltro(e.target.value)}
              >
                <option value="todas">Todas las secciones</option>
                {Array.from(new Set(products.map((p) => p.category)))
                  .sort((a, b) => a.localeCompare(b, 'es'))
                  .map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {agotados > 0 ? (
                <button
                  type="button"
                  onClick={() => setSoloAgotados((v) => !v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    soloAgotados
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  {agotados} agotado{agotados === 1 ? '' : 's'}
                </button>
              ) : null}
              <span className="text-xs text-slate-400 ml-auto">
                {visibles.length} de {products.length}
              </span>
            </div>
          </div>
          {visibles.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
              <p className="text-sm text-slate-500">
                Ningún producto coincide con la búsqueda.
              </p>
              <button
                type="button"
                onClick={() => { setBusqueda(''); setSeccionFiltro('todas'); setSoloAgotados(false) }}
                className="mt-2 text-sm font-semibold text-emerald-700 hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          ) : null}
          </>
        ) : null}

        {loading || error ? null : products.length === 0 ? (
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
                  <span className="w-1.5 h-4 rounded-full bg-emerald-600" />
                  {section}
                  <span className="text-xs font-normal text-slate-400">({grouped[section].length})</span>
                </h2>
                <div className="space-y-3">
                  {grouped[section].map((p, i) => (
                    <ProductCard
                      key={p.id}
                      token={token}
                      product={p}
                      onChanged={onChanged}
                      onDeleted={onDeleted}
                      onSubir={i === 0 ? null : () => void mover(p.id, -1)}
                      onBajar={
                        i === grouped[section].length - 1 ? null : () => void mover(p.id, 1)
                      }
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

      {/* Escáner a pantalla completa. Queda abierto entre lecturas para poder
          cargar varios productos seguidos. */}
      {escaneando ? (
        <BarcodeScanner
          onDetected={(code) => { void onCodigoLeido(code) }}
          onClose={() => setEscaneando(false)}
          ficha={barcode ? (
            // Los campos son los MISMOS estados del formulario de abajo: lo que
            // se escribe aquí es literalmente ese formulario, así que cerrar la
            // cámara no pierde nada a medio escribir.
            <div className="w-full max-w-md rounded-2xl bg-white p-3 space-y-2 shadow-lg">
              <p className="text-xs font-semibold text-slate-500">
                Código <span className="font-mono text-slate-700">{barcode}</span>
              </p>
              {avisoEscaner ? (
                <p className="text-xs text-emerald-700">{avisoEscaner}</p>
              ) : null}
              <input
                className={INPUT}
                placeholder="Nombre del producto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={INPUT}
                  placeholder="Precio"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="numeric"
                  maxLength={12}
                />
                {perfil.existencias ? (
                  <input
                    className={INPUT}
                    placeholder="Existencias"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    inputMode="numeric"
                    maxLength={7}
                  />
                ) : <span />}
              </div>
              {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
              <button
                type="button"
                onClick={() => { void guardarYSeguir() }}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Guardar y seguir
              </button>
            </div>
          ) : null}
          aviso={guardado}
        />
      ) : null}
    </div>
  )
}
