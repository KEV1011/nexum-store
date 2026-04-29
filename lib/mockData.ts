// Mock data — Sprint 1. Se reemplaza automáticamente con datos reales de Shopify via Storefront API.

export type Product = {
  id:          string
  handle:      string
  title:       string
  subtitle:    string
  price:       number
  comparePrice?: number
  currency:    string
  category:    CollectionHandle
  badge?:      string
  images:      string[]
  description: string
  highlights:  string[]
  inStock:     boolean
  isNew?:      boolean
  isBestseller?: boolean
}

export type Collection = {
  handle:      CollectionHandle
  title:       string
  subtitle:    string
  description: string
  image:       string
  productCount: number
}

export type CollectionHandle = 'pet-tracking' | 'auto-gear' | 'edc'

// ── Colecciones ──────────────────────────────────────────────────────────────

export const collections: Collection[] = [
  {
    handle:       'pet-tracking',
    title:        'Pet Tracking',
    subtitle:     '& Safety',
    description:  'Tecnología GPS de alta precisión para la seguridad de tu mascota.',
    image:        '/images/cat-pet-tracking.jpg',
    productCount: 8,
  },
  {
    handle:       'auto-gear',
    title:        'Premium Auto',
    subtitle:     'Gear',
    description:  'Accesorios inteligentes que transforman tu experiencia al volante.',
    image:        '/images/cat-auto-gear.jpg',
    productCount: 12,
  },
  {
    handle:       'edc',
    title:        'Everyday',
    subtitle:     'Innovation',
    description:  'Gadgets de diseño que resuelven los problemas del día a día.',
    image:        '/images/cat-edc.jpg',
    productCount: 10,
  },
]

// ── Productos ────────────────────────────────────────────────────────────────

export const products: Product[] = [
  // ── Pet Tracking ──────────────────────────────────
  {
    id:           'pt-001',
    handle:       'nexum-tracker-pro',
    title:        'Nexum Tracker Pro',
    subtitle:     'GPS en tiempo real · 4G LTE',
    price:        189000,
    comparePrice: 229000,
    currency:     'COP',
    category:     'pet-tracking',
    badge:        'Más vendido',
    images:       ['/images/tracker-pro-1.jpg', '/images/tracker-pro-2.jpg'],
    description:  'Localización GPS de alta precisión con actualización cada 10 segundos. Resistente al agua IPX7, batería de 7 días y alertas de zona segura directamente en tu smartphone.',
    highlights:   ['GPS + WiFi + LTE', 'IPX7 resistente al agua', 'Batería 7 días', 'Zona segura configurable', 'App iOS & Android'],
    inStock:      true,
    isNew:        false,
    isBestseller: true,
  },
  {
    id:           'pt-002',
    handle:       'nexum-collar-smart',
    title:        'Collar Smart NX',
    subtitle:     'Rastreo + Monitor de actividad',
    price:        129000,
    currency:     'COP',
    category:     'pet-tracking',
    badge:        'Nuevo',
    images:       ['/images/collar-smart-1.jpg'],
    description:  'Collar con GPS integrado y sensor de actividad física. Monitorea pasos, calorías y calidad del sueño de tu mascota desde la app Nexum.',
    highlights:   ['GPS integrado', 'Monitor de actividad', 'Material premium', 'Carga magnética', 'Talla ajustable'],
    inStock:      true,
    isNew:        true,
  },

  // ── Auto Gear ─────────────────────────────────────
  {
    id:           'ag-001',
    handle:       'nexum-dashcam-4k',
    title:        'DashCam 4K Ultra',
    subtitle:     'Visión nocturna · HDR · WiFi',
    price:        299000,
    comparePrice: 379000,
    currency:     'COP',
    category:     'auto-gear',
    badge:        'Más vendido',
    images:       ['/images/dashcam-4k-1.jpg', '/images/dashcam-4k-2.jpg'],
    description:  'Cámara delantera 4K con visión nocturna avanzada, GPS integrado y 140° de ángulo. Grabación en loop, detección de colisión y estacionamiento vigilado.',
    highlights:   ['4K Ultra HD', 'Visión nocturna HDR', 'GPS integrado', 'WiFi + App', 'Modo estacionamiento'],
    inStock:      true,
    isBestseller: true,
  },
  {
    id:           'ag-002',
    handle:       'nexum-wireless-carplay',
    title:        'CarPlay Adapter NX',
    subtitle:     'Convierte tu CarPlay a inalámbrico',
    price:        149000,
    currency:     'COP',
    category:     'auto-gear',
    badge:        'Nuevo',
    images:       ['/images/carplay-1.jpg'],
    description:  'Convierte tu Apple CarPlay con cable en completamente inalámbrico. Conexión en 5 segundos, sin latencia visible, compatible con todos los autos 2016 en adelante.',
    highlights:   ['Sin latencia', 'Conexión 5 seg', 'Plug & Play', 'iOS 14+ compatible', 'Compacto'],
    inStock:      true,
    isNew:        true,
  },
  {
    id:           'ag-003',
    handle:       'nexum-organizer-pro',
    title:        'Organizer Pro',
    subtitle:     'Almacenamiento minimalista para auto',
    price:        89000,
    currency:     'COP',
    category:     'auto-gear',
    images:       ['/images/organizer-1.jpg'],
    description:  'Organizador de asiento trasero en piel vegana premium. Diseño ultradelgado con compartimentos para tablets, documentos y accesorios.',
    highlights:   ['Piel vegana premium', 'Ultra delgado', '8 compartimentos', 'Universal', 'Fácil instalación'],
    inStock:      true,
  },

  // ── EDC ───────────────────────────────────────────
  {
    id:           'edc-001',
    handle:       'nexum-powerbank-ultra',
    title:        'PowerBank Ultra Slim',
    subtitle:     '10.000 mAh · 6mm de grosor',
    price:        119000,
    comparePrice: 149000,
    currency:     'COP',
    category:     'edc',
    badge:        'Top Rated',
    images:       ['/images/powerbank-1.jpg', '/images/powerbank-2.jpg'],
    description:  'La batería más delgada del mercado con 10.000 mAh. Carga hasta 3 dispositivos simultáneamente con MagSafe, USB-C y USB-A. Acabado en aluminio anodizado.',
    highlights:   ['10.000 mAh', 'Solo 6mm', 'MagSafe compatible', 'Carga 65W', 'Aluminio premium'],
    inStock:      true,
    isBestseller: true,
  },
  {
    id:           'edc-002',
    handle:       'nexum-multi-tool',
    title:        'Multi Tool NX7',
    subtitle:     '7 funciones · Titanio · EDC',
    price:        79000,
    currency:     'COP',
    category:     'edc',
    badge:        'Nuevo',
    images:       ['/images/multitool-1.jpg'],
    description:  'Multiherramienta de titanio con 7 funciones en un diseño ultraminimalista. Abre botellas, destornillador, cuchilla, llave hex y más. Cabe en el bolsillo.',
    highlights:   ['Titanio grado 5', '7 funciones', 'Llavero integrado', 'TSA approved', 'Diseño minimalista'],
    inStock:      true,
    isNew:        true,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getProductsByCollection(handle: CollectionHandle): Product[] {
  return products.filter(p => p.category === handle)
}

export function getBestsellers(): Product[] {
  return products.filter(p => p.isBestseller)
}

export function getNewArrivals(): Product[] {
  return products.filter(p => p.isNew)
}

export function getProductByHandle(handle: string): Product | undefined {
  return products.find(p => p.handle === handle)
}

export function formatPrice(price: number, currency = 'COP'): string {
  return new Intl.NumberFormat('es-CO', {
    style:    'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}
