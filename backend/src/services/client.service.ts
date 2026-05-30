import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { JWT_SECRET, JWT_EXPIRES_IN, MOCK_OTP } from '../config/constants';
import {
  ClientDTO,
  ClientJwtPayload,
  ClientPlaceOrderDTO,
  ClientOrderSummaryDTO,
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
  return _toSummary(order, biz.name);
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
