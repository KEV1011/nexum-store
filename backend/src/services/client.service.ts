import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, COMMISSION_RATE } from '../config/constants';
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
import { startMatchingCycle } from './matching.service';
import { getSurgeMultiplier } from './surge.service';
import { maskPhone } from './safe-contact.service';
import { requestOtp, validateOtp } from './otp.service';
import { calcFare } from '../lib/fare';
import { recordCompletedTrip } from './earnings.service';

// ─── WS listener Maps (ephemeral per session) ────────────────────────────────

type OrderCallback = (orderId: string, summary: ClientOrderSummaryDTO) => void;
const orderListeners = new Map<string, Set<OrderCallback>>();

type BusinessNewOrderCallback = (order: ClientOrderSummaryDTO) => void;
const businessOrderListeners = new Map<string, Set<BusinessNewOrderCallback>>();

type TripCallback = (tripId: string, trip: ClientTripDTO) => void;
const tripListeners = new Map<string, Set<TripCallback>>();

// Inyectado por ws.handler al arrancar — este servicio no conoce sockets. Permite
// avisar al conductor (p. ej. trip_cancelled) desde flujos REST del cliente.
let _sendToDriver: ((driverId: string, msg: Record<string, unknown>) => void) | null = null;
export function registerClientSendToDriver(
  fn: (driverId: string, msg: Record<string, unknown>) => void,
): void {
  _sendToDriver = fn;
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

export async function sendClientOtp(phone: string): Promise<void> {
  await requestOtp(phone);
}

export async function verifyClientOtp(
  phone: string,
  otp: string,
): Promise<{ token: string; client: ClientDTO }> {
  await validateOtp(phone, otp);

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
  // El despacho a un repartidor real lo dispara la ruta (startOrderMatchingCycle),
  // igual que los mandados. Ya no existe la simulación server-side con
  // repartidores inventados.
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

// ─── Despacho real de pedidos (repartidores) ─────────────────────────────────
// Reemplaza la antigua simulación server-side (MOCK_DRIVERS + timeouts): el
// ciclo de oferta vive en matching.service (startOrderMatchingCycle) y aquí
// están las escrituras que ejecuta el ws.handler cuando el repartidor actúa.

/**
 * Acepta un pedido para un repartidor: sella driverId + identidad + la empresa
 * del conductor (operatorId, para la liquidación del portal) y pasa el pedido a
 * DRIVER_TO_PICKUP. Devuelve null si ya no está disponible (otro repartidor lo
 * tomó o el pedido se canceló).
 */
export async function acceptClientOrder(
  orderId: string,
  driverName: string,
  driverPhone: string,
  driverId: string,
): Promise<ClientOrderSummaryDTO | null> {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.status !== 'CONFIRMED' || existing.driverId) return null;

  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { operatorId: true },
  });

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'DRIVER_TO_PICKUP',
      driverId,
      driverName,
      driverPhone,
      ...(d?.operatorId ? { operatorId: d.operatorId } : {}),
    },
    include: { lines: true, business: { select: { name: true } } },
  });

  // El repartidor queda ocupado para el matching mientras entrega.
  await prisma.driver
    .update({ where: { id: driverId }, data: { status: 'ON_TRIP' } })
    .catch(() => { /* noop */ });

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  return summary;
}

/**
 * Cancela un pedido del cliente. Permitido hasta que el repartidor recoja el
 * pedido en el negocio (una vez IN_TRANSIT ya no). Si había repartidor
 * asignado, se le avisa por WS (`order_cancelled`) y se libera (ONLINE).
 */
export async function cancelClientOrder(clientId: string, orderId: string): Promise<boolean> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: clientId } });
  if (!order) return false;
  const cancellable = ['CONFIRMED', 'DRIVER_TO_PICKUP', 'AT_PICKUP'];
  if (!cancellable.includes(order.status)) return false;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'CANCELLED' },
    include: { lines: true, business: { select: { name: true } } },
  });

  if (order.driverId) {
    _sendToDriver?.(order.driverId, { type: 'order_cancelled', orderId });
    await prisma.driver
      .update({ where: { id: order.driverId }, data: { status: 'ONLINE' } })
      .catch(() => { /* noop */ });
  }

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  return true;
}

/** Estados que el repartidor puede reportar sobre un pedido. */
export type DriverOrderStatus = 'at_pickup' | 'in_transit' | 'delivered';

/**
 * Avanza el estado de un pedido reportado por SU repartidor. Al entregar,
 * liquida el domicilio (deliveryFee, menos comisión) en la billetera del
 * conductor y lo libera (ONLINE) para nuevos servicios.
 */
export async function updateOrderStatusByDriver(
  orderId: string,
  driverId: string,
  status: DriverOrderStatus,
): Promise<ClientOrderSummaryDTO | null> {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.driverId !== driverId) return null;

  const map = {
    at_pickup: 'AT_PICKUP',
    in_transit: 'IN_TRANSIT',
    delivered: 'DELIVERED',
  } as const;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: map[status],
      ...(status === 'in_transit' ? { pickedUpAt: new Date() } : {}),
      ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
    },
    include: { lines: true, business: { select: { name: true } } },
  });

  if (status === 'delivered') {
    const commission = Math.round(updated.deliveryFee * COMMISSION_RATE);
    recordCompletedTrip(
      {
        tripId: orderId,
        origin: updated.business?.name ?? 'Negocio',
        destination: updated.deliveryAddress,
        grossFare: updated.deliveryFee,
        netEarning: updated.deliveryFee - commission,
        completedAt: new Date().toISOString(),
      },
      driverId,
    );
    await prisma.driver
      .update({ where: { id: driverId }, data: { status: 'ONLINE' } })
      .catch(() => { /* noop */ });
  }

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  return summary;
}

// ─── Client Trips ─────────────────────────────────────────────────────────────

export async function requestClientTrip(clientId: string, dto: RequestClientTripDTO): Promise<ClientTripDTO> {
  const requestRef = `NXM-${Math.floor(1000 + Math.random() * 8000)}`;
  // 'transporte' es el nombre que usa la app cliente para el servicio de carro
  // particular/taxi — se acepta como alias para no romper el contrato REST.
  const normalized = dto.serviceType.toLowerCase() === 'transporte' ? 'particular' : dto.serviceType;
  const serviceType = normalized.toUpperCase() as 'TAXI' | 'MOTO' | 'PARTICULAR' | 'ENVIOS';
  const originLat = dto.originLat ?? 7.3754;
  const originLng = dto.originLng ?? -72.6486;

  const { multiplier: surgeMultiplier } = await getSurgeMultiplier(originLat, originLng);

  const trip = await prisma.trip.create({
    data: {
      requestRef,
      passengerId: clientId,
      serviceType,
      status: 'SEARCHING',
      originAddress: dto.originAddress,
      originLat,
      originLng,
      destAddress: dto.destinationAddress,
      // Destino real cuando la app lo resolvió por autocomplete; aproximación
      // cercana al origen como fallback para texto libre.
      destLat: dto.destLat ?? (dto.originLat ? originLat + 0.0067 : 7.3821),
      destLng: dto.destLng ?? (dto.originLng ? originLng - 0.0026 : -72.6512),
      estimatedFare: dto.estimatedFare,
      surgeMultiplier,
      distanceKm: dto.distanceKm,
      etaMinutes: dto.etaMinutes,
      recipientName: dto.recipientName,
      recipientPhone: dto.recipientPhone,
      packageDescription: dto.packageDescription,
    },
  });

  // Kick off geo-matching asynchronously — does not block the REST response.
  void startMatchingCycle(trip.id, trip.originLat, trip.originLng);

  return _toTripDTO(trip, clientId);
}

// (acceptClientTrip + _startTripSimulation eliminados: eran restos del flujo
// demo. La aceptación real es transaccional en matching.service.onDriverAccept.)

export async function updateClientTripLocation(tripId: string, _lat: number, _lng: number): Promise<string | null> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { passengerId: true } });
  if (!trip) return null;
  // Location updates are ephemeral; we don't persist per-update lat/lng to trips table
  return trip.passengerId;
}

export async function updateClientTripStatus(tripId: string, status: ClientTripStatus): Promise<ClientTripDTO | null> {
  const prismaStatus = status.toUpperCase() as 'SEARCHING' | 'ACCEPTED' | 'ARRIVING' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

  // Al COMPLETAR se liquida el viaje real: se calcula la tarifa, se persisten
  // finalFare/netEarning/commission, se registra la ganancia del conductor (que
  // alimenta wallet + dashboard) y se libera al conductor (ONLINE). Sin esto, un
  // viaje real completado dejaba saldo en cero.
  if (status === 'completed') {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { distanceKm: true, etaMinutes: true, driverId: true, originAddress: true, destAddress: true, finalFare: true },
    });
    const distanceKm = trip?.distanceKm ?? 0;
    const minutes = trip?.etaMinutes ?? Math.max(1, Math.round(distanceKm * 3));
    const { grossFare, commission, netEarning } = calcFare(distanceKm, minutes);

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        // Si ya se selló una tarifa final, se respeta; si no, la calculada.
        finalFare: trip?.finalFare ?? grossFare,
        netEarning,
        commission,
      },
    });

    if (trip?.driverId) {
      recordCompletedTrip(
        {
          tripId,
          origin: trip.originAddress,
          destination: trip.destAddress,
          grossFare: updated.finalFare ?? grossFare,
          netEarning,
          completedAt: new Date().toISOString(),
        },
        trip.driverId,
      );
      // El conductor queda libre para nuevos viajes.
      await prisma.driver.update({ where: { id: trip.driverId }, data: { status: 'ONLINE' } }).catch(() => { /* noop */ });
    }

    const dto = _toTripDTO(updated, updated.passengerId ?? '');
    _notifyTripListeners(tripId, updated.passengerId ?? '', dto);
    return dto;
  }

  const updated = await prisma.trip.update({
    where: { id: tripId },
    data: { status: prismaStatus },
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
    data: { status: 'CANCELLED', cancelReason: 'CANCELLED_BY_PASSENGER' },
  });

  // Si ya había conductor asignado, se le avisa y se libera (ONLINE) para que no
  // quede con un viaje colgado en ON_TRIP.
  if (trip.driverId) {
    _sendToDriver?.(trip.driverId, { type: 'trip_cancelled', tripId });
    await prisma.driver.update({ where: { id: trip.driverId }, data: { status: 'ONLINE' } }).catch(() => { /* noop */ });
  }

  const dto = _toTripDTO(updated, clientId);
  _notifyTripListeners(tripId, clientId, dto);
  return true;
}

/**
 * El matching agotó candidatos sin conseguir conductor. Se cierra el viaje
 * (CANCELLED, motivo NO_DRIVERS_AVAILABLE) y se avisa al pasajero por WS para
 * que deje de "Buscando conductor…" en lugar de colgarse indefinidamente.
 */
export async function handleNoDriversFound(tripId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { status: true, passengerId: true } });
  if (!trip || trip.status !== 'SEARCHING') return;
  const updated = await prisma.trip.update({
    where: { id: tripId },
    data: { status: 'CANCELLED', cancelReason: 'NO_DRIVERS_AVAILABLE' },
  });
  const dto = _toTripDTO(updated, updated.passengerId ?? '');
  _notifyTripListeners(tripId, updated.passengerId ?? '', dto);
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

/** Viajes finalizados (completados o cancelados) del cliente, más reciente primero. */
export async function getClientTripHistory(clientId: string, limit = 50): Promise<ClientTripDTO[]> {
  const trips = await prisma.trip.findMany({
    where: { passengerId: clientId, status: { in: ['COMPLETED', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      driver: {
        include: { vehicles: { where: { isActive: true }, take: 1 } },
      },
    },
  });
  return trips.map((trip) => {
    const v = trip.driver?.vehicles[0];
    const driverVehicle = v ? `${v.brand} ${v.model} • ${v.plate}` : undefined;
    return _toTripDTO(trip, clientId, trip.driver?.name, trip.driver?.phone, driverVehicle);
  });
}

export async function getClientTripRaw(tripId: string): Promise<{ clientId: string } | undefined> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { passengerId: true } });
  if (!trip?.passengerId) return undefined;
  return { clientId: trip.passengerId };
}

/**
 * Liquidación persistida de un viaje completado. La usa el ws.handler para
 * devolverla en `trip_status_ack` y que la app del conductor muestre los
 * montos reales del backend (no la estimación local).
 */
export async function getTripSettlement(
  tripId: string,
): Promise<{ finalFare: number; netEarning: number; commission: number } | null> {
  const t = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { finalFare: true, netEarning: true, commission: true },
  });
  if (!t || t.finalFare == null) return null;
  return { finalFare: t.finalFare, netEarning: t.netEarning ?? 0, commission: t.commission ?? 0 };
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

function _notifyTripListeners(tripId: string, _passengerId: string, dto: ClientTripDTO): void {
  for (const cb of tripListeners.get(tripId) ?? []) cb(tripId, dto);
}

/**
 * Fetch the trip from DB (joining driver + active vehicle) and fire all
 * registered trip listeners.  Called by the matching service after a driver
 * accepts so that WS-subscribed passengers receive a `trip_update` with real
 * driver info.
 */
export async function notifyClientTripUpdateById(tripId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      driver: {
        include: { vehicles: { where: { isActive: true }, take: 1 } },
      },
    },
  });
  if (!trip || !trip.passengerId) return;
  const v = trip.driver?.vehicles[0];
  const driverVehicle = v ? `${v.brand} ${v.model} • ${v.plate}` : undefined;
  const dto = _toTripDTO(trip, trip.passengerId, trip.driver?.name, trip.driver?.phone, driverVehicle);
  _notifyTripListeners(tripId, trip.passengerId, dto);
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
    // Privacy: never expose the driver's real number to the passenger.
    driverPhone: maskPhone(o.driverPhone),
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(o.driverPhone),
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
  finalFare: number | null;
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
    finalFare: trip.finalFare ?? undefined,
    distanceKm: trip.distanceKm ?? 0,
    etaMinutes: trip.etaMinutes ?? 0,
    status: statusMap[trip.status] ?? 'searching',
    driverName,
    // Privacy: the passenger sees a masked reference, not the real number.
    driverPhone: maskPhone(driverPhone),
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(driverPhone),
    driverVehicle,
    createdAt: trip.createdAt.toISOString(),
    acceptedAt: trip.acceptedAt?.toISOString(),
    completedAt: trip.completedAt?.toISOString(),
    recipientName: trip.recipientName ?? undefined,
    recipientPhone: trip.recipientPhone ?? undefined,
    packageDescription: trip.packageDescription ?? undefined,
  };
}
