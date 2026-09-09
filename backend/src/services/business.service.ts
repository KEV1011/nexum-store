import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import {
  Business,
  RegisterBusinessDTO,
  DeliveryOrderSummaryDTO,
  ProductDTO,
  CreateProductDTO,
  UpdateProductDTO,
  SetProductOptionsDTO,
  BusinessSettingsDTO,
  BusinessStatsDTO,
  BusinessPublicDTO,
  BusinessCategory,
} from '../types';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { normalizeColombianPhone } from './auth.service';
import { geocodeAddress } from './geo.service';
import { porcentajeDescuento, rankingMasPedido, saneaPrecioAntes, saneaPromoTienda } from '../lib/vitrina';
import { promedioReputacion } from '../lib/reputacion';
import {
  saneaHorario, estaDentroDelHorario, proximaApertura, horarioEnTexto,
  saneaPausa, enPausa, promoVigente, saneaVigencia, type Franja,
} from '../lib/horario-tienda';

// ─── Enum mappings ─────────────────────────────────────────────────────────────

const CATEGORY_TO_PRISMA: Record<BusinessCategory, 'RESTAURANT' | 'SUPERMARKET' | 'PHARMACY' | 'OTHER'> = {
  restaurant: 'RESTAURANT',
  supermarket: 'SUPERMARKET',
  pharmacy: 'PHARMACY',
  other: 'OTHER',
};

const CATEGORY_FROM_PRISMA: Record<string, BusinessCategory> = {
  RESTAURANT: 'restaurant',
  SUPERMARKET: 'supermarket',
  PHARMACY: 'pharmacy',
  OTHER: 'other',
};

const DELIVERY_STATUS_FROM_PRISMA: Record<string, string> = {
  CONFIRMED: 'pending',
  AT_PICKUP: 'at_pickup',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _dbToBusinessInterface(b: {
  id: string; name: string; ownerName: string | null; phone: string | null;
  address: string; category: string; token: string; whatsapp: string | null;
  createdAt: Date; isOpen: boolean; imageUrl: string | null;
  lat?: number | null; lng?: number | null;
}): Business {
  return {
    id: b.id,
    name: b.name,
    ownerName: b.ownerName ?? '',
    phone: b.phone ?? '',
    address: b.address,
    category: CATEGORY_FROM_PRISMA[b.category] as BusinessCategory ?? 'other',
    accessToken: b.token,
    whatsapp: b.whatsapp ?? undefined,
    imageUrl: b.imageUrl ?? undefined,
    createdAt: b.createdAt,
    isActive: b.isOpen,
    lat: b.lat ?? undefined,
    lng: b.lng ?? undefined,
  };
}

function _toSummaryDTO(order: {
  id: string; orderRef: string; customerName: string | null; deliveryAddress: string;
  status: string; total: number; createdAt: Date; pickedUpAt: Date | null; deliveredAt: Date | null;
  pickupPhotoUrl: string | null; deliveryPhotoUrl: string | null; hasSignature: boolean;
  driverName: string | null; driverPhone: string | null; pickupPin?: string | null;
}): DeliveryOrderSummaryDTO {
  const hasPickupProof = !!order.pickupPhotoUrl;
  const hasDeliveryProof = !!order.deliveryPhotoUrl || order.hasSignature;
  return {
    id: order.id,
    orderRef: order.orderRef,
    customerName: order.customerName ?? '',
    customerAddress: order.deliveryAddress,
    status: (DELIVERY_STATUS_FROM_PRISMA[order.status] ?? 'pending') as DeliveryOrderSummaryDTO['status'],
    grossFare: order.total,
    createdAt: order.createdAt.toISOString(),
    pickedUpAt: order.pickedUpAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    pickupPhotoUrl: order.pickupPhotoUrl ?? undefined,
    deliveryPhotoUrl: order.deliveryPhotoUrl ?? undefined,
    // PIN que el negocio dicta al repartidor para entregarle el pedido. Este
    // portal es del dueño del negocio (token propio); el repartidor no lo ve.
    pickupPin: order.pickupPin ?? undefined,
    hasSignature: order.hasSignature,
    driverName: order.driverName ?? '',
    // Privacy: the driver's real number is never exposed to the business.
    driverPhone: maskPhone(order.driverPhone) ?? '',
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(order.driverPhone),
    hasPickupProof,
    hasDeliveryProof,
    hasFullCustody: hasPickupProof && hasDeliveryProof,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

const service = {
  // ── Business registration ────────────────────────────────────────────────

  async registerBusiness(dto: RegisterBusinessDTO): Promise<Business> {
    const token = randomUUID().replace(/-/g, '').slice(0, 12);
    // Coordenadas desde la dirección escrita: sin ellas, el despacho de sus
    // pedidos se ancla al centro del pueblo y el cliente no ve dónde está el
    // negocio en el mapa. Best-effort puro: si no hay llave de Google o la
    // dirección no se resuelve, el registro continúa igual (el dueño puede
    // fijar el punto después desde Ajustes).
    const geo = await geocodeAddress(dto.address).catch(() => null);
    const biz = await prisma.business.create({
      data: {
        name: dto.name,
        ownerName: dto.ownerName,
        phone: dto.phone,
        address: dto.address,
        category: CATEGORY_TO_PRISMA[dto.category] ?? 'OTHER',
        whatsapp: dto.whatsapp ?? null,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        token,
        isOpen: true,
      },
    });
    return _dbToBusinessInterface(biz);
  },

  // ── Auth via access token ─────────────────────────────────────────────────

  async getBusinessByToken(token: string): Promise<Business> {
    const biz = await prisma.business.findUnique({ where: { token } });
    if (!biz) throw new Error(`Business not found for token: ${token}`);
    if (!biz.isOpen) throw new Error('Business account is not active');
    return _dbToBusinessInterface(biz);
  },

  async getBusinessById(id: string): Promise<Business> {
    const biz = await prisma.business.findUnique({ where: { id } });
    if (!biz) throw new Error(`Business ${id} not found`);
    return _dbToBusinessInterface(biz);
  },

  // ── Orders ────────────────────────────────────────────────────────────────

  async getTodayOrdersForBusiness(businessId: string): Promise<DeliveryOrderSummaryDTO[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const orders = await prisma.order.findMany({
      where: { businessId, createdAt: { gte: today }, userId: null },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(_toSummaryDTO);
  },

  async getOrderDetail(orderId: string, businessId: string): Promise<DeliveryOrderSummaryDTO> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.businessId !== businessId) throw new Error('Order does not belong to this business');
    return _toSummaryDTO(order);
  },

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getDayStats(businessId: string) {
    const orders = await this.getTodayOrdersForBusiness(businessId);
    const delivered = orders.filter((o) => o.status === 'delivered');
    const fullCustody = delivered.filter((o) => o.hasFullCustody).length;

    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending' || o.status === 'at_pickup').length,
      inTransit: orders.filter((o) => o.status === 'in_transit').length,
      delivered: delivered.length,
      fullCustodyRate: delivered.length === 0 ? 0 : fullCustody / delivered.length,
    };
  },
};

export function getBusinessService() {
  return service;
}

// ─── Public helpers used by client.service ────────────────────────────────────

// Mapper compartido Product (Prisma) → ProductDTO. Centraliza `imageUrl` para
// que ninguna respuesta olvide la foto del producto.
function _productToDTO(p: {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  price: number;
  compareAtPrice?: number | null;
  category: string;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder?: number;
  barcode?: string | null;
  sku?: string | null;
  stock?: number | null;
  unit?: string | null;
  brand?: string | null;
  photos?: { id: string; url: string }[];
  optionGroups?: {
    id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    options: { id: string; name: string; priceDelta: number; isAvailable: boolean }[];
  }[];
}): ProductDTO {
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    description: p.description ?? '',
    price: p.price,
    category: p.category,
    imageUrl: p.imageUrl ?? undefined,
    isAvailable: p.isAvailable,
    sortOrder: p.sortOrder ?? 0,
    compareAtPrice: p.compareAtPrice ?? undefined,
    // El porcentaje se calcula UNA vez, aquí: si cada pantalla lo derivara,
    // acabarían redondeando distinto y el «-46 %» del listado no coincidiría
    // con el del detalle.
    descuentoPct: porcentajeDescuento(p.price, p.compareAtPrice) ?? undefined,
    barcode: p.barcode ?? undefined,
    sku: p.sku ?? undefined,
    stock: p.stock ?? undefined,
    unit: p.unit ?? undefined,
    brand: p.brand ?? undefined,
    images: (p.photos ?? []).map((ph) => ({ id: ph.id, url: ph.url })),
    optionGroups: (p.optionGroups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
        isAvailable: o.isAvailable,
      })),
    })),
  };
}

/**
 * ¿La tienda está recibiendo pedidos AHORA?
 *
 * Tres condiciones, y las tres tienen que darse. Vive en una sola función
 * porque la usan la vitrina, el detalle y —lo que importa— la creación del
 * pedido: si la pantalla y la caja lo decidieran por separado, el cliente
 * vería «cerrado» y aun así podría pedir, o al revés.
 */
export function tiendaRecibiendo(b: {
  acceptingOrders: boolean;
  hours?: unknown;
  pausedUntil?: Date | null;
}, ahora = new Date()): { abierta: boolean; motivo: string | null } {
  if (!b.acceptingOrders) return { abierta: false, motivo: 'No está recibiendo pedidos' };
  if (enPausa(b.pausedUntil, ahora)) {
    return { abierta: false, motivo: 'Pausado temporalmente' };
  }
  const franjas = _franjas(b.hours);
  if (!estaDentroDelHorario(franjas, ahora)) {
    return { abierta: false, motivo: proximaApertura(franjas, ahora) ?? 'Cerrado ahora' };
  }
  return { abierta: true, motivo: null };
}

/**
 * Lo que la vitrina dice del estado de la tienda: si recibe, por qué no, su
 * horario y su promoción — con la promoción CALLADA si no está vigente,
 * porque anunciar una que ya venció es prometer lo que la caja no aplica.
 */
function _estadoVitrina(b: {
  acceptingOrders: boolean; hours: unknown; pausedUntil: Date | null;
  pauseReason: string | null; openingHours: string | null;
  promoMinAmount: number | null; promoDiscount: number | null;
  promoFrom: Date | null; promoUntil: Date | null;
}) {
  const estado = tiendaRecibiendo(b);
  const franjas = _franjas(b.hours);
  const vigente = promoVigente(b.promoFrom, b.promoUntil);
  return {
    isOpen: estado.abierta,
    cerradoMotivo: estado.abierta ? undefined : (b.pauseReason || estado.motivo || undefined),
    // El horario en texto sale del estructurado si lo hay; si no, del campo
    // libre de siempre, que es lo único que tienen los negocios ya registrados.
    openingHours: horarioEnTexto(franjas) || b.openingHours || undefined,
    hours: franjas.length ? franjas : undefined,
    promoMinAmount: vigente ? (b.promoMinAmount ?? undefined) : undefined,
    promoDiscount: vigente ? (b.promoDiscount ?? undefined) : undefined,
  };
}

/** El horario guardado como JSON, tolerando basura sin reventar. */
function _franjas(hours: unknown): Franja[] {
  if (!Array.isArray(hours)) return [];
  try {
    return saneaHorario(hours);
  } catch {
    // Un horario corrupto en la base NO puede cerrar una tienda: se ignora y
    // la tienda queda como estaba antes de tener horario.
    return [];
  }
}

/**
 * Marca los productos que más se piden en ESA tienda.
 *
 * Sale de las líneas de pedidos ya entregados: es un dato real, no una
 * curaduría. Si la tienda no ha vendido lo suficiente, `rankingMasPedido`
 * devuelve vacío y no se marca nada — un «#1 más pedido» sobre tres unidades
 * solo dice qué compró la última persona que entró.
 *
 * Best-effort: si la consulta falla, la carta sale sin insignias en vez de no
 * salir. Es adorno, no el pedido.
 */
async function _conMasPedido(businessId: string, productos: ProductDTO[]): Promise<ProductDTO[]> {
  try {
    const filas = await prisma.orderLine.groupBy({
      by: ['productId'],
      where: { order: { businessId, status: 'DELIVERED' } },
      _sum: { quantity: true },
    });
    const unidades = new Map<string, number>();
    for (const f of filas) {
      // `productId` es opcional en la línea: un producto borrado deja la línea
      // con su nombre pero sin referencia, y esa venta ya no se le puede
      // atribuir a nada que siga en la carta.
      if (f.productId) unidades.set(f.productId, f._sum?.quantity ?? 0);
    }
    const puestos = new Map(
      rankingMasPedido(unidades).map((r) => [r.productId, r.puesto]),
    );
    if (puestos.size === 0) return productos;
    return productos.map((p) =>
      puestos.has(p.id) ? { ...p, masPedidoPuesto: puestos.get(p.id) } : p,
    );
  } catch {
    return productos;
  }
}

// Incluir galería y grupos de opciones ordenados en cada consulta de producto.
const _photoInclude = {
  photos: { orderBy: { sortOrder: 'asc' as const } },
  optionGroups: {
    orderBy: { sortOrder: 'asc' as const },
    include: { options: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

export async function getProductsForBusiness(businessId: string): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    where: { businessId, isAvailable: true },
    orderBy: { createdAt: 'asc' },
    include: _photoInclude,
  });
  return products.map(_productToDTO);
}

/**
 * Reordena la carta. Devuelve el catálogo ya ordenado.
 *
 * El `businessId` va en el `where` de cada actualización, no en una
 * comprobación previa: así un token no puede reordenar —ni tocar— el catálogo
 * de otro negocio ni aunque acierte con un id ajeno. Los ids que no sean suyos
 * simplemente no afectan filas.
 *
 * Todo en una transacción: media carta reordenada es peor que ninguna, porque
 * el dueño no sabría qué quedó donde.
 */
export async function reorderBusinessProducts(
  businessId: string,
  orden: Array<{ id: string; sortOrder: number }>,
): Promise<ProductDTO[]> {
  await prisma.$transaction(
    orden.map((o) =>
      prisma.product.updateMany({
        where: { id: o.id, businessId },
        data: { sortOrder: o.sortOrder },
      }),
    ),
  );
  return getManagedProductsForBusiness(businessId);
}

// Catálogo COMPLETO para gestión (incluye no disponibles). Solo para el portal.
export async function getManagedProductsForBusiness(businessId: string): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    where: { businessId },
    // El dueño tiene que ver su carta en el MISMO orden en que la ve el
    // cliente; si no, ordenarla a ciegas es imposible.
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: _photoInclude,
  });
  return products.map(_productToDTO);
}

export async function getProductById(productId: string): Promise<ProductDTO | undefined> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: _photoInclude,
  });
  if (!p) return undefined;
  return _productToDTO(p);
}

// ─── Galería de fotos del producto ────────────────────────────────────────────

async function _assertProductOwnership(businessId: string, productId: string): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing || existing.businessId !== businessId) {
    throw new Error('Producto no encontrado.');
  }
}

/** Agrega una foto a la galería del producto. Devuelve el producto actualizado. */
export async function addProductPhoto(
  businessId: string,
  productId: string,
  url: string,
): Promise<ProductDTO> {
  await _assertProductOwnership(businessId, productId);
  const count = await prisma.productPhoto.count({ where: { productId } });
  await prisma.productPhoto.create({
    data: { productId, url, sortOrder: count },
  });
  const p = await prisma.product.findUnique({ where: { id: productId }, include: _photoInclude });
  return _productToDTO(p!);
}

/** Elimina una foto de la galería del producto. */
export async function deleteProductPhoto(
  businessId: string,
  productId: string,
  photoId: string,
): Promise<ProductDTO> {
  await _assertProductOwnership(businessId, productId);
  await prisma.productPhoto.deleteMany({ where: { id: photoId, productId } });
  const p = await prisma.product.findUnique({ where: { id: productId }, include: _photoInclude });
  return _productToDTO(p!);
}

// ─── Variantes / opciones del producto ────────────────────────────────────────

/**
 * Reemplaza TODAS las opciones del producto por la estructura recibida (el
 * portal edita todo y guarda de una vez). Borra los grupos existentes (cascade
 * borra sus opciones) y recrea. Devuelve el producto actualizado.
 */
export async function setProductOptions(
  businessId: string,
  productId: string,
  dto: SetProductOptionsDTO,
): Promise<ProductDTO> {
  await _assertProductOwnership(businessId, productId);

  await prisma.$transaction(async (tx) => {
    await tx.optionGroup.deleteMany({ where: { productId } });
    for (const [gi, g] of (dto.groups ?? []).entries()) {
      const name = g.name?.trim();
      if (!name) continue;
      const opts = (g.options ?? []).filter((o) => o.name?.trim());
      if (opts.length === 0) continue;
      const maxSelect = Math.max(1, Math.round(g.maxSelect ?? 1));
      const minSelect = Math.max(0, Math.min(maxSelect, Math.round(g.minSelect ?? 0)));
      await tx.optionGroup.create({
        data: {
          productId,
          name,
          required: g.required ?? minSelect > 0,
          minSelect,
          maxSelect,
          sortOrder: gi,
          options: {
            create: opts.map((o, oi) => ({
              name: o.name.trim(),
              priceDelta: Number.isFinite(o.priceDelta) ? Number(o.priceDelta) : 0,
              isAvailable: o.isAvailable ?? true,
              sortOrder: oi,
            })),
          },
        },
      });
    }
  });

  const p = await prisma.product.findUnique({ where: { id: productId }, include: _photoInclude });
  return _productToDTO(p!);
}

// ─── Gestión del catálogo (dueño desde el portal, autenticado por token) ──────

/**
 * Normaliza los campos de inventario que llegan del portal. Un texto vacío se
 * guarda como null (no como ""), para que "sin código de barras" y "código
 * vacío" sean la misma cosa y el índice no se llene de cadenas vacías.
 */
function _inventarioData(dto: {
  barcode?: string; sku?: string; stock?: number | null; unit?: string; brand?: string;
}) {
  const limpio = (v?: string) => (v?.trim() ? v.trim() : null);
  return {
    ...(dto.barcode !== undefined && { barcode: limpio(dto.barcode) }),
    ...(dto.sku !== undefined && { sku: limpio(dto.sku) }),
    // null explícito = el negocio deja de controlar inventario del producto.
    ...(dto.stock !== undefined && {
      stock: dto.stock === null ? null : Math.max(0, Math.trunc(Number(dto.stock) || 0)),
    }),
    ...(dto.unit !== undefined && { unit: limpio(dto.unit) }),
    ...(dto.brand !== undefined && { brand: limpio(dto.brand) }),
  };
}

/**
 * Busca un producto por su código de barras DENTRO de un negocio. El mismo EAN
 * existe en muchos comercios y cada uno tiene su precio, por eso la búsqueda
 * siempre va acotada al negocio. Devuelve null si no lo tiene todavía.
 */
export async function findProductByBarcode(
  businessId: string,
  barcode: string,
): Promise<ProductDTO | null> {
  const codigo = barcode.trim();
  if (!codigo) return null;
  const p = await prisma.product.findFirst({
    where: { businessId, barcode: codigo },
    include: _photoInclude,
  });
  return p ? _productToDTO(p) : null;
}

/**
 * Todos los códigos de barras que el negocio ya tiene, para que la vista previa
 * del CSV sepa qué fila crea y cuál actualiza.
 */
export async function getBarcodeIndexForBusiness(
  businessId: string,
): Promise<Map<string, { id: string; name: string }>> {
  const rows = await prisma.product.findMany({
    where: { businessId, barcode: { not: null } },
    select: { id: true, name: true, barcode: true },
  });
  const map = new Map<string, { id: string; name: string }>();
  for (const r of rows) {
    if (r.barcode) map.set(r.barcode, { id: r.id, name: r.name });
  }
  return map;
}

/**
 * Aplica una importación YA revisada por el dueño. Crea los nuevos y actualiza
 * los existentes; las filas con error nunca llegan aquí (se descartaron en la
 * vista previa). Devuelve el recuento real de lo aplicado.
 */
export async function applyProductImport(
  businessId: string,
  nuevos: Array<{ nombre: string; precio: number; seccion: string; descripcion?: string;
    barcode?: string; brand?: string; unit?: string; stock?: number | null }>,
  actualizaciones: Array<{ productId: string; nombre: string; precio: number; seccion: string;
    descripcion?: string; barcode?: string; brand?: string; unit?: string; stock?: number | null }>,
): Promise<{ creados: number; actualizados: number }> {
  let creados = 0;
  let actualizados = 0;

  for (const n of nuevos) {
    await prisma.product.create({
      data: {
        businessId,
        name: n.nombre,
        price: n.precio,
        category: n.seccion,
        description: n.descripcion ?? null,
        barcode: n.barcode ?? null,
        brand: n.brand ?? null,
        unit: n.unit ?? null,
        stock: n.stock ?? null,
      },
    });
    creados++;
  }

  for (const a of actualizaciones) {
    // updateMany con businessId en el where: un token no puede tocar el
    // catálogo de otro negocio ni aunque le pasen un productId ajeno.
    const res = await prisma.product.updateMany({
      where: { id: a.productId, businessId },
      data: {
        name: a.nombre,
        price: a.precio,
        category: a.seccion,
        ...(a.descripcion !== undefined && { description: a.descripcion }),
        ...(a.brand !== undefined && { brand: a.brand }),
        ...(a.unit !== undefined && { unit: a.unit }),
        ...(a.stock !== undefined && { stock: a.stock }),
      },
    });
    if (res.count > 0) actualizados++;
  }

  return { creados, actualizados };
}

export async function createBusinessProduct(
  businessId: string,
  dto: CreateProductDTO,
): Promise<ProductDTO> {
  const name = dto.name?.trim();
  if (!name) throw new Error('El nombre del producto es obligatorio.');
  if (!(dto.price >= 0)) throw new Error('El precio debe ser un número válido.');
  const p = await prisma.product.create({
    data: {
      businessId,
      name,
      price: dto.price,
      // Lanza con el motivo si el «antes» está al revés o es increíble.
      compareAtPrice: saneaPrecioAntes(dto.price, dto.compareAtPrice),
      description: dto.description?.trim() || null,
      category: dto.category?.trim() || 'General',
      imageUrl: dto.imageUrl ?? null,
      ..._inventarioData(dto),
    },
  });
  return _productToDTO(p);
}

export async function updateBusinessProduct(
  businessId: string,
  productId: string,
  dto: UpdateProductDTO,
): Promise<ProductDTO> {
  // Asegura que el producto pertenece a ESTE negocio (el token no debe editar
  // el catálogo de otro).
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing || existing.businessId !== businessId) {
    throw new Error('Producto no encontrado.');
  }
  const p = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.price !== undefined && { price: dto.price }),
      // Se valida contra el precio que va a QUEDAR, no contra el que había:
      // bajar el precio sin tocar el «antes» debe seguir siendo coherente.
      ...(dto.compareAtPrice !== undefined && {
        compareAtPrice: saneaPrecioAntes(dto.price ?? existing.price, dto.compareAtPrice),
      }),
      ...(dto.description !== undefined && { description: dto.description.trim() || null }),
      ...(dto.category !== undefined && { category: dto.category.trim() || 'General' }),
      ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ..._inventarioData(dto),
    },
    include: _photoInclude,
  });
  return _productToDTO(p);
}

export async function deleteBusinessProduct(businessId: string, productId: string): Promise<void> {
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing || existing.businessId !== businessId) {
    throw new Error('Producto no encontrado.');
  }
  await prisma.product.delete({ where: { id: productId } });
}

/** Actualiza la foto de portada del local y devuelve el negocio ya mapeado. */
export async function updateBusinessCover(businessId: string, imageUrl: string): Promise<Business> {
  const biz = await prisma.business.update({
    where: { id: businessId },
    data: { imageUrl },
  });
  return _dbToBusinessInterface(biz);
}

// ─── Ajustes del negocio (perfil + vitrina) ───────────────────────────────────

export interface BusinessSettingsView {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  deliveryFee: number;
  etaMinutes: number;
  acceptingOrders: boolean;
  openingHours: string;
  imageUrl?: string;
  promoMinAmount?: number;
  promoDiscount?: number;
  promoFrom?: string;
  promoUntil?: string;
  /** Horario estructurado. [] = sin horario declarado (siempre abierta). */
  hours: Franja[];
  /** Hasta cuándo está pausada, si lo está. */
  pausedUntil?: string;
  pauseReason?: string;
  /**
   * Si está recibiendo pedidos AHORA y por qué no. Es lo mismo que ve el
   * cliente: el dueño tiene que poder comprobar en su portal lo que la app
   * está enseñando de su tienda, sin abrir la app.
   */
  isOpen: boolean;
  cerradoMotivo?: string;
}

function _settingsView(b: {
  name: string; address: string; phone: string | null; whatsapp: string | null;
  deliveryFee: number; etaMinutes: number; acceptingOrders: boolean;
  openingHours: string | null; imageUrl: string | null;
  promoMinAmount?: number | null; promoDiscount?: number | null;
  promoFrom?: Date | null; promoUntil?: Date | null;
  hours?: unknown; pausedUntil?: Date | null; pauseReason?: string | null;
}): BusinessSettingsView {
  const estado = tiendaRecibiendo({
    acceptingOrders: b.acceptingOrders,
    hours: b.hours,
    pausedUntil: b.pausedUntil ?? null,
  });
  return {
    name: b.name,
    address: b.address,
    phone: b.phone ?? '',
    whatsapp: b.whatsapp ?? '',
    deliveryFee: b.deliveryFee,
    etaMinutes: b.etaMinutes,
    acceptingOrders: b.acceptingOrders,
    openingHours: b.openingHours ?? '',
    imageUrl: b.imageUrl ?? undefined,
    promoMinAmount: b.promoMinAmount ?? undefined,
    promoDiscount: b.promoDiscount ?? undefined,
    promoFrom: b.promoFrom?.toISOString(),
    promoUntil: b.promoUntil?.toISOString(),
    hours: _franjas(b.hours),
    // Una pausa vencida no se enseña: sería un aviso de algo que ya pasó.
    pausedUntil: enPausa(b.pausedUntil ?? null) ? b.pausedUntil!.toISOString() : undefined,
    pauseReason: enPausa(b.pausedUntil ?? null) ? (b.pauseReason ?? undefined) : undefined,
    isOpen: estado.abierta,
    cerradoMotivo: estado.abierta ? undefined : (estado.motivo ?? undefined),
  };
}

export async function getBusinessSettings(businessId: string): Promise<BusinessSettingsView> {
  const b = await prisma.business.findUnique({ where: { id: businessId } });
  if (!b) throw new Error('Business not found');
  return _settingsView(b);
}

export async function updateBusinessSettings(
  businessId: string,
  dto: BusinessSettingsDTO,
): Promise<BusinessSettingsView> {
  const b = await prisma.business.update({
    where: { id: businessId },
    data: {
      ...(dto.name !== undefined && dto.name.trim() ? { name: dto.name.trim() } : {}),
      ...(dto.address !== undefined && dto.address.trim() ? { address: dto.address.trim() } : {}),
      ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
      ...(dto.whatsapp !== undefined && { whatsapp: dto.whatsapp.trim() || null }),
      ...(dto.deliveryFee !== undefined && Number.isFinite(dto.deliveryFee) && dto.deliveryFee >= 0
        ? { deliveryFee: Math.round(dto.deliveryFee) }
        : {}),
      ...(dto.etaMinutes !== undefined && Number.isFinite(dto.etaMinutes) && dto.etaMinutes > 0
        ? { etaMinutes: Math.round(dto.etaMinutes) }
        : {}),
      ...(dto.acceptingOrders !== undefined && { acceptingOrders: dto.acceptingOrders }),
      ...(dto.openingHours !== undefined && { openingHours: dto.openingHours.trim() || null }),
      // El horario estructurado. `saneaHorario` lanza con el día y el motivo:
      // guardar una franja rota dejaría la tienda cerrada sin que el dueño
      // pueda saber por qué.
      ...(dto.hours !== undefined && {
        hours: saneaHorario(dto.hours) as unknown as Prisma.InputJsonValue,
      }),
      // La pausa se guarda como el INSTANTE en que termina, no como minutos:
      // así se levanta sola sin que nadie tenga que acordarse de nada.
      ...(dto.pauseMinutes !== undefined
        ? (() => {
            const hasta = saneaPausa(dto.pauseMinutes);
            return {
              pausedUntil: hasta,
              pauseReason: hasta ? (dto.pauseReason?.trim() || null) : null,
            };
          })()
        : {}),
      // Las dos juntas o ninguna: `saneaPromoTienda` lanza si llega media.
      // Se renombran a mano a propósito: un spread NO pasa por el control de
      // propiedades sobrantes de TypeScript, así que las claves en español se
      // colaban hasta Prisma sin que el compilador dijera nada.
      ...(dto.promoMinAmount !== undefined || dto.promoDiscount !== undefined
        ? (() => {
            const p = saneaPromoTienda(dto.promoMinAmount, dto.promoDiscount);
            const v = saneaVigencia(dto.promoFrom, dto.promoUntil);
            // Al quitar la promoción se van también sus fechas: dejarlas sería
            // dejar una vigencia huérfana que reviviría la siguiente promoción
            // ya vencida.
            const sinPromo = p.minimo === null;
            return {
              promoMinAmount: p.minimo,
              promoDiscount: p.descuento,
              promoFrom: sinPromo ? null : v.desde,
              promoUntil: sinPromo ? null : v.hasta,
            };
          })()
        : {}),
    },
  });
  return _settingsView(b);
}

// ─── Calificaciones que recibe el negocio ─────────────────────────────────────

export interface BusinessReviewsView {
  /** Promedio, o null si todavía nadie lo ha calificado. */
  rating: number | null;
  ratingCount: number;
  /** Cuántos pusieron 5, 4, 3… para ver de dónde sale el promedio. */
  distribucion: Record<number, number>;
  comentarios: Array<{ estrellas: number; comentario: string; fecha: string }>;
}

/**
 * Lo que la gente ha dicho de este local.
 *
 * Se le enseña al dueño porque una nota sin los comentarios es un castigo sin
 * explicación: sabe que bajó a 3,8 y no sabe si es por la comida, por la
 * demora o por un pedido que salió mal una noche.
 */
export async function getBusinessReviews(businessId: string): Promise<BusinessReviewsView> {
  const filas = await prisma.order.findMany({
    where: { businessId, rating: { not: null } },
    select: { rating: true, ratingComment: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });

  const distribucion: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of filas) {
    const n = f.rating as number;
    if (n >= 1 && n <= 5) distribucion[n] = (distribucion[n] ?? 0) + 1;
  }

  const { rating, ratingCount } = promedioReputacion(filas.map((f) => f.rating as number));
  return {
    rating,
    ratingCount,
    distribucion,
    comentarios: filas
      .filter((f) => f.ratingComment)
      .slice(0, 30)
      .map((f) => ({
        estrellas: f.rating as number,
        comentario: f.ratingComment as string,
        fecha: f.updatedAt.toISOString(),
      })),
  };
}

// ─── Estadísticas de ventas ───────────────────────────────────────────────────

export async function getBusinessStats(
  businessId: string,
  fromISO?: string,
  toISO?: string,
): Promise<BusinessStatsDTO> {
  // Rango por defecto: hoy (00:00 → ahora).
  const from = fromISO ? new Date(fromISO) : new Date(new Date().setHours(0, 0, 0, 0));
  const to = toISO ? new Date(toISO) : new Date();

  const orders = await prisma.order.findMany({
    where: { businessId, createdAt: { gte: from, lte: to } },
    include: { lines: true },
  });

  let deliveredCount = 0;
  let cancelledCount = 0;
  let inProgressCount = 0;
  let revenue = 0;
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const o of orders) {
    if (o.status === 'CANCELLED') {
      cancelledCount++;
      continue;
    }
    if (o.status === 'DELIVERED') deliveredCount++;
    else inProgressCount++;
    revenue += o.subtotal;
    for (const l of o.lines) {
      const key = l.productName;
      const agg = productMap.get(key) ?? { name: key, quantity: 0, revenue: 0 };
      agg.quantity += l.quantity;
      agg.revenue += l.subtotal;
      productMap.set(key, agg);
    }
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ordersCount: orders.length,
    deliveredCount,
    cancelledCount,
    inProgressCount,
    revenue,
    topProducts,
  };
}

export async function getAllBusinessesPublic(): Promise<BusinessPublicDTO[]> {
  const businesses = await prisma.business.findMany({
    where: { isOpen: true },
    include: {
      products: {
        where: { isAvailable: true },
        // La carta se lee en un orden concreto: entradas antes que postres.
        // Por fecha de creación salían mezcladas.
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: _photoInclude,
      },
    },
    orderBy: { name: 'asc' },
  });
  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    category: (CATEGORY_FROM_PRISMA[b.category] ?? 'other') as BusinessCategory,
    address: b.address,
    rating: b.ratingCount > 0 ? b.rating : null,
    ratingCount: b.ratingCount,
    etaMinutes: b.etaMinutes,
    deliveryFee: b.deliveryFee,
    // "Abierto" para el cliente = la vitrina está recibiendo pedidos.
    ..._estadoVitrina(b),
    imageUrl: b.imageUrl ?? undefined,
    products: b.products.map(_productToDTO),
  }));
}

export async function getBusinessPublicById(id: string): Promise<BusinessPublicDTO> {
  const b = await prisma.business.findUnique({
    where: { id },
    include: {
      products: {
        where: { isAvailable: true },
        // La carta se lee en un orden concreto: entradas antes que postres.
        // Por fecha de creación salían mezcladas.
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: _photoInclude,
      },
    },
  });
  if (!b) throw new Error(`Business ${id} not found`);
  return {
    id: b.id,
    name: b.name,
    category: (CATEGORY_FROM_PRISMA[b.category] ?? 'other') as BusinessCategory,
    address: b.address,
    rating: b.ratingCount > 0 ? b.rating : null,
    ratingCount: b.ratingCount,
    etaMinutes: b.etaMinutes,
    deliveryFee: b.deliveryFee,
    ..._estadoVitrina(b),
    imageUrl: b.imageUrl ?? undefined,
    products: await _conMasPedido(b.id, b.products.map(_productToDTO)),
  };
}

// ─── Recuperación del enlace del portal ───────────────────────────────────────

export interface BusinessLinkDTO {
  id: string;
  name: string;
  token: string;
  category: string;
  isOpen: boolean;
}

/**
 * Negocios asociados a un teléfono, para recuperar el enlace del portal.
 *
 * El portal es un enlace mágico sin contraseña: si el dueño lo pierde, hoy se
 * queda por fuera para siempre. Esta búsqueda es la puerta de vuelta.
 *
 * No puede ser una igualdad simple: el teléfono se guarda tal como lo escribió
 * el dueño al registrarse ("300 111 2233", "+573001112233", "3001112233"). Se
 * filtran candidatos por los últimos 4 dígitos —contiguos en cualquiera de esos
 * formatos— y recién ahí se comparan ya normalizados. Así también funciona con
 * los negocios que ya estaban registrados antes de esta función.
 */
export async function findBusinessesByPhone(rawPhone: string): Promise<BusinessLinkDTO[]> {
  const normalizado = normalizeColombianPhone(rawPhone);
  const ultimos4 = normalizado.slice(-4);
  if (!/^\d{4}$/.test(ultimos4)) return [];

  const candidatos = await prisma.business.findMany({
    where: {
      OR: [{ phone: { endsWith: ultimos4 } }, { whatsapp: { endsWith: ultimos4 } }],
    },
    select: {
      id: true, name: true, token: true, category: true, isOpen: true,
      phone: true, whatsapp: true,
    },
    take: 200,
  });

  return candidatos
    .filter(
      (b) =>
        (b.phone != null && normalizeColombianPhone(b.phone) === normalizado) ||
        (b.whatsapp != null && normalizeColombianPhone(b.whatsapp) === normalizado),
    )
    .map((b) => ({
      id: b.id,
      name: b.name,
      token: b.token,
      category: String(b.category),
      isOpen: b.isOpen,
    }));
}

/**
 * Fija a mano el punto del negocio en el mapa.
 *
 * Los negocios registrados antes de la geocodificación automática no tienen
 * coordenadas, y hay direcciones que Google no resuelve. Sin esta vía, esos
 * negocios se quedarían para siempre anclados al centro del pueblo.
 */
export async function updateBusinessLocation(
  businessId: string,
  lat: number,
  lng: number,
): Promise<{ lat: number; lng: number }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Coordenadas inválidas.');
  }
  await prisma.business.update({ where: { id: businessId }, data: { lat, lng } });
  return { lat, lng };
}
