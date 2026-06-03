import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { BusinessCategory as PrismaBusinessCategory } from '@prisma/client';
import {
  Business,
  RegisterBusinessDTO,
  DeliveryOrder,
  CreateDeliveryOrderDTO,
  OrderStatusUpdateDTO,
  DeliveryOrderSummaryDTO,
  ProductDTO,
  BusinessPublicDTO,
} from '../types';

// ─── Order-update notification subscriptions ──────────────────────────────────

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

// ─── Mock delivery orders ─────────────────────────────────────────────────────

const deliveryOrders = new Map<string, DeliveryOrder>();

function seedOrders(): void {
  const now = new Date();
  const mock: DeliveryOrder[] = [
    {
      id: 'order-001',
      businessId: 'biz-001',
      orderRef: '#4521',
      customerName: 'María González',
      customerAddress: 'Cra. 5 #12-34, Barrio San Francisco',
      driverId: 'driver-001',
      driverName: 'Carlos Ruiz',
      driverPhone: '+573105550101',
      status: 'delivered',
      grossFare: 8500,
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      pickedUpAt: new Date(now.getTime() - 2.8 * 60 * 60 * 1000),
      deliveredAt: new Date(now.getTime() - 2.6 * 60 * 60 * 1000),
      pickupPhotoUrl: '/mock/pickup_001.jpg',
      hasSignature: true,
    },
    {
      id: 'order-002',
      businessId: 'biz-001',
      orderRef: '#4522',
      customerName: 'Andrés Pérez',
      customerAddress: 'Calle 9 #6-21, Centro',
      driverId: 'driver-001',
      driverName: 'José Ramírez',
      driverPhone: '+573115550202',
      status: 'in_transit',
      grossFare: 7200,
      createdAt: new Date(now.getTime() - 35 * 60 * 1000),
      pickedUpAt: new Date(now.getTime() - 20 * 60 * 1000),
      pickupPhotoUrl: '/mock/pickup_002.jpg',
      hasSignature: false,
    },
    {
      id: 'order-003',
      businessId: 'biz-001',
      orderRef: '#4523',
      customerName: 'Luisa Martínez',
      customerAddress: 'Cra. 8 #15-67, Barrio El Buque',
      driverId: 'driver-001',
      driverName: 'Pedro Torres',
      driverPhone: '+573125550303',
      status: 'pending',
      grossFare: 6800,
      createdAt: new Date(now.getTime() - 8 * 60 * 1000),
      hasSignature: false,
    },
  ];

  for (const order of mock) {
    deliveryOrders.set(order.id, order);
  }
}

seedOrders();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

function toSummaryDTO(order: DeliveryOrder): DeliveryOrderSummaryDTO {
  const hasPickupProof = !!order.pickupPhotoUrl;
  const hasDeliveryProof = !!order.deliveryPhotoUrl || order.hasSignature;
  return {
    id: order.id,
    orderRef: order.orderRef,
    customerName: order.customerName,
    customerAddress: order.customerAddress,
    status: order.status,
    grossFare: order.grossFare,
    createdAt: order.createdAt.toISOString(),
    pickedUpAt: order.pickedUpAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    pickupPhotoUrl: order.pickupPhotoUrl,
    deliveryPhotoUrl: order.deliveryPhotoUrl,
    hasSignature: order.hasSignature,
    driverName: order.driverName,
    driverPhone: order.driverPhone,
    hasPickupProof,
    hasDeliveryProof,
    hasFullCustody: hasPickupProof && hasDeliveryProof,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

const service = {
  // ── Business registration ────────────────────────────────────────────────

  async registerBusiness(dto: RegisterBusinessDTO): Promise<{ id: string; name: string; ownerName: string; phone: string; address: string; category: string; accessToken: string; whatsapp?: string; createdAt: Date; isActive: boolean }> {
    const token = generateToken();
    const categoryMap: Record<string, PrismaBusinessCategory> = {
      restaurant: 'RESTAURANT',
      supermarket: 'SUPERMARKET',
      pharmacy: 'PHARMACY',
      other: 'OTHER',
    };
    const b = await prisma.business.create({
      data: {
        name: dto.name,
        category: categoryMap[dto.category] ?? 'OTHER',
        address: dto.address,
        phone: dto.phone,
        ownerName: dto.ownerName,
        whatsapp: dto.whatsapp,
        token,
        isOpen: true,
        lat: 7.3754,
        lng: -72.6464,
      },
    });
    return {
      id: b.id,
      name: b.name,
      ownerName: b.ownerName ?? dto.ownerName,
      phone: b.phone ?? dto.phone,
      address: b.address,
      category: b.category.toLowerCase(),
      accessToken: b.token,
      whatsapp: b.whatsapp ?? undefined,
      createdAt: b.createdAt,
      isActive: b.isOpen,
    };
  },

  // ── Auth via access token ─────────────────────────────────────────────────

  async getBusinessByToken(token: string): Promise<{ id: string; name: string; ownerName: string; category: string; address: string; accessToken: string; whatsapp?: string; isActive: boolean }> {
    const b = await prisma.business.findUnique({ where: { token } });
    if (!b) throw new Error(`Business not found for token: ${token}`);
    if (!b.isOpen) throw new Error('Business account is not active');
    return {
      id: b.id,
      name: b.name,
      ownerName: b.ownerName ?? '',
      category: b.category.toLowerCase(),
      address: b.address,
      accessToken: b.token,
      whatsapp: b.whatsapp ?? undefined,
      isActive: b.isOpen,
    };
  },

  getBusinessById(id: string): Business {
    // Used for delivery order validation (in-memory only)
    // We return a minimal Business shape from in-memory delivery order context.
    // For in-memory delivery orders that reference 'biz-001' etc., we create a stub.
    return {
      id,
      name: 'Business',
      ownerName: '',
      phone: '',
      address: '',
      category: 'other',
      accessToken: '',
      whatsapp: undefined,
      createdAt: new Date(),
      isActive: true,
    };
  },

  // ── Orders ────────────────────────────────────────────────────────────────

  getTodayOrdersForBusiness(businessId: string): DeliveryOrderSummaryDTO[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from(deliveryOrders.values())
      .filter(
        (o) => o.businessId === businessId && o.createdAt >= today,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(toSummaryDTO);
  },

  getOrderDetail(orderId: string, businessId: string): DeliveryOrderSummaryDTO {
    const order = deliveryOrders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.businessId !== businessId)
      throw new Error('Order does not belong to this business');
    return toSummaryDTO(order);
  },

  createOrder(dto: CreateDeliveryOrderDTO, driverId: string): DeliveryOrder {
    const id = `order-${randomUUID().slice(0, 8)}`;

    const order: DeliveryOrder = {
      id,
      businessId: dto.businessId,
      orderRef: dto.orderRef,
      customerName: dto.customerName,
      customerAddress: dto.customerAddress,
      driverId,
      driverName: 'Driver', // resolved by auth
      driverPhone: '',
      status: 'pending',
      grossFare: dto.grossFare,
      createdAt: new Date(),
      hasSignature: false,
    };

    deliveryOrders.set(id, order);
    return order;
  },

  updateOrderStatus(
    orderId: string,
    dto: OrderStatusUpdateDTO,
  ): DeliveryOrderSummaryDTO {
    const order = deliveryOrders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    if (dto.status === 'at_pickup') {
      order.status = 'at_pickup';
    } else if (dto.status === 'in_transit') {
      order.status = 'in_transit';
      order.pickedUpAt = new Date();
      if (dto.pickupPhotoUrl) order.pickupPhotoUrl = dto.pickupPhotoUrl;
    } else if (dto.status === 'delivered') {
      order.status = 'delivered';
      order.deliveredAt = new Date();
      if (dto.deliveryPhotoUrl) order.deliveryPhotoUrl = dto.deliveryPhotoUrl;
      if (dto.hasSignature) order.hasSignature = true;
    }

    deliveryOrders.set(orderId, order);
    const summary = toSummaryDTO(order);

    // Notify subscribed WS clients
    const listeners = orderUpdateListeners.get(orderId);
    if (listeners) {
      for (const cb of listeners) cb(orderId, summary);
    }

    return summary;
  },

  // ── Stats ─────────────────────────────────────────────────────────────────

  getDayStats(businessId: string) {
    const orders = this.getTodayOrdersForBusiness(businessId);
    const delivered = orders.filter((o) => o.status === 'delivered');
    const fullCustody = delivered.filter((o) => o.hasFullCustody).length;

    return {
      total: orders.length,
      pending: orders.filter(
        (o) => o.status === 'pending' || o.status === 'at_pickup',
      ).length,
      inTransit: orders.filter((o) => o.status === 'in_transit').length,
      delivered: delivered.length,
      fullCustodyRate:
        delivered.length === 0 ? 0 : fullCustody / delivered.length,
    };
  },
};

export function getBusinessService() {
  return service;
}

// ─── Public helpers used by client.service ────────────────────────────────────

export function getProductsForBusiness(_businessId: string): ProductDTO[] {
  // Kept for backward compat — catalog.service now owns store products via Prisma
  return [];
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
  const bizs = await prisma.business.findMany({
    where: { isOpen: true },
    include: { products: { where: { isAvailable: true } } },
    orderBy: { name: 'asc' },
  });
  return bizs.map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category.toLowerCase() as import('../types').BusinessCategory,
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
    category: b.category.toLowerCase() as import('../types').BusinessCategory,
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
