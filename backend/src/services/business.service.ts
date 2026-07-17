import { randomUUID } from 'crypto';
import {
  Business,
  RegisterBusinessDTO,
  DeliveryOrder,
  CreateDeliveryOrderDTO,
  OrderStatusUpdateDTO,
  DeliveryOrderSummaryDTO,
  ProductDTO,
  CreateProductDTO,
  UpdateProductDTO,
  SetProductOptionsDTO,
  BusinessPublicDTO,
  BusinessCategory,
} from '../types';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';

// ─── Order-update notification subscriptions (ephemeral WS session state) ─────

type OrderUpdateCallback = (orderId: string, update: DeliveryOrderSummaryDTO) => void;
const orderUpdateListeners = new Map<string, Set<OrderUpdateCallback>>();

export function onOrderUpdate(orderId: string, cb: OrderUpdateCallback): () => void {
  if (!orderUpdateListeners.has(orderId)) {
    orderUpdateListeners.set(orderId, new Set());
  }
  orderUpdateListeners.get(orderId)!.add(cb);
  return () => {
    orderUpdateListeners.get(orderId)?.delete(cb);
  };
}

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

type PrismaOrderStatus = 'CONFIRMED' | 'DRIVER_TO_PICKUP' | 'AT_PICKUP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

const DELIVERY_STATUS_TO_PRISMA: Record<string, PrismaOrderStatus> = {
  pending: 'CONFIRMED',
  at_pickup: 'AT_PICKUP',
  in_transit: 'IN_TRANSIT',
  delivered: 'DELIVERED',
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
  };
}

function _toSummaryDTO(order: {
  id: string; orderRef: string; customerName: string | null; deliveryAddress: string;
  status: string; total: number; createdAt: Date; pickedUpAt: Date | null; deliveredAt: Date | null;
  pickupPhotoUrl: string | null; deliveryPhotoUrl: string | null; hasSignature: boolean;
  driverName: string | null; driverPhone: string | null;
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
    const biz = await prisma.business.create({
      data: {
        name: dto.name,
        ownerName: dto.ownerName,
        phone: dto.phone,
        address: dto.address,
        category: CATEGORY_TO_PRISMA[dto.category] ?? 'OTHER',
        whatsapp: dto.whatsapp ?? null,
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

  async createOrder(dto: CreateDeliveryOrderDTO, driverId: string): Promise<DeliveryOrder> {
    await this.getBusinessById(dto.businessId); // validates business exists
    const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { name: true, phone: true } });
    const orderRef = dto.orderRef;
    const order = await prisma.order.create({
      data: {
        orderRef,
        businessId: dto.businessId,
        driverId,
        status: 'CONFIRMED',
        deliveryAddress: dto.customerAddress,
        customerName: dto.customerName,
        driverName: driver?.name ?? '',
        driverPhone: driver?.phone ?? '',
        subtotal: dto.grossFare,
        deliveryFee: 0,
        total: dto.grossFare,
        hasSignature: false,
      },
    });
    return {
      id: order.id,
      businessId: order.businessId,
      orderRef: order.orderRef,
      customerName: order.customerName ?? '',
      customerAddress: order.deliveryAddress,
      driverId: order.driverId ?? '',
      driverName: order.driverName ?? '',
      driverPhone: order.driverPhone ?? '',
      status: 'pending',
      grossFare: order.total,
      createdAt: order.createdAt,
      hasSignature: order.hasSignature,
    };
  },

  async updateOrderStatus(orderId: string, dto: OrderStatusUpdateDTO): Promise<DeliveryOrderSummaryDTO> {
    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new Error(`Order ${orderId} not found`);

    const newStatus = DELIVERY_STATUS_TO_PRISMA[dto.status] ?? 'CONFIRMED';
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        ...(dto.status === 'in_transit' && {
          pickedUpAt: new Date(),
          ...(dto.pickupPhotoUrl && { pickupPhotoUrl: dto.pickupPhotoUrl }),
        }),
        ...(dto.status === 'delivered' && {
          deliveredAt: new Date(),
          ...(dto.deliveryPhotoUrl && { deliveryPhotoUrl: dto.deliveryPhotoUrl }),
          ...(dto.hasSignature && { hasSignature: true }),
        }),
      },
    });

    const summary = _toSummaryDTO(updated);

    // Notify subscribed WS clients
    const listeners = orderUpdateListeners.get(orderId);
    if (listeners) {
      for (const cb of listeners) cb(orderId, summary);
    }

    return summary;
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
  category: string;
  imageUrl: string | null;
  isAvailable: boolean;
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

// Catálogo COMPLETO para gestión (incluye no disponibles). Solo para el portal.
export async function getManagedProductsForBusiness(businessId: string): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: 'asc' },
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
      description: dto.description?.trim() || null,
      category: dto.category?.trim() || 'General',
      imageUrl: dto.imageUrl ?? null,
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
      ...(dto.description !== undefined && { description: dto.description.trim() || null }),
      ...(dto.category !== undefined && { category: dto.category.trim() || 'General' }),
      ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
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

export async function getAllBusinessesPublic(): Promise<BusinessPublicDTO[]> {
  const businesses = await prisma.business.findMany({
    where: { isOpen: true },
    include: { products: { where: { isAvailable: true }, include: _photoInclude } },
    orderBy: { name: 'asc' },
  });
  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    category: (CATEGORY_FROM_PRISMA[b.category] ?? 'other') as BusinessCategory,
    address: b.address,
    rating: b.rating,
    etaMinutes: b.etaMinutes,
    deliveryFee: b.deliveryFee,
    isOpen: b.isOpen,
    imageUrl: b.imageUrl ?? undefined,
    products: b.products.map(_productToDTO),
  }));
}

export async function getBusinessPublicById(id: string): Promise<BusinessPublicDTO> {
  const b = await prisma.business.findUnique({
    where: { id },
    include: { products: { where: { isAvailable: true }, include: _photoInclude } },
  });
  if (!b) throw new Error(`Business ${id} not found`);
  return {
    id: b.id,
    name: b.name,
    category: (CATEGORY_FROM_PRISMA[b.category] ?? 'other') as BusinessCategory,
    address: b.address,
    rating: b.rating,
    etaMinutes: b.etaMinutes,
    deliveryFee: b.deliveryFee,
    isOpen: b.isOpen,
    imageUrl: b.imageUrl ?? undefined,
    products: b.products.map(_productToDTO),
  };
}
