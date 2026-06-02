// Catálogo maestro compartido + productos por negocio.
// Patrón in-memory consistente con account.service.ts (fase MVP / demo).
//
// Idea central: productos estandarizados (farmacia, supermercado) se identifican
// por EAN-13 y viven una sola vez en el catálogo maestro. Cada negocio solo
// referencia el maestro y define precio + stock. La primera vez que se escanea
// un EAN inexistente, se crea y queda disponible para todos los negocios.

export interface MasterProduct {
  id: string;
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  category: string;
  presentation?: string;
  requiresRx: boolean;
  invimaCode?: string;
}

export interface StoreProduct {
  id: string;
  businessId: string;
  masterProductId?: string;
  barcode?: string;
  name: string;
  description?: string;
  price: number;
  stock?: number; // null/undefined = no controla inventario (restaurante)
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  createdAt: Date;
}

const masterByBarcode = new Map<string, MasterProduct>();
const masterById = new Map<string, MasterProduct>();
const storeProducts = new Map<string, StoreProduct>();

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

// ── Seed del catálogo maestro (productos colombianos reales) ──────────────────

interface SeedRow {
  barcode: string;
  name: string;
  brand?: string;
  category: string;
  presentation?: string;
  requiresRx?: boolean;
  invimaCode?: string;
}

const SEED: SeedRow[] = [
  // Bebidas / supermercado
  { barcode: '7702004003508', name: 'Coca-Cola Original 1.5L', brand: 'Coca-Cola', category: 'Bebidas', presentation: '1.5L' },
  { barcode: '7702090038323', name: 'Agua Cristal sin gas 600ml', brand: 'Cristal', category: 'Bebidas', presentation: '600ml' },
  { barcode: '7702011099999', name: 'Jugo Hit Mora 1L', brand: 'Hit', category: 'Bebidas', presentation: '1L' },
  { barcode: '7702031393019', name: 'Pony Malta 330ml', brand: 'Bavaria', category: 'Bebidas', presentation: '330ml' },
  // Mercado seco
  { barcode: '7702993000014', name: 'Arroz Diana x 500g', brand: 'Diana', category: 'Granos', presentation: '500g' },
  { barcode: '7702189070016', name: 'Aceite Premier 1000ml', brand: 'Premier', category: 'Aceites', presentation: '1L' },
  { barcode: '7702025130016', name: 'Café Águila Roja 500g', brand: 'Águila Roja', category: 'Café', presentation: '500g' },
  { barcode: '7702008201006', name: 'Chocolate Corona Pasta 250g', brand: 'Corona', category: 'Chocolate', presentation: '250g' },
  { barcode: '7705320000016', name: 'Panela El Trapiche x 500g', brand: 'El Trapiche', category: 'Endulzantes', presentation: '500g' },
  // Aseo
  { barcode: '7702027001001', name: 'Jabón Rey 300g', brand: 'Rey', category: 'Aseo', presentation: '300g' },
  { barcode: '7702018201006', name: 'Papel Higiénico Familia x4', brand: 'Familia', category: 'Aseo', presentation: 'x4 rollos' },
  { barcode: '7702010001009', name: 'Crema Dental Colgate 100ml', brand: 'Colgate', category: 'Aseo', presentation: '100ml' },
  // Medicamentos OTC (sin fórmula)
  { barcode: '7702057000019', name: 'Acetaminofén MK 500mg x10', brand: 'MK', category: 'Medicamentos', presentation: 'x10 tabletas', invimaCode: 'INVIMA 2018M-0001' },
  { barcode: '7702057000026', name: 'Ibuprofeno MK 400mg x10', brand: 'MK', category: 'Medicamentos', presentation: 'x10 tabletas', invimaCode: 'INVIMA 2019M-0002' },
  { barcode: '7702057000033', name: 'Sal de Frutas Lua', brand: 'Lua', category: 'Medicamentos', presentation: 'sobre', invimaCode: 'INVIMA 2017M-0003' },
  { barcode: '7702132000017', name: 'Suero Oral Pedialyte 500ml', brand: 'Pedialyte', category: 'Medicamentos', presentation: '500ml' },
  // Medicamentos con fórmula (requiresRx)
  { barcode: '7702057111019', name: 'Amoxicilina 500mg x15', brand: 'Genfar', category: 'Medicamentos', presentation: 'x15 cápsulas', requiresRx: true, invimaCode: 'INVIMA 2015M-0010' },
  { barcode: '7702057111026', name: 'Losartán 50mg x30', brand: 'La Santé', category: 'Medicamentos', presentation: 'x30 tabletas', requiresRx: true, invimaCode: 'INVIMA 2016M-0011' },
];

function seed(): void {
  if (masterByBarcode.size > 0) return;
  for (const row of SEED) {
    const mp: MasterProduct = {
      id: nextId('mp'),
      barcode: row.barcode,
      name: row.name,
      brand: row.brand,
      category: row.category,
      presentation: row.presentation,
      requiresRx: row.requiresRx ?? false,
      invimaCode: row.invimaCode,
    };
    masterByBarcode.set(mp.barcode, mp);
    masterById.set(mp.id, mp);
  }
}
seed();

// ── Operaciones de catálogo maestro ───────────────────────────────────────────

/** Busca un producto maestro por código de barras (autocompletado al escanear). */
export function lookupByBarcode(barcode: string): MasterProduct | null {
  return masterByBarcode.get(barcode.trim()) ?? null;
}

/** Búsqueda por texto en el catálogo maestro (para sugerencias sin escáner). */
export function searchMaster(query: string, limit = 20): MasterProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: MasterProduct[] = [];
  for (const mp of masterByBarcode.values()) {
    if (
      mp.name.toLowerCase().includes(q) ||
      (mp.brand?.toLowerCase().includes(q) ?? false)
    ) {
      out.push(mp);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Crea un producto maestro nuevo (EAN no encontrado al escanear). */
export function createMaster(input: {
  barcode: string;
  name: string;
  brand?: string;
  category: string;
  presentation?: string;
  requiresRx?: boolean;
  invimaCode?: string;
  createdByBusinessId?: string;
}): MasterProduct {
  const barcode = input.barcode.trim();
  const existing = masterByBarcode.get(barcode);
  if (existing) return existing; // idempotente: ya lo creó otro negocio
  const mp: MasterProduct = {
    id: nextId('mp'),
    barcode,
    name: input.name,
    brand: input.brand,
    category: input.category,
    presentation: input.presentation,
    requiresRx: input.requiresRx ?? false,
    invimaCode: input.invimaCode,
  };
  masterByBarcode.set(barcode, mp);
  masterById.set(mp.id, mp);
  return mp;
}

// ── Productos por negocio ─────────────────────────────────────────────────────

export function listStoreProducts(businessId: string): StoreProduct[] {
  return Array.from(storeProducts.values())
    .filter((p) => p.businessId === businessId)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/**
 * Agrega un producto al negocio. Dos modos:
 * - Con `barcode`: enlaza/crea el maestro y copia nombre/categoría.
 * - Con `name` (restaurante): producto único sin maestro.
 */
export function addStoreProduct(input: {
  businessId: string;
  barcode?: string;
  name?: string;
  description?: string;
  price: number;
  stock?: number;
  category?: string;
  imageUrl?: string;
  // Datos para crear el maestro si el EAN no existe:
  masterName?: string;
  brand?: string;
  presentation?: string;
  requiresRx?: boolean;
}): StoreProduct {
  if (typeof input.price !== 'number' || input.price < 0) {
    throw new Error('price inválido');
  }

  let master: MasterProduct | null = null;
  if (input.barcode) {
    master = lookupByBarcode(input.barcode);
    if (!master) {
      const name = input.masterName ?? input.name;
      if (!name) throw new Error('Para un código nuevo se requiere el nombre del producto');
      master = createMaster({
        barcode: input.barcode,
        name,
        brand: input.brand,
        category: input.category ?? 'General',
        presentation: input.presentation,
        requiresRx: input.requiresRx,
        createdByBusinessId: input.businessId,
      });
    }
  }

  const resolvedName = master?.name ?? input.name;
  if (!resolvedName) throw new Error('name es requerido');

  const sp: StoreProduct = {
    id: nextId('sp'),
    businessId: input.businessId,
    masterProductId: master?.id,
    barcode: master?.barcode ?? input.barcode,
    name: resolvedName,
    description: input.description,
    price: input.price,
    stock: input.stock,
    category: master?.category ?? input.category ?? 'General',
    imageUrl: master?.imageUrl ?? input.imageUrl,
    isAvailable: true,
    createdAt: new Date(),
  };
  storeProducts.set(sp.id, sp);
  return sp;
}

export function updateStoreProduct(
  id: string,
  patch: { price?: number; stock?: number; isAvailable?: boolean }
): StoreProduct {
  const sp = storeProducts.get(id);
  if (!sp) throw new Error('Producto no encontrado');
  if (patch.price !== undefined) {
    if (patch.price < 0) throw new Error('price inválido');
    sp.price = patch.price;
  }
  if (patch.stock !== undefined) sp.stock = patch.stock;
  if (patch.isAvailable !== undefined) sp.isAvailable = patch.isAvailable;
  return sp;
}

/** Carga masiva: cada fila trae barcode/name + price + stock. */
export function bulkImport(
  businessId: string,
  rows: Array<{
    barcode?: string;
    name?: string;
    price: number;
    stock?: number;
    category?: string;
  }>
): { added: number; errors: Array<{ row: number; error: string }> } {
  let added = 0;
  const errors: Array<{ row: number; error: string }> = [];
  rows.forEach((row, i) => {
    try {
      addStoreProduct({ businessId, ...row, masterName: row.name });
      added += 1;
    } catch (e) {
      errors.push({ row: i + 1, error: e instanceof Error ? e.message : 'error' });
    }
  });
  return { added, errors };
}
