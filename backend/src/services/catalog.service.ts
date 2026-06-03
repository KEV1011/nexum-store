// Catálogo maestro compartido + productos por negocio.
// Backed by Prisma/PostgreSQL. In-memory seed is kept for the master catalogue
// so the barcode scanner works on first run without a DB migration.

import { prisma } from '../lib/prisma';

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

/** Seed master catalogue into DB on first run (idempotent via upsert). */
async function seedMasterCatalogue(): Promise<void> {
  for (const row of SEED) {
    await prisma.masterProduct.upsert({
      where: { barcode: row.barcode },
      create: {
        barcode: row.barcode,
        name: row.name,
        brand: row.brand,
        category: row.category,
        presentation: row.presentation,
        requiresRx: row.requiresRx ?? false,
        invimaCode: row.invimaCode,
      },
      update: {},
    });
  }
}

// Fire-and-forget seed on module load
seedMasterCatalogue().catch(() => {});

// ── Helper: map Prisma model → local interface ────────────────────────────────

function toMasterProduct(p: {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string;
  presentation: string | null;
  requiresRx: boolean;
  invimaCode: string | null;
}): MasterProduct {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand ?? undefined,
    imageUrl: p.imageUrl ?? undefined,
    category: p.category,
    presentation: p.presentation ?? undefined,
    requiresRx: p.requiresRx,
    invimaCode: p.invimaCode ?? undefined,
  };
}

function toStoreProduct(p: {
  id: string;
  businessId: string;
  masterProductId: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  category: string;
  imageUrl: string | null;
  isAvailable: boolean;
  createdAt: Date;
}): StoreProduct {
  return {
    id: p.id,
    businessId: p.businessId,
    masterProductId: p.masterProductId ?? undefined,
    barcode: p.barcode ?? undefined,
    name: p.name,
    description: p.description ?? undefined,
    price: p.price,
    stock: p.stock ?? undefined,
    category: p.category,
    imageUrl: p.imageUrl ?? undefined,
    isAvailable: p.isAvailable,
    createdAt: p.createdAt,
  };
}

// ── Operaciones de catálogo maestro ───────────────────────────────────────────

/** Busca un producto maestro por código de barras (autocompletado al escanear). */
export async function lookupByBarcode(barcode: string): Promise<MasterProduct | null> {
  const p = await prisma.masterProduct.findUnique({ where: { barcode: barcode.trim() } });
  return p ? toMasterProduct(p) : null;
}

/** Búsqueda por texto en el catálogo maestro (para sugerencias sin escáner). */
export async function searchMaster(query: string, limit = 20): Promise<MasterProduct[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.masterProduct.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
  });
  return rows.map(toMasterProduct);
}

/** Crea un producto maestro nuevo (EAN no encontrado al escanear). */
export async function createMaster(input: {
  barcode: string;
  name: string;
  brand?: string;
  category: string;
  presentation?: string;
  requiresRx?: boolean;
  invimaCode?: string;
  createdByBusinessId?: string;
}): Promise<MasterProduct> {
  const barcode = input.barcode.trim();
  const p = await prisma.masterProduct.upsert({
    where: { barcode },
    create: {
      barcode,
      name: input.name,
      brand: input.brand,
      category: input.category,
      presentation: input.presentation,
      requiresRx: input.requiresRx ?? false,
      invimaCode: input.invimaCode,
      createdByBusinessId: input.createdByBusinessId,
    },
    update: {}, // idempotente: ya lo creó otro negocio
  });
  return toMasterProduct(p);
}

// ── Productos por negocio ─────────────────────────────────────────────────────

export async function listStoreProducts(businessId: string): Promise<StoreProduct[]> {
  const rows = await prisma.product.findMany({
    where: { businessId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toStoreProduct);
}

/**
 * Agrega un producto al negocio. Dos modos:
 * - Con `barcode`: enlaza/crea el maestro y copia nombre/categoría.
 * - Con `name` (restaurante): producto único sin maestro.
 */
export async function addStoreProduct(input: {
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
}): Promise<StoreProduct> {
  if (typeof input.price !== 'number' || input.price < 0) {
    throw new Error('price inválido');
  }

  let master: MasterProduct | null = null;
  if (input.barcode) {
    master = await lookupByBarcode(input.barcode);
    if (!master) {
      const name = input.masterName ?? input.name;
      if (!name) throw new Error('Para un código nuevo se requiere el nombre del producto');
      master = await createMaster({
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

  const p = await prisma.product.create({
    data: {
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
    },
  });
  return toStoreProduct(p);
}

export async function updateStoreProduct(
  id: string,
  patch: { price?: number; stock?: number; isAvailable?: boolean },
): Promise<StoreProduct> {
  if (patch.price !== undefined && patch.price < 0) throw new Error('price inválido');
  try {
    const p = await prisma.product.update({
      where: { id },
      data: {
        ...(patch.price !== undefined ? { price: patch.price } : {}),
        ...(patch.stock !== undefined ? { stock: patch.stock } : {}),
        ...(patch.isAvailable !== undefined ? { isAvailable: patch.isAvailable } : {}),
      },
    });
    return toStoreProduct(p);
  } catch {
    throw new Error('Producto no encontrado');
  }
}

/** Carga masiva: cada fila trae barcode/name + price + stock. */
export async function bulkImport(
  businessId: string,
  rows: Array<{
    barcode?: string;
    name?: string;
    price: number;
    stock?: number;
    category?: string;
  }>,
): Promise<{ added: number; errors: Array<{ row: number; error: string }> }> {
  let added = 0;
  const errors: Array<{ row: number; error: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    try {
      await addStoreProduct({ businessId, ...row, masterName: row.name });
      added += 1;
    } catch (e) {
      errors.push({ row: i + 1, error: e instanceof Error ? e.message : 'error' });
    }
  }
  return { added, errors };
}
