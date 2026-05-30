import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
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
import {
  getAllBusinessesPublic,
  getBusinessPublicById,
  getProductById,
} from './business.service';

// ─── Stores ───────────────────────────────────────────────────────────────────

const clientStore = new Map<string, ClientDTO>();
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

interface ClientOrder {
  id: string;
  orderRef: string;
  clientId: string;
  businessId: string;
  customerAddress: string;
  status: 'confirmed' | 'driverToPickup' | 'atPickup' | 'inTransit' | 'delivered' | 'cancelled';
  driverName: string;
  driverPhone: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  etaMinutes: number;
  items: Array<{ productName: string; quantity: number; unitPrice: number; subtotal: number }>;
  pickupPhotoUrl?: string;
  deliveryPhotoUrl?: string;
  hasSignature: boolean;
  createdAt: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;
}

const orderStore = new Map<string, ClientOrder>();
const clientOrderIndex = new Map<string, string[]>();

type OrderCallback = (orderId: string, summary: ClientOrderSummaryDTO) => void;
const orderListeners = new Map<string, Set<OrderCallback>>();

type BusinessNewOrderCallback = (order: ClientOrderSummaryDTO) => void;
const businessOrderListeners = new Map<string, Set<BusinessNewOrderCallback>>();

const OTP_TTL = 5 * 60 * 1000;
const MOCK_DRIVERS = [
  { name: 'Andrés Villamizar', phone: '+57 312 678 9012' },
  { name: 'Laura Sepúlveda', phone: '+57 318 234 5678' },
  { name: 'Jorge Contreras', phone: '+57 320 987 6543' },
  { name: 'Diana Rangel', phone: '+57 315 456 7788' },
];

// ─── OTP ──────────────────────────────────────────────────────────────────────

export function sendClientOtp(phone: string): void {
  otpStore.set(phone, { otp: MOCK_OTP, expiresAt: Date.now() + OTP_TTL });
}

export function verifyClientOtp(
  phone: string,
  otp: string,
): { token: string; client: ClientDTO } {
  const record = otpStore.get(phone);
  if (!record) throw new Error('No OTP requested for this phone number');
  if (Date.now() > record.expiresAt) { otpStore.delete(phone); throw new Error('OTP has expired'); }
  if (record.otp !== otp) throw new Error('Invalid OTP');
  otpStore.delete(phone);

  let client = clientStore.get(phone);
  if (!client) {
    client = { id: `client-${randomUUID().slice(0, 8)}`, phone, name: 'Usuario Nexum' };
    clientStore.set(phone, client);
  }

  const payload: ClientJwtPayload = { clientId: client.id, phone, role: 'client' };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return { token, client };
}

export function verifyClientToken(token: string): ClientJwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as ClientJwtPayload;
  if (decoded.role !== 'client') throw new Error('Not a client token');
  return decoded;
}

// ─── Businesses ───────────────────────────────────────────────────────────────

export { getAllBusinessesPublic as getClientBusinesses };
export { getBusinessPublicById as getClientBusinessById };

// ─── Orders ───────────────────────────────────────────────────────────────────

export function placeClientOrder(
  clientId: string,
  _clientPhone: string,
  dto: ClientPlaceOrderDTO,
): ClientOrderSummaryDTO {
  const biz = getBusinessPublicById(dto.businessId);
  const id = `cord-${randomUUID().slice(0, 8)}`;
  const orderRef = `NX-${Math.floor(1000 + Math.random() * 8000)}`;

  let subtotal = 0;
  const items = dto.items.map((line) => {
    const product = getProductById(line.productId);
    const sub = line.quantity * line.unitPrice;
    subtotal += sub;
    return { productName: product?.name ?? 'Producto', quantity: line.quantity, unitPrice: line.unitPrice, subtotal: sub };
  });

  const order: ClientOrder = {
    id, orderRef, clientId, businessId: dto.businessId,
    customerAddress: dto.deliveryAddress, status: 'confirmed',
    driverName: '', driverPhone: '',
    subtotal, deliveryFee: biz.deliveryFee, total: subtotal + biz.deliveryFee,
    etaMinutes: biz.etaMinutes, items, hasSignature: false, createdAt: new Date(),
  };

  orderStore.set(id, order);
  clientOrderIndex.set(clientId, [id, ...(clientOrderIndex.get(clientId) ?? [])]);
  _startSimulation(id, biz.name);
  // Notify business portal listeners
  const summary = _toSummary(order, biz.name);
  for (const cb of businessOrderListeners.get(dto.businessId) ?? []) cb(summary);
  return summary;
}

export function getClientOrders(clientId: string): ClientOrderSummaryDTO[] {
  return (clientOrderIndex.get(clientId) ?? [])
    .map((id) => {
      const o = orderStore.get(id);
      if (!o) return null;
      const biz = getAllBusinessesPublic().find((b) => b.id === o.businessId);
      return _toSummary(o, biz?.name ?? 'Negocio');
    })
    .filter((x): x is ClientOrderSummaryDTO => x !== null);
}

export function getClientOrderById(clientId: string, orderId: string): ClientOrderSummaryDTO | null {
  const o = orderStore.get(orderId);
  if (!o || o.clientId !== clientId) return null;
  const biz = getAllBusinessesPublic().find((b) => b.id === o.businessId);
  return _toSummary(o, biz?.name ?? 'Negocio');
}

export function getClientOrdersForBusiness(businessId: string): ClientOrderSummaryDTO[] {
  return [...orderStore.values()]
    .filter((o) => o.businessId === businessId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((o) => {
      const biz = getAllBusinessesPublic().find((b) => b.id === o.businessId);
      return _toSummary(o, biz?.name ?? 'Negocio');
    });
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

export function getClientOrderSnapshot(orderId: string): ClientOrderSummaryDTO | null {
  const o = orderStore.get(orderId);
  if (!o) return null;
  const biz = getAllBusinessesPublic().find((b) => b.id === o.businessId);
  return _toSummary(o, biz?.name ?? 'Negocio');
}

// ─── Server-side status simulation ───────────────────────────────────────────

function _startSimulation(orderId: string, bizName: string): void {
  const driver = MOCK_DRIVERS[Math.floor(Math.random() * MOCK_DRIVERS.length)];

  const update = (
    status: ClientOrder['status'],
    extras: Partial<Pick<ClientOrder, 'pickedUpAt' | 'deliveredAt' | 'pickupPhotoUrl' | 'deliveryPhotoUrl' | 'hasSignature'>> = {},
  ) => {
    const o = orderStore.get(orderId);
    if (!o) return;
    o.driverName = driver.name;
    o.driverPhone = driver.phone;
    o.status = status;
    Object.assign(o, extras);
    orderStore.set(orderId, o);

    const summary = _toSummary(o, bizName);
    for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  };

  setTimeout(() => update('driverToPickup'), 8_000);
  setTimeout(() => update('atPickup'), 22_000);
  setTimeout(() => update('inTransit', { pickedUpAt: new Date(), pickupPhotoUrl: `mock://pickup/${orderId}` }), 38_000);
  setTimeout(() => update('delivered', { deliveredAt: new Date(), deliveryPhotoUrl: `mock://delivery/${orderId}`, hasSignature: true }), 65_000);
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function _toSummary(o: ClientOrder, businessName: string): ClientOrderSummaryDTO {
  return {
    id: o.id, orderRef: o.orderRef, businessId: o.businessId, businessName,
    status: o.status, subtotal: o.subtotal, deliveryFee: o.deliveryFee, total: o.total,
    etaMinutes: o.etaMinutes, items: o.items, deliveryAddress: o.customerAddress,
    driverName: o.driverName || undefined, driverPhone: o.driverPhone || undefined,
    pickupPhotoUrl: o.pickupPhotoUrl, deliveryPhotoUrl: o.deliveryPhotoUrl,
    hasSignature: o.hasSignature, createdAt: o.createdAt.toISOString(),
    pickedUpAt: o.pickedUpAt?.toISOString(), deliveredAt: o.deliveredAt?.toISOString(),
  };
}

// ─── Client Trips ─────────────────────────────────────────────────────────────

interface ClientTrip {
  id: string;
  requestRef: string;
  clientId: string;
  serviceType: string;
  originAddress: string;
  destinationAddress: string;
  estimatedFare: number;
  distanceKm: number;
  etaMinutes: number;
  status: ClientTripStatus;
  driverName?: string;
  driverPhone?: string;
  driverVehicle?: string;
  driverLat?: number;
  driverLng?: number;
  createdAt: Date;
  acceptedAt?: Date;
  completedAt?: Date;
  recipientName?: string;
  recipientPhone?: string;
  packageDescription?: string;
}

const clientTripStore = new Map<string, ClientTrip>();
const clientActiveTrip = new Map<string, string>(); // clientId → tripId

type TripCallback = (tripId: string, trip: ClientTripDTO) => void;
const tripListeners = new Map<string, Set<TripCallback>>();

export function requestClientTrip(clientId: string, dto: RequestClientTripDTO): ClientTripDTO {
  const id = `ctrip-${randomUUID().slice(0, 8)}`;
  const requestRef = `NXM-${Math.floor(1000 + Math.random() * 8000)}`;

  const trip: ClientTrip = {
    id, requestRef, clientId,
    serviceType: dto.serviceType,
    originAddress: dto.originAddress,
    destinationAddress: dto.destinationAddress,
    estimatedFare: dto.estimatedFare,
    distanceKm: dto.distanceKm,
    etaMinutes: dto.etaMinutes,
    status: 'searching',
    createdAt: new Date(),
    recipientName: dto.recipientName,
    recipientPhone: dto.recipientPhone,
    packageDescription: dto.packageDescription,
  };

  clientTripStore.set(id, trip);
  clientActiveTrip.set(clientId, id);
  return _toTripDTO(trip);
}

export function acceptClientTrip(
  tripId: string,
  driverName: string,
  driverPhone: string,
  driverVehicle?: string,
): ClientTripDTO | null {
  const trip = clientTripStore.get(tripId);
  if (!trip || trip.status !== 'searching') return null;
  trip.status = 'accepted';
  trip.acceptedAt = new Date();
  trip.driverName = driverName;
  trip.driverPhone = driverPhone;
  trip.driverVehicle = driverVehicle;
  _notifyTripListeners(tripId, trip);
  _startTripSimulation(tripId);
  return _toTripDTO(trip);
}

export function updateClientTripLocation(tripId: string, lat: number, lng: number): string | null {
  const trip = clientTripStore.get(tripId);
  if (!trip) return null;
  trip.driverLat = lat;
  trip.driverLng = lng;
  return trip.clientId;
}

export function cancelClientTrip(clientId: string, tripId: string): boolean {
  const trip = clientTripStore.get(tripId);
  if (!trip || trip.clientId !== clientId) return false;
  if (!['searching', 'accepted', 'arriving', 'arrived'].includes(trip.status)) return false;
  trip.status = 'cancelled';
  _notifyTripListeners(tripId, trip);
  return true;
}

export function getActiveClientTrip(clientId: string): ClientTripDTO | null {
  const tripId = clientActiveTrip.get(clientId);
  if (!tripId) return null;
  const trip = clientTripStore.get(tripId);
  if (!trip) return null;
  const active: ClientTripStatus[] = ['searching', 'accepted', 'arriving', 'arrived', 'in_progress'];
  if (!active.includes(trip.status)) return null;
  return _toTripDTO(trip);
}

export function getClientTripRaw(tripId: string): ClientTrip | undefined {
  return clientTripStore.get(tripId);
}

export function subscribeClientTrip(tripId: string, cb: TripCallback): () => void {
  if (!tripListeners.has(tripId)) tripListeners.set(tripId, new Set());
  tripListeners.get(tripId)!.add(cb);
  return () => tripListeners.get(tripId)?.delete(cb);
}

export function getClientTripSnapshot(tripId: string): ClientTripDTO | null {
  const trip = clientTripStore.get(tripId);
  if (!trip) return null;
  return _toTripDTO(trip);
}

function _notifyTripListeners(tripId: string, trip: ClientTrip): void {
  const dto = _toTripDTO(trip);
  for (const cb of tripListeners.get(tripId) ?? []) cb(tripId, dto);
}

function _startTripSimulation(tripId: string): void {
  const step = (status: ClientTripStatus) => {
    const trip = clientTripStore.get(tripId);
    const active: ClientTripStatus[] = ['accepted', 'arriving', 'arrived', 'in_progress'];
    if (!trip || !active.includes(trip.status)) return;
    trip.status = status;
    if (status === 'completed') trip.completedAt = new Date();
    _notifyTripListeners(tripId, trip);
  };
  setTimeout(() => step('arriving'), 8_000);
  setTimeout(() => step('arrived'), 20_000);
  setTimeout(() => step('in_progress'), 30_000);
  setTimeout(() => step('completed'), 55_000);
}

function _toTripDTO(trip: ClientTrip): ClientTripDTO {
  return {
    id: trip.id, requestRef: trip.requestRef,
    serviceType: trip.serviceType as TransportServiceType,
    originAddress: trip.originAddress, destinationAddress: trip.destinationAddress,
    estimatedFare: trip.estimatedFare, distanceKm: trip.distanceKm, etaMinutes: trip.etaMinutes,
    status: trip.status,
    driverName: trip.driverName, driverPhone: trip.driverPhone, driverVehicle: trip.driverVehicle,
    driverLat: trip.driverLat, driverLng: trip.driverLng,
    createdAt: trip.createdAt.toISOString(),
    acceptedAt: trip.acceptedAt?.toISOString(),
    completedAt: trip.completedAt?.toISOString(),
    recipientName: trip.recipientName, recipientPhone: trip.recipientPhone,
    packageDescription: trip.packageDescription,
  };
}
