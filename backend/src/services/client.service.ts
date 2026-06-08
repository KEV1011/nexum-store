import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, MOCK_OTP } from '../config/constants';
import {
  ClientDTO,
  ClientJwtPayload,
  ClientPlaceOrderDTO,
  ClientOrderSummaryDTO,
  ClientTripDTO,
  ClientTripStatus,
  RequestClientTripDTO,
  TransportServiceType,
} from '../types';
import { prisma } from '../lib/prisma';

const OTP_TTL = 5 * 60 * 1000;

// ─── WS listener Maps (ephemeral per session) ────────────────────────────────

type OrderCallback = (orderId: string, summary: ClientOrderSummaryDTO) => void;
const orderListeners = new Map<string, Set<OrderCallback>>();

type BusinessNewOrderCallback = (order: ClientOrderSummaryDTO) => void;
const businessOrderListeners = new Map<string, Set<BusinessNewOrderCallback>>();

type TripCallback = (tripId: string, trip: ClientTripDTO) => void;
const tripListeners = new Map<string, Set<TripCallback>>();

// ─── OTP ──────────────────────────────────────────────────────────────────────

export async function sendClientOtp(phone: string): Promise<void> {
  const code = MOCK_OTP ?? Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + OTP_TTL);
  await prisma.otpSession.updateMany({ where: { phone, used: false }, data: { used: true } });
  await prisma.otpSession.create({ data: { phone, code, expiresAt } });
}

export async function verifyClientOtp(
  phone: string,
  otp: string,
): Promise<{ token: string; client: ClientDTO }> {
  const session = await prisma.otpSession.findFirst({
    where: { phone, used: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!session) throw new Error('No OTP requested for this phone number');
  if (new Date() > session.expiresAt) {
    await prisma.otpSession.update({ where: { id: session.id }, data: { used: true } });
    throw new Error('OTP has expired');
  }
  if (session.code !== otp) throw new Error('Invalid OTP');
  await prisma.otpSession.update({ where: { id: session.id }, data: { used: true } });

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, name: 'Usuario Nexum' } });
  }

  const client: ClientDTO = { id: user.id, phone: user.phone, name: user.name ?? 'Usuario Nexum' };
  const payload: ClientJwtPayload = { clientId: user.id, phone: user.phone, role: 'client' };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, client };
}

export function verifyClientToken(token: string): ClientJwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as ClientJwtPayload;
  if (decoded.role !== 'client') throw new Error('Not a client token');
  return decoded;
}

export async function getClientNameByPhone(phone: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { phone }, select: { name: true } });
  return user?.name ?? null;
}

export async function getClientById(clientId: string): Promise<ClientDTO | null> {
  const user = await prisma.user.findUnique({ where: { id: clientId } });
  if (!user) return null;
  return { id: user.id, phone: user.phone, name: user.name ?? 'Usuario Nexum' };
}

// ─── Businesses (delegated to business.service) ────────────────────────────

export { getAllBusinessesPublic as getClientBusinesses } from './business.service';
export { getBusinessPublicById as getClientBusinessById } from './business.service';

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function placeClientOrder(
  clientId: string,
  _clientPhone: string,
  dto: ClientPlaceOrderDTO,
): Promise<ClientOrderSummaryDTO> {
  const { getBusinessPublicById, getProductById } = await import('./business.service');
  const biz = await getBusinessPublicById(dto.businessId);
  const orderRef = `NX-${Math.floor(1000 + Math.random() * 8000)}`;

  let subtotal = 0;
  const lines: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number }> = [];

  for (const line of dto.items) {
    const product = await getProductById(line.productId);
    const sub = line.quantity * line.unitPrice;
    subtotal += sub;
    lines.push({
      productId: line.productId,
      productName: product?.name ?? 'Producto',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: sub,
    });
  }

  const order = await prisma.order.create({
    data: {
      orderRef,
      userId: clientId,
      businessId: dto.businessId,
      deliveryAddress: dto.deliveryAddress,
      status: 'CONFIRMED',
      subtotal,
      deliveryFee: biz.deliveryFee,
      total: subtotal + biz.deliveryFee,
      etaMinutes: biz.etaMinutes,
      hasSignature: false,
      lines: {
        create: lines,
      },
    },
    include: { lines: true },
  });

  const summary = _toSummary(order, biz.name, order.lines);
  void _startSimulation(order.id, biz.name);
  for (const cb of businessOrderListeners.get(dto.businessId) ?? []) cb(summary);
  return summary;
}

export async function getClientOrders(clientId: string): Promise<ClientOrderSummaryDTO[]> {
  const orders = await prisma.order.findMany({
    where: { userId: clientId },
    include: { lines: true, business: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((o) => _toSummary(o, o.business?.name ?? 'Negocio', o.lines));
}

export async function getClientOrderById(clientId: string, orderId: string): Promise<ClientOrderSummaryDTO | null> {
  const o = await prisma.order.findFirst({
    where: { id: orderId, userId: clientId },
    include: { lines: true, business: { select: { name: true } } },
  });
  if (!o) return null;
  return _toSummary(o, o.business?.name ?? 'Negocio', o.lines);
}

export async function getClientOrdersForBusiness(businessId: string): Promise<ClientOrderSummaryDTO[]> {
  const orders = await prisma.order.findMany({
    where: { businessId },
    include: { lines: true, business: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((o) => _toSummary(o, o.business?.name ?? 'Negocio', o.lines));
}

export function onNewClientOrderForBusiness(businessId: string, cb: BusinessNewOrderCallback): () => void {
  if (!businessOrderListeners.has(businessId)) businessOrderListeners.set(businessId, new Set());
  businessOrderListeners.get(businessId)!.add(cb);
  return () => businessOrderListeners.get(businessId)?.delete(cb);
}

// ─── WS subscriptions ─────────────────────────────────────────────────────────

export function subscribeClientOrder(orderId: string, cb: OrderCallback): () => void {
  if (!orderListeners.has(orderId)) orderListeners.set(orderId, new Set());
  orderListeners.get(orderId)!.add(cb);
  return () => orderListeners.get(orderId)?.delete(cb);
}

export async function getClientOrderSnapshot(orderId: string): Promise<ClientOrderSummaryDTO | null> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lines: true, business: { select: { name: true } } },
  });
  if (!o) return null;
  return _toSummary(o, o.business?.name ?? 'Negocio', o.lines);
}

// ─── Server-side order simulation ────────────────────────────────────────────

const MOCK_DRIVERS = [
  { name: 'Andrés Villamizar', phone: '+57 312 678 9012' },
  { name: 'Laura Sepúlveda', phone: '+57 318 234 5678' },
  { name: 'Jorge Contreras', phone: '+57 320 987 6543' },
  { name: 'Diana Rangel', phone: '+57 315 456 7788' },
];

async function _startSimulation(orderId: string, bizName: string): Promise<void> {
  const driver = MOCK_DRIVERS[Math.floor(Math.random() * MOCK_DRIVERS.length)]!;

  const update = async (
    status: string,
    extras: {
      pickedUpAt?: Date;
      deliveredAt?: Date;
      pickupPhotoUrl?: string;
      deliveryPhotoUrl?: string;
      hasSignature?: boolean;
    } = {},
  ) => {
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: status as never,
        ...extras,
      },
      include: { lines: true },
    });
    const summary = _toSummary({ ...updated, driverName: driver.name, driverPhone: driver.phone }, bizName, updated.lines);
    for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  };

  setTimeout(() => void update('DRIVER_TO_PICKUP'), 8_000);
  setTimeout(() => void update('AT_PICKUP'), 22_000);
  setTimeout(() => void update('IN_TRANSIT', { pickedUpAt: new Date(), pickupPhotoUrl: `mock://pickup/${orderId}` }), 38_000);
  setTimeout(() => void update('DELIVERED', { deliveredAt: new Date(), deliveryPhotoUrl: `mock://delivery/${orderId}`, hasSignature: true }), 65_000);
}

// ─── Client Trips ─────────────────────────────────────────────────────────────

export async function requestClientTrip(clientId: string, dto: RequestClientTripDTO): Promise<ClientTripDTO> {
  const requestRef = `NXM-${Math.floor(1000 + Math.random() * 8000)}`;
  const serviceType = dto.serviceType.toUpperCase() as 'TAXI' | 'MOTO' | 'PARTICULAR' | 'ENVIOS';

  const trip = await prisma.trip.create({
    data: {
      requestRef,
      passengerId: clientId,
      serviceType,
      status: 'SEARCHING',
      originAddress: dto.originAddress,
      originLat: 7.3754,
      originLng: -72.6486,
      destAddress: dto.destinationAddress,
      destLat: 7.3821,
      destLng: -72.6512,
      estimatedFare: dto.estimatedFare,
      distanceKm: dto.distanceKm,
      etaMinutes: dto.etaMinutes,
      recipientName: dto.recipientName,
      recipientPhone: dto.recipientPhone,
      packageDescription: dto.packageDescription,
    },
  });

  return _toTripDTO(trip, clientId);
}

export async function acceptClientTrip(
  tripId: string,
  driverName: string,
  driverPhone: string,
  driverVehicle?: string,
): Promise<ClientTripDTO | null> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.status !== 'SEARCHING') return null;

  const updated = await prisma.trip.update({
    where: { id: tripId },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  const dto = _toTripDTOWithDriver(updated, driverName, driverPhone, driverVehicle);
  _notifyTripListeners(tripId, updated.passengerId ?? '', dto);
  void _startTripSimulation(tripId, updated.passengerId ?? '');
  return dto;
}

export async function updateClientTripLocation(tripId: string, _lat: number, _lng: number): Promise<string | null> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { passengerId: true } });
  if (!trip) return null;
  // Location updates are ephemeral; we don't persist per-update lat/lng to trips table
  return trip.passengerId;
}

export async function updateClientTripStatus(tripId: string, status: ClientTripStatus): Promise<ClientTripDTO | null> {
  const prismaStatus = status.toUpperCase().replace('_', '_') as 'SEARCHING' | 'ACCEPTED' | 'ARRIVING' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  const updated = await prisma.trip.update({
    where: { id: tripId },
    data: {
      status: prismaStatus,
      completedAt: status === 'completed' ? new Date() : undefined,
    },
  });
  const dto = _toTripDTO(updated, updated.passengerId ?? '');
  _notifyTripListeners(tripId, updated.passengerId ?? '', dto);
  return dto;
}

export async function cancelClientTrip(clientId: string, tripId: string): Promise<boolean> {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, passengerId: clientId } });
  if (!trip) return false;
  const cancellable = ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED'];
  if (!cancellable.includes(trip.status)) return false;
  const updated = await prisma.trip.update({
    where: { id: tripId },
    data: { status: 'CANCELLED' },
  });
  const dto = _toTripDTO(updated, clientId);
  _notifyTripListeners(tripId, clientId, dto);
  return true;
}

export async function getActiveClientTrip(clientId: string): Promise<ClientTripDTO | null> {
  const active = ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'];
  const trip = await prisma.trip.findFirst({
    where: { passengerId: clientId, status: { in: active as never[] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!trip) return null;
  return _toTripDTO(trip, clientId);
}

export async function getClientTripRaw(tripId: string): Promise<{ clientId: string } | undefined> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { passengerId: true } });
  if (!trip?.passengerId) return undefined;
  return { clientId: trip.passengerId };
}

export function subscribeClientTrip(tripId: string, cb: TripCallback): () => void {
  if (!tripListeners.has(tripId)) tripListeners.set(tripId, new Set());
  tripListeners.get(tripId)!.add(cb);
  return () => tripListeners.get(tripId)?.delete(cb);
}

export async function getClientTripSnapshot(tripId: string): Promise<ClientTripDTO | null> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) return null;
  return _toTripDTO(trip, trip.passengerId ?? '');
}

// ─── Trip simulation ──────────────────────────────────────────────────────────

async function _startTripSimulation(tripId: string, passengerId: string): Promise<void> {
  const step = async (status: string, extras: { completedAt?: Date } = {}) => {
    const current = await prisma.trip.findUnique({ where: { id: tripId }, select: { status: true } });
    const active = ['ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'];
    if (!current || !active.includes(current.status)) return;
    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: { status: status as never, ...extras },
    });
    const dto = _toTripDTO(updated, passengerId);
    _notifyTripListeners(tripId, passengerId, dto);
  };
  setTimeout(() => void step('ARRIVING'), 8_000);
  setTimeout(() => void step('ARRIVED'), 20_000);
  setTimeout(() => void step('IN_PROGRESS'), 30_000);
  setTimeout(() => void step('COMPLETED', { completedAt: new Date() }), 55_000);
}

function _notifyTripListeners(tripId: string, _passengerId: string, dto: ClientTripDTO): void {
  for (const cb of tripListeners.get(tripId) ?? []) cb(tripId, dto);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PrismaOrder = {
  id: string; orderRef: string; businessId: string; status: string; subtotal: number;
  deliveryFee: number; total: number; etaMinutes: number | null; deliveryAddress: string;
  pickupPhotoUrl: string | null; deliveryPhotoUrl: string | null; hasSignature: boolean;
  createdAt: Date; pickedUpAt: Date | null; deliveredAt: Date | null;
  driverName: string | null; driverPhone: string | null; customerName: string | null;
};

type PrismaOrderLine = {
  productName: string; quantity: number; unitPrice: number; subtotal: number;
};

function _toSummary(o: PrismaOrder, businessName: string, lines: PrismaOrderLine[]): ClientOrderSummaryDTO {
  const statusMap: Record<string, string> = {
    CONFIRMED: 'confirmed',
    DRIVER_TO_PICKUP: 'driverToPickup',
    AT_PICKUP: 'atPickup',
    IN_TRANSIT: 'inTransit',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
  };
  return {
    id: o.id,
    orderRef: o.orderRef,
    businessId: o.businessId,
    businessName,
    status: statusMap[o.status] ?? o.status.toLowerCase(),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    etaMinutes: o.etaMinutes ?? 30,
    items: lines.map((l) => ({ productName: l.productName, quantity: l.quantity, unitPrice: l.unitPrice, subtotal: l.subtotal })),
    deliveryAddress: o.deliveryAddress,
    driverName: o.driverName || undefined,
    driverPhone: o.driverPhone || undefined,
    pickupPhotoUrl: o.pickupPhotoUrl ?? undefined,
    deliveryPhotoUrl: o.deliveryPhotoUrl ?? undefined,
    hasSignature: o.hasSignature,
    createdAt: o.createdAt.toISOString(),
    pickedUpAt: o.pickedUpAt?.toISOString(),
    deliveredAt: o.deliveredAt?.toISOString(),
  };
}

type PrismaTrip = {
  id: string; requestRef: string; serviceType: string; status: string;
  originAddress: string; destAddress: string; estimatedFare: number;
  distanceKm: number | null; etaMinutes: number | null;
  createdAt: Date; acceptedAt: Date | null; completedAt: Date | null;
  recipientName: string | null; recipientPhone: string | null; packageDescription: string | null;
};

function _toTripDTO(trip: PrismaTrip, _passengerId: string, driverName?: string, driverPhone?: string, driverVehicle?: string): ClientTripDTO {
  const statusMap: Record<string, ClientTripStatus> = {
    SEARCHING: 'searching', ACCEPTED: 'accepted', ARRIVING: 'arriving',
    ARRIVED: 'arrived', IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELLED: 'cancelled',
  };
  return {
    id: trip.id,
    requestRef: trip.requestRef,
    serviceType: trip.serviceType.toLowerCase() as TransportServiceType,
    originAddress: trip.originAddress,
    destinationAddress: trip.destAddress,
    estimatedFare: trip.estimatedFare,
    distanceKm: trip.distanceKm ?? 0,
    etaMinutes: trip.etaMinutes ?? 0,
    status: statusMap[trip.status] ?? 'searching',
    driverName,
    driverPhone,
    driverVehicle,
    createdAt: trip.createdAt.toISOString(),
    acceptedAt: trip.acceptedAt?.toISOString(),
    completedAt: trip.completedAt?.toISOString(),
    recipientName: trip.recipientName ?? undefined,
    recipientPhone: trip.recipientPhone ?? undefined,
    packageDescription: trip.packageDescription ?? undefined,
  };
}

function _toTripDTOWithDriver(trip: PrismaTrip, driverName: string, driverPhone: string, driverVehicle?: string): ClientTripDTO {
  return _toTripDTO(trip, '', driverName, driverPhone, driverVehicle);
}
