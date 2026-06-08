import { randomUUID } from 'crypto';
import {
  Business,
  RegisterBusinessDTO,
  DeliveryOrder,
  CreateDeliveryOrderDTO,
  OrderStatusUpdateDTO,
  DeliveryOrderSummaryDTO,
  ProductDTO,
  BusinessPublicDTO,
  BusinessCategory,
} from '../types';
import { prisma } from '../lib/prisma';

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
  createdAt: Date; isOpen: boolean;
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
    driverPhone: order.driverPhone ?? '',
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

export async function getProductsForBusiness(businessId: string): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    where: { businessId, isAvailable: true },
    orderBy: { createdAt: 'asc' },
  });
  return products.map((p) => ({
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    description: p.description ?? '',
    price: p.price,
    category: p.category,
    isAvailable: p.isAvailable,
  }));
}

export async function getProductById(productId: string): Promise<ProductDTO | undefined> {
  const p = await prisma.product.findUnique({ where: { id: productId } });
  if (!p) return undefined;
  return {
    id: p.id,
    businessId: p.businessId,
    name: p.name,
    description: p.description ?? '',
    price: p.price,
    category: p.category,
    isAvailable: p.isAvailable,
  };
}

export async function getAllBusinessesPublic(): Promise<BusinessPublicDTO[]> {
  const businesses = await prisma.business.findMany({
    where: { isOpen: true },
    include: { products: { where: { isAvailable: true } } },
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
    products: b.products.map((p) => ({
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      description: p.description ?? '',
      price: p.price,
      category: p.category,
      isAvailable: p.isAvailable,
    })),
  }));
}

export async function getBusinessPublicById(id: string): Promise<BusinessPublicDTO> {
  const b = await prisma.business.findUnique({
    where: { id },
    include: { products: { where: { isAvailable: true } } },
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
    products: b.products.map((p) => ({
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      description: p.description ?? '',
      price: p.price,
      category: p.category,
      isAvailable: p.isAvailable,
    })),
  };
}
