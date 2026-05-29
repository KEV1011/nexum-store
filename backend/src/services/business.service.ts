import { randomUUID } from 'crypto';
import {
  Business,
  RegisterBusinessDTO,
  DeliveryOrder,
  CreateDeliveryOrderDTO,
  OrderStatusUpdateDTO,
  DeliveryOrderSummaryDTO,
} from '../types';

// ─── Mock data: pre-registered businesses ────────────────────────────────────

const businesses = new Map<string, Business>([
  [
    'biz-001',
    {
      id: 'biz-001',
      name: 'Restaurante El Sabor Pamplonés',
      ownerName: 'Hernán Suárez',
      phone: '+573101234567',
      address: 'Cra. 6 #8-45, Centro, Pamplona',
      category: 'restaurant',
      accessToken: 'sabor-pamp-2024',
      whatsapp: '+573101234567',
      createdAt: new Date('2024-01-15'),
      isActive: true,
    },
  ],
  [
    'biz-002',
    {
      id: 'biz-002',
      name: 'Droguería San Juan',
      ownerName: 'Claudia Rincón',
      phone: '+573119876543',
      address: 'Calle 7 #5-12, Centro, Pamplona',
      category: 'pharmacy',
      accessToken: 'drogueria-sj-2024',
      whatsapp: '+573119876543',
      createdAt: new Date('2024-02-10'),
      isActive: true,
    },
  ],
]);

const tokenIndex = new Map<string, string>(); // token → businessId

// Build index from pre-registered
for (const [id, biz] of businesses) {
  tokenIndex.set(biz.accessToken, id);
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

  registerBusiness(dto: RegisterBusinessDTO): Business {
    const id = `biz-${randomUUID().slice(0, 8)}`;
    const accessToken = generateToken();

    const business: Business = {
      id,
      name: dto.name,
      ownerName: dto.ownerName,
      phone: dto.phone,
      address: dto.address,
      category: dto.category,
      accessToken,
      whatsapp: dto.whatsapp,
      createdAt: new Date(),
      isActive: true,
    };

    businesses.set(id, business);
    tokenIndex.set(accessToken, id);
    return business;
  },

  // ── Auth via access token ─────────────────────────────────────────────────

  getBusinessByToken(token: string): Business {
    const id = tokenIndex.get(token);
    if (!id) throw new Error(`Business not found for token: ${token}`);
    const biz = businesses.get(id);
    if (!biz) throw new Error(`Business ${id} not found`);
    if (!biz.isActive) throw new Error('Business account is not active');
    return biz;
  },

  getBusinessById(id: string): Business {
    const biz = businesses.get(id);
    if (!biz) throw new Error(`Business ${id} not found`);
    return biz;
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
    const biz = this.getBusinessById(dto.businessId);
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
    void biz; // biz validated above
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
    return toSummaryDTO(order);
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
