import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN, COMMISSION_RATE } from '../config/constants';
import {
  ClientDTO,
  ClientJwtPayload,
  ClientProfileDTO,
  ClientPlaceOrderDTO,
  ClientOrderSummaryDTO,
  ClientTripDTO,
  ClientTripStatus,
  RequestClientTripDTO,
  TransportServiceType,
} from '../types';
import { TripStatus, OrderStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { startMatchingCycle, startOrderMatchingCycle, cancelSearchRetry } from './matching.service';
import { getSurgeMultiplier } from './surge.service';
import { maskPhone } from './safe-contact.service';
import { requestOtp, validateOtp } from './otp.service';
import { normalizeColombianPhone } from './auth.service';
import { calcFare, liquidarViaje } from '../lib/fare';
import { categoriaDeServicio } from '../lib/tarifa-categoria';
import { precioServidor, medirConParadas } from './trip-options.service';
import { sanitizeStops, stopsFromDb } from '../lib/trip-stops';
import { generateCustodyPins, assertCustodyPin, generatePin } from '../lib/custody-pin';
import { resolverOpciones, sanearNota } from '../lib/order-options';
import { exigirPuntoRecogida, exigirPuntoDestino } from '../lib/trip-coords';
import { guardaNoTerminal } from '../lib/estado-terminal';
import { recordCompletedTrip } from './earnings.service';
import {
  fichaFromDriver, fichaPorConductor, fichasPorConductores,
  type DriverCardFields,
} from '../lib/driver-card';
import { sendPushToClient } from './push.service';

// ─── WS listener Maps (ephemeral per session) ────────────────────────────────

type OrderCallback = (orderId: string, summary: ClientOrderSummaryDTO) => void;
const orderListeners = new Map<string, Set<OrderCallback>>();

type BusinessNewOrderCallback = (order: ClientOrderSummaryDTO) => void;
const businessOrderListeners = new Map<string, Set<BusinessNewOrderCallback>>();

// Estimación de trayecto (min) que se suma al tiempo de preparación para el ETA
// total que ve el cliente. Configurable por negocio en una fase posterior.
const DELIVERY_TRAVEL_MIN = 15;

// Un pedido nace PENDING y espera que el restaurante lo acepte. Si no responde a
// tiempo se cancela solo y se avisa al cliente (evita pedidos zombis). El timer
// se limpia al aceptar/rechazar. En memoria: un redeploy lo reinicia (aceptable).
const ORDER_ACCEPT_TIMEOUT_MS = 8 * 60 * 1000;
const pendingOrderTimers = new Map<string, NodeJS.Timeout>();

function clearOrderAcceptTimer(orderId: string): void {
  const t = pendingOrderTimers.get(orderId);
  if (t) {
    clearTimeout(t);
    pendingOrderTimers.delete(orderId);
  }
}

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
  await requestOtp(normalizeColombianPhone(phone));
}

export async function verifyClientOtp(
  phone: string,
  otp: string,
): Promise<{ token: string; client: ClientDTO }> {
  // Mismo E.164 en emisión y validación del OTP + búsqueda de usuario, para no
  // crear cuentas duplicadas si el teléfono llega en formatos distintos.
  const normalized = normalizeColombianPhone(phone);
  await validateOtp(normalized, otp);

  let user = await prisma.user.findUnique({ where: { phone: normalized } });
  if (!user) {
    user = await prisma.user.create({ data: { phone: normalized, name: 'Usuario ZIPA' } });
  }

  const client: ClientDTO = { id: user.id, phone: user.phone, name: user.name ?? 'Usuario ZIPA' };
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
  return { id: user.id, phone: user.phone, name: user.name ?? 'Usuario ZIPA' };
}

// ─── Perfil del cliente ───────────────────────────────────────────────────────

export async function getClientProfile(clientId: string): Promise<ClientProfileDTO> {
  const user = await prisma.user.findUnique({ where: { id: clientId } });
  if (!user) throw new Error('Usuario no encontrado');
  return {
    id: user.id,
    phone: user.phone,
    name: user.name ?? 'Usuario ZIPA',
    email: user.email ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    memberSince: user.createdAt.toISOString(),
  };
}

export async function updateClientProfile(
  clientId: string,
  patch: { name?: string; email?: string; avatarUrl?: string },
): Promise<ClientProfileDTO> {
  const name = patch.name?.trim();
  const email = patch.email?.trim();
  try {
    await prisma.user.update({
      where: { id: clientId },
      data: {
        ...(name !== undefined && name.length > 0 && { name }),
        ...(email !== undefined && { email: email.length > 0 ? email : null }),
        ...(patch.avatarUrl !== undefined && { avatarUrl: patch.avatarUrl }),
      },
    });
  } catch (err) {
    // P2002 = índice único violado (el email pertenece a otra cuenta)
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      throw new Error('Ese correo ya está registrado en otra cuenta.');
    }
    throw err;
  }
  return getClientProfile(clientId);
}

// ─── Businesses (delegated to business.service) ────────────────────────────

export { getAllBusinessesPublic as getClientBusinesses } from './business.service';
export { getBusinessPublicById as getClientBusinessById } from './business.service';

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function placeClientOrder(
  clientId: string,
  _clientPhone: string,
  dto: ClientPlaceOrderDTO,
): Promise<ClientOrderWithPinDTO> {
  const { getBusinessPublicById } = await import('./business.service');
  const biz = await getBusinessPublicById(dto.businessId);
  // El negocio debe estar recibiendo pedidos (vitrina abierta).
  if (!biz.isOpen) {
    throw new Error('El negocio no está recibiendo pedidos en este momento.');
  }
  const orderRef = `NX-${Math.floor(1000 + Math.random() * 8000)}`;

  // ── Validación contra la BD ────────────────────────────────────────────────
  // El precio y la disponibilidad los decide SIEMPRE el servidor, nunca el
  // cliente: la app corre en el teléfono del usuario y cualquiera puede
  // modificar lo que envía (antes se cobraba `line.unitPrice` tal cual, así
  // que bastaba con mandar unitPrice:1 para llevarse cualquier producto).
  let subtotal = 0;
  const lines: Array<{
    productId: string; productName: string; quantity: number; unitPrice: number;
    subtotal: number; optionsSummary: string | null; optionIds: string[]; notes: string | null;
  }> = [];
  // Productos con inventario que habrá que descontar (stock no nulo).
  const aDescontar: Array<{ productId: string; cantidad: number; nombre: string }> = [];

  for (const line of dto.items) {
    if (!(line.quantity > 0)) {
      throw new Error('La cantidad de cada producto debe ser mayor a cero.');
    }
    const producto = await prisma.product.findUnique({
      where: { id: line.productId },
      include: {
        optionGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!producto || producto.businessId !== dto.businessId) {
      throw new Error('Uno de los productos ya no está disponible en este negocio.');
    }
    if (!producto.isAvailable) {
      throw new Error(`${producto.name} no está disponible en este momento.`);
    }
    // stock null = el negocio no controla inventario (caso restaurante).
    if (producto.stock !== null && producto.stock < line.quantity) {
      throw new Error(
        producto.stock <= 0
          ? `${producto.name} se agotó.`
          : `Solo quedan ${producto.stock} de ${producto.name}.`,
      );
    }
    if (producto.stock !== null) {
      aDescontar.push({ productId: producto.id, cantidad: line.quantity, nombre: producto.name });
    }

    // ── El precio ─────────────────────────────────────────────────────────
    // Con los ids de las opciones el servidor calcula el recargo EXACTO desde
    // el catálogo, compone el resumen que leerá la cocina y rechaza cualquier
    // opción que el negocio acabe de agotar.
    //
    // Sin ids se aplica el criterio antiguo (suelo el precio del catálogo,
    // techo el triple). No es exacto y puede recortar un pedido legítimo con
    // muchas adiciones, pero hay apps instaladas que todavía mandan solo el
    // total sumado y dejarlas fuera sería peor. Cuando esas versiones se
    // hayan renovado, esta rama se retira.
    let precioUnitario: number;
    let resumen: string | null;
    let idsOpciones: string[] = [];

    if (Array.isArray(line.optionIds)) {
      const resueltas = resolverOpciones(
        producto.optionGroups,
        line.optionIds,
        producto.name,
      );
      // El recargo puede ser negativo si el negocio descuenta por quitar algo;
      // el precio de una línea nunca baja de cero.
      precioUnitario = Math.max(0, producto.price + resueltas.recargo);
      resumen = resueltas.resumen;
      idsOpciones = resueltas.ids;
    } else {
      const enviado = Number(line.unitPrice) || 0;
      precioUnitario = Math.min(Math.max(producto.price, enviado), producto.price * 3);
      resumen = line.optionsSummary?.trim() || null;
    }

    const sub = line.quantity * precioUnitario;
    subtotal += sub;
    lines.push({
      productId: line.productId,
      productName: producto.name,
      quantity: line.quantity,
      unitPrice: precioUnitario,
      subtotal: sub,
      optionsSummary: resumen,
      optionIds: idsOpciones,
      notes: sanearNota(line.notes),
    });
  }

  // ── Descuento de inventario, a prueba de concurrencia ──────────────────────
  // updateMany con guardia `stock >= cantidad`: si dos clientes compran la
  // última unidad a la vez, solo uno afecta filas y el otro recibe el aviso.
  // Se hace ANTES de crear el pedido para no dejar pedidos sin respaldo.
  const descontados: Array<{ productId: string; cantidad: number }> = [];
  for (const item of aDescontar) {
    const res = await prisma.product.updateMany({
      where: { id: item.productId, stock: { gte: item.cantidad } },
      data: { stock: { decrement: item.cantidad } },
    });
    if (res.count === 0) {
      // Alguien se adelantó: se devuelve lo ya descontado y se avisa con el
      // nombre del producto, para que el cliente sepa qué quitar del carrito.
      for (const hecho of descontados) {
        await prisma.product.update({
          where: { id: hecho.productId },
          data: { stock: { increment: hecho.cantidad } },
        });
      }
      throw new Error(`${item.nombre} se agotó mientras confirmabas el pedido.`);
    }
    descontados.push({ productId: item.productId, cantidad: item.cantidad });
  }

  const order = await prisma.order.create({
    data: {
      orderRef,
      userId: clientId,
      businessId: dto.businessId,
      deliveryAddress: dto.deliveryAddress,
      deliveryLat: Number.isFinite(dto.deliveryLat) ? dto.deliveryLat : null,
      deliveryLng: Number.isFinite(dto.deliveryLng) ? dto.deliveryLng : null,
      // El pedido nace PENDING: espera que el restaurante lo acepte y fije el
      // tiempo de preparación. El despacho al repartidor ya NO es inmediato — se
      // dispara cuando el negocio acepta (así el conductor no espera en la puerta).
      status: 'PENDING',
      subtotal,
      deliveryFee: biz.deliveryFee,
      total: subtotal + biz.deliveryFee,
      etaMinutes: biz.etaMinutes,
      // Cadena de custodia: el negocio guarda el PIN de recogida y el cliente
      // el de entrega. El repartidor los pide de viva voz en cada paso.
      ...generateCustodyPins(),
      hasSignature: false,
      lines: {
        create: lines,
      },
    },
    include: { lines: true },
  });

  const summary = _toSummary(order, biz.name, order.lines);
  // Aviso al portal del negocio (WS new_order) para que acepte y ponga el prep.
  // Se le manda el resumen SIN el PIN de entrega: ese es del cliente y el
  // negocio no tiene por qué conocerlo.
  for (const cb of businessOrderListeners.get(dto.businessId) ?? []) cb(summary);

  // Salvaguarda: si el restaurante no responde, el pedido se auto-cancela.
  const timer = setTimeout(() => {
    void autoCancelUnacceptedOrder(order.id);
  }, ORDER_ACCEPT_TIMEOUT_MS);
  // Evita retener el proceso solo por este timer (entorno de test/CLI).
  if (typeof timer.unref === 'function') timer.unref();
  pendingOrderTimers.set(order.id, timer);

  // El PIN de entrega viaja en la respuesta de creación, igual que en viajes y
  // envíos. Antes solo se obtenía consultando el pedido después: la app tenía
  // que ir a buscarlo por su cuenta y, si ese sondeo fallaba o cambiaba, el
  // cliente se quedaba sin el número que el repartidor le va a pedir en la
  // puerta. Esa asimetría entre servicios ya provocó el fallo una vez.
  return { ...summary, deliveryPin: order.deliveryPin ?? undefined };
}

/**
 * Auto-cancela un pedido que el restaurante nunca aceptó (sigue PENDING). Avisa
 * al cliente por WS y push. No-op si ya avanzó de estado.
 */
/**
 * Devuelve al inventario lo que el pedido había descontado. Solo afecta a los
 * productos con `stock` no nulo (los que llevan control); los del restaurante
 * quedan intactos. Idempotencia: se llama una vez por cancelación, siempre
 * junto al cambio de estado a CANCELLED.
 */
async function restoreOrderStock(orderId: string): Promise<void> {
  const lines = await prisma.orderLine.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  for (const l of lines) {
    if (!l.productId) continue;
    // El guardia `stock: { not: null }` evita empezar a contar inventario en un
    // producto que el negocio dejó sin control.
    await prisma.product.updateMany({
      where: { id: l.productId, stock: { not: null } },
      data: { stock: { increment: l.quantity } },
    });
  }
}

async function autoCancelUnacceptedOrder(orderId: string): Promise<void> {
  clearOrderAcceptTimer(orderId);
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.status !== 'PENDING') return;
  await restoreOrderStock(orderId);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'CANCELLED' },
    include: { lines: true, business: { select: { name: true } } },
  });

  if (updated.userId) {
    void sendPushToClient(updated.userId, {
      title: 'Pedido no confirmado',
      body: `${updated.business?.name ?? 'El negocio'} no confirmó tu pedido a tiempo. No se te cobró.`,
      data: { type: 'order_cancelled', orderId },
    });
  }

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
}

/**
 * El restaurante ACEPTA el pedido y fija el tiempo de preparación (min). Pasa a
 * PREPARING, calcula el ETA total (prep + trayecto) y DISPARA el despacho al
 * repartidor. Devuelve null si el pedido ya no está PENDING o no es del negocio.
 */
export async function acceptOrderByBusiness(
  businessId: string,
  orderId: string,
  prepMinutes: number,
): Promise<ClientOrderSummaryDTO | null> {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.businessId !== businessId || existing.status !== 'PENDING') {
    return null;
  }
  clearOrderAcceptTimer(orderId);

  const prep = Math.max(1, Math.min(180, Math.round(prepMinutes)));
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'PREPARING',
      prepMinutes: prep,
      acceptedAt: new Date(),
      etaMinutes: prep + DELIVERY_TRAVEL_MIN,
    },
    include: { lines: true, business: { select: { name: true } } },
  });

  if (updated.userId) {
    void sendPushToClient(updated.userId, {
      title: 'Pedido confirmado',
      body: `${updated.business?.name ?? 'El negocio'} está preparando tu pedido (~${prep} min).`,
      data: { type: 'order_preparing', orderId },
    });
  }

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);

  // Ahora sí buscamos repartidor (antes esperaba en la puerta del negocio).
  void startOrderMatchingCycle(orderId);
  return summary;
}

/** El restaurante RECHAZA el pedido (no lo puede preparar). Avisa al cliente. */
export async function rejectOrderByBusiness(
  businessId: string,
  orderId: string,
): Promise<ClientOrderSummaryDTO | null> {
  // Ya no hay pedido que despachar: deja de buscar repartidor.
  cancelSearchRetry(`order:${orderId}`);
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.businessId !== businessId) return null;
  // Solo se puede rechazar antes de que un repartidor esté asignado.
  if (!['PENDING', 'PREPARING'].includes(existing.status) || existing.driverId) return null;
  clearOrderAcceptTimer(orderId);
  await restoreOrderStock(orderId);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'CANCELLED' },
    include: { lines: true, business: { select: { name: true } } },
  });

  if (updated.userId) {
    void sendPushToClient(updated.userId, {
      title: 'Pedido rechazado',
      body: `${updated.business?.name ?? 'El negocio'} no pudo tomar tu pedido. No se te cobró.`,
      data: { type: 'order_cancelled', orderId },
    });
  }

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  return summary;
}

/**
 * El restaurante marca el pedido LISTO para recoger. Es un timestamp paralelo a
 * los estados de entrega (el conductor puede ir en camino mientras se cocina),
 * por eso no cambia el enum `status`. Avisa al cliente y al repartidor asignado.
 */
export async function markOrderReadyByBusiness(
  businessId: string,
  orderId: string,
): Promise<ClientOrderSummaryDTO | null> {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.businessId !== businessId) return null;
  // Solo tiene sentido cuando está en preparación o el repartidor ya va/está.
  const okStates = ['PREPARING', 'DRIVER_TO_PICKUP', 'AT_PICKUP'];
  if (!okStates.includes(existing.status) || existing.readyAt) return null;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { readyAt: new Date() },
    include: { lines: true, business: { select: { name: true } } },
  });

  if (updated.driverId) {
    _sendToDriver?.(updated.driverId, { type: 'order_ready', orderId });
  }
  if (updated.userId) {
    void sendPushToClient(updated.userId, {
      title: 'Pedido listo',
      body: `Tu pedido en ${updated.business?.name ?? 'el negocio'} está listo y saldrá pronto.`,
      data: { type: 'order_ready', orderId },
    });
  }

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  return summary;
}

/**
 * Pedido visto por SU cliente: incluye el PIN que debe dar al repartidor para
 * recibirlo. `_toSummary` nunca lo añade (seguro por defecto: el repartidor
 * recibe el mismo DTO por WS y jamás debe ver PIN alguno); el PIN de recogida
 * pertenece al negocio y viaja solo en el portal de negocios.
 */
export type ClientOrderWithPinDTO = ClientOrderSummaryDTO & { deliveryPin?: string };

export async function getClientOrders(clientId: string): Promise<ClientOrderWithPinDTO[]> {
  const orders = await prisma.order.findMany({
    where: { userId: clientId },
    include: { lines: true, business: { select: { name: true, lat: true, lng: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const fichas = await fichasPorConductores(orders.map((o) => o.driverId));
  return Promise.all(
    orders.map((o) =>
      _withOrderGeo(
        {
          ..._toSummary(
            o, o.business?.name ?? 'Negocio', o.lines,
            o.driverId ? fichas.get(o.driverId) ?? {} : {},
          ),
          deliveryPin: o.deliveryPin ?? undefined,
        },
        o,
        o.business,
      ),
    ),
  );
}

export async function getClientOrderById(
  clientId: string,
  orderId: string,
): Promise<ClientOrderWithPinDTO | null> {
  const o = await prisma.order.findFirst({
    where: { id: orderId, userId: clientId },
    include: { lines: true, business: { select: { name: true, lat: true, lng: true } } },
  });
  if (!o) return null;
  return _withOrderGeo(
    {
      ..._toSummary(
        o, o.business?.name ?? 'Negocio', o.lines,
        await fichaPorConductor(o.driverId),
      ),
      deliveryPin: o.deliveryPin ?? undefined,
    },
    o,
    o.business,
  );
}

/**
 * Pedidos de la app vistos por SU negocio: incluyen el PIN de RECOGIDA, que el
 * dueño dicta al repartidor al entregarle el pedido. Nunca el de entrega —ese
 * es del cliente— ni ninguno de los dos al repartidor.
 */
export type BusinessOrderWithPinDTO = ClientOrderSummaryDTO & { pickupPin?: string };

export async function getClientOrdersForBusiness(
  businessId: string,
): Promise<BusinessOrderWithPinDTO[]> {
  const orders = await prisma.order.findMany({
    where: { businessId },
    include: { lines: true, business: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return orders.map((o) => ({
    ..._toSummary(o, o.business?.name ?? 'Negocio', o.lines),
    pickupPin: o.pickupPin ?? undefined,
  }));
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
  return _toSummary(
    o, o.business?.name ?? 'Negocio', o.lines,
    await fichaPorConductor(o.driverId),
  );
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
  // El pedido llega al matching en PREPARING (el restaurante ya lo aceptó).
  if (!existing || existing.status !== 'PREPARING' || existing.driverId) return null;

  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { operatorId: true },
  });

  // Toma ATÓMICA: el pedido tiene que seguir en PREPARING y SIN repartidor. Dos
  // que aceptan a la vez pasaban los dos el `if` de arriba y el segundo pisaba
  // la asignación del primero: dos repartidores camino del mismo restaurante y
  // solo uno con el pedido de verdad.
  const tomado = await prisma.order.updateMany({
    where: { id: orderId, status: 'PREPARING', driverId: null },
    data: {
      status: 'DRIVER_TO_PICKUP',
      driverId,
      driverName,
      driverPhone,
      ...(d?.operatorId ? { operatorId: d.operatorId } : {}),
    },
  });
  if (tomado.count === 0) return null; // otro llegó antes

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lines: true, business: { select: { name: true } } },
  });
  if (!updated) return null;

  // El repartidor queda ocupado para el matching mientras entrega.
  await prisma.driver
    .update({ where: { id: driverId }, data: { status: 'ON_TRIP' } })
    .catch(() => { /* noop */ });

  // Push FCM en paralelo al WS: el cliente se entera aunque tenga la app cerrada.
  if (updated.userId) {
    void sendPushToClient(updated.userId, {
      title: 'Repartidor asignado',
      body: `${driverName} recogerá tu pedido en ${updated.business?.name ?? 'el negocio'}.`,
      data: { type: 'order_accepted', orderId },
    });
  }

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
  // Ya no hay pedido que despachar: deja de buscar repartidor.
  cancelSearchRetry(`order:${orderId}`);
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: clientId } });
  if (!order) return false;
  const cancellable = ['PENDING', 'CONFIRMED', 'PREPARING', 'DRIVER_TO_PICKUP', 'AT_PICKUP'];
  if (!cancellable.includes(order.status)) return false;
  clearOrderAcceptTimer(orderId);
  await restoreOrderStock(orderId);

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

/**
 * Cancela un pedido por decisión del ADMINISTRADOR, sin las restricciones del
 * cliente (que no puede cancelar más allá de AT_PICKUP).
 *
 * El admin que desatasca a un repartidor desaparecido necesita cerrar también
 * los pedidos que lleva IN_TRANSIT: si no, el cliente se queda viendo "en
 * camino" indefinidamente y el negocio creyendo que el pedido va de salida.
 *
 * **No se devuelve el stock cuando el pedido ya salió del local.** La mercancía
 * salió de verdad; reponerla en el inventario haría que el negocio vendiera algo
 * que ya no tiene. Solo se restituye en los estados previos a la recogida, que
 * es lo que hace el camino del cliente.
 */
export async function cancelOrderByAdmin(orderId: string): Promise<boolean> {
  cancelSearchRetry(`order:${orderId}`);
  clearOrderAcceptTimer(orderId);

  const previo = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, driverId: true } });
  if (!previo) return false;
  const antesDeSalir = ['PENDING', 'CONFIRMED', 'PREPARING', 'DRIVER_TO_PICKUP', 'AT_PICKUP'] as const;

  // La cancelación PRIMERO, con su guard de estado, y solo después se repone el
  // stock. Al revés —que es como estaba— si el pedido pasaba a entregado entre
  // la lectura y el update, el `updateMany` devolvía 0 y la cancelación no se
  // aplicaba, pero las existencias ya se habían devuelto: el negocio quedaba
  // vendiendo mercancía que sí había salido.
  const res = await prisma.order.updateMany({
    where: { id: orderId, status: { in: [...antesDeSalir, 'IN_TRANSIT' as const] } },
    data: { status: 'CANCELLED' },
  });
  if (res.count === 0) return false;

  if ((antesDeSalir as readonly string[]).includes(previo.status)) await restoreOrderStock(orderId);

  const updated = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: true, business: { select: { name: true } } },
  });
  if (previo.driverId) _sendToDriver?.(previo.driverId, { type: 'order_cancelled', orderId });

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
  pin?: string,
): Promise<ClientOrderSummaryDTO | null> {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.driverId !== driverId) return null;

  // Cadena de custodia: recoger exige el PIN del negocio y entregar el del
  // cliente. Lanza CustodyPinError (mensaje en español) si falta o no coincide.
  if (status === 'in_transit') {
    assertCustodyPin(existing.pickupPin, pin, 'recogida');
  } else if (status === 'delivered') {
    assertCustodyPin(existing.deliveryPin, pin, 'entrega');
  }

  const map = {
    at_pickup: 'AT_PICKUP',
    in_transit: 'IN_TRANSIT',
    delivered: 'DELIVERED',
  } as const;

  // Transición ATÓMICA con guarda de estado, igual que el viaje urbano: sin
  // ella un segundo "entregado" volvía a llamar a `recordCompletedTrip`, que
  // incrementa el acumulado del día, y el repartidor cobraba dos veces el mismo
  // domicilio. Se comprobaba el dueño (`driverId`) pero no si el pedido ya
  // estaba cerrado.
  const avance = await prisma.order.updateMany({
    where: {
      id: orderId,
      driverId,
      status: guardaNoTerminal('order') as { notIn: OrderStatus[] },
    },
    data: {
      status: map[status],
      ...(status === 'in_transit'
        ? { pickedUpAt: new Date(), pickupPinAt: new Date() }
        : {}),
      ...(status === 'delivered'
        ? { deliveredAt: new Date(), deliveryPinAt: new Date() }
        : {}),
    },
  });

  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lines: true, business: { select: { name: true } } },
  });
  if (!updated) return null;

  // Perdió la carrera o el pedido ya estaba cerrado: se devuelve el estado real
  // sin liquidar de nuevo ni volver a avisar.
  if (avance.count === 0) {
    return _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  }

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

  if (updated.userId && status === 'in_transit') {
    void sendPushToClient(updated.userId, {
      title: 'Tu pedido va en camino',
      body: `${updated.business?.name ?? 'El negocio'} despachó tu pedido.`,
      data: { type: 'order_in_transit', orderId },
    });
  } else if (updated.userId && status === 'delivered') {
    void sendPushToClient(updated.userId, {
      title: 'Pedido entregado',
      body: 'Tu pedido fue entregado. ¡Gracias por comprar con ZIPA!',
      data: { type: 'order_delivered', orderId },
    });
  }

  const summary = _toSummary(updated, updated.business?.name ?? 'Negocio', updated.lines);
  for (const cb of orderListeners.get(orderId) ?? []) cb(orderId, summary);
  return summary;
}

// ─── Client Trips ─────────────────────────────────────────────────────────────

/**
 * Método de pago admitido, o null. No se guarda lo que mande el teléfono tal
 * cual: es un campo que después decide qué se le muestra al conductor, y un
 * valor inventado ahí le diría cualquier cosa.
 */
function _saneaMetodoPago(v: string | undefined): string | null {
  const m = (v ?? '').trim().toLowerCase();
  return ['efectivo', 'transferencia', 'en_linea'].includes(m) ? m : null;
}

export async function requestClientTrip(clientId: string, dto: RequestClientTripDTO): Promise<ClientTripWithPinDTO> {
  const requestRef = `NXM-${Math.floor(1000 + Math.random() * 8000)}`;
  // 'transporte' es el nombre que usa la app cliente para el servicio de carro
  // particular/taxi — se acepta como alias para no romper el contrato REST.
  const normalized = dto.serviceType.toLowerCase() === 'transporte' ? 'particular' : dto.serviceType;
  const serviceType = normalized.toUpperCase() as 'TAXI' | 'MOTO' | 'PARTICULAR' | 'ENVIOS';
  // Las coordenadas NO se inventan. Antes, si la app no las mandaba (que es lo
  // que pasa siempre que el autocompletado no tiene llave de Google y la
  // persona escribe la dirección a mano), aquí se ponía el obelisco de
  // Pamplona como origen y un punto a 800 m en diagonal como destino. El daño
  // no era solo que el mapa dibujara un trayecto falso: `startMatchingCycle`
  // busca conductores alrededor del origen, así que un pasajero de otra ciudad
  // se emparejaba contra el centro de Pamplona y no aparecía nadie — sin que
  // ni él ni nosotros supiéramos por qué. Sin punto real no hay viaje que
  // despachar, y decirlo es mejor que fingir uno.
  const { lat: originLat, lng: originLng } = exigirPuntoRecogida(
    dto.originLat,
    dto.originLng,
  );
  const { lat: destLat, lng: destLng } = exigirPuntoDestino(
    dto.destLat,
    dto.destLng,
  );

  // EL PRECIO LO CALCULA EL SERVIDOR, SIEMPRE.
  //
  // Hasta aquí llegaban `estimatedFare`, `distanceKm` y `etaMinutes` desde el
  // teléfono y se guardaban tal cual. Eso significaba dos cosas: que una
  // petición modificada podía pedir una carrera de $1 —el conductor la habría
  // visto y aceptado— y que el precio dependía de la fórmula que tuviera
  // instalada esa app, no de la tarifa vigente. Ahora se recalcula aquí con la
  // misma tabla que cotizó las opciones, y los números del cliente se
  // descartan. Para un TAXI eso además garantiza que se cobre el decreto.
  // Se validan ANTES de medir y de crear: una parada sin nombre o siete
  // paradas tienen que fallar con un mensaje claro, no a medio camino.
  const paradas = sanitizeStops(dto.stops);
  const paradasCoord = (dto.stops ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));

  const categoria = categoriaDeServicio(serviceType);
  let estimatedFare: number | undefined;
  let distanceKm: number | undefined;
  let etaMinutes: number | undefined;
  let surgeMultiplier = 1;

  if (categoria) {
    const p = await precioServidor(
      categoria, originLat, originLng, destLat, destLng, paradasCoord,
    );
    estimatedFare = p.fare;
    distanceKm = p.distanceKm;
    etaMinutes = p.durationMinutes;
    surgeMultiplier = p.surge;
  } else {
    // ENVIOS: no es una categoría de pasajero, pero el trayecto tampoco se le
    // cree al teléfono — se mide y se cobra con la fórmula genérica.
    const t = await medirConParadas(
      originLat, originLng, destLat, destLng, paradasCoord,
    );
    const { multiplier } = await getSurgeMultiplier(originLat, originLng);
    surgeMultiplier = multiplier;
    distanceKm = t.distanceKm;
    etaMinutes = t.durationMinutes;
    estimatedFare = Math.round(
      calcFare(t.distanceKm, t.durationMinutes).grossFare * multiplier,
    );
  }

  const trip = await prisma.trip.create({
    data: {
      requestRef,
      passengerId: clientId,
      serviceType,
      status: 'SEARCHING',
      // Solo los ENVÍOS llevan PIN: es mercancía que cambia de manos y hay que
      // poder probar que llegó a quien debía. Un pasajero no necesita PIN para
      // bajarse del carro.
      deliveryPin: serviceType === 'ENVIOS' ? generatePin() : null,
      originAddress: dto.originAddress,
      originLat,
      originLng,
      destAddress: dto.destinationAddress,
      destLat,
      destLng,
      ...(paradas !== undefined ? { stops: paradas } : {}),
      estimatedFare,
      surgeMultiplier,
      distanceKm,
      etaMinutes,
      paymentMethod: _saneaMetodoPago(dto.paymentMethod),
      recipientName: dto.recipientName,
      recipientPhone: dto.recipientPhone,
      packageDescription: dto.packageDescription,
    },
  });

  // Kick off geo-matching asynchronously — does not block the REST response.
  void startMatchingCycle(trip.id, trip.originLat, trip.originLng);

  // El PIN va SOLO en esta respuesta (y en las vistas propias del cliente):
  // es quien recibe el paquete el que debe conocerlo.
  return _conPin(_toTripDTO(trip, clientId), trip.deliveryPin);
}

// (acceptClientTrip + _startTripSimulation eliminados: eran restos del flujo
// demo. La aceptación real es transaccional en matching.service.onDriverAccept.)

export async function updateClientTripLocation(tripId: string, _lat: number, _lng: number): Promise<string | null> {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { passengerId: true } });
  if (!trip) return null;
  // Location updates are ephemeral; we don't persist per-update lat/lng to trips table
  return trip.passengerId;
}

export async function updateClientTripStatus(
  tripId: string,
  status: ClientTripStatus,
  pin?: string,
): Promise<ClientTripDTO | null> {
  const prismaStatus = status.toUpperCase() as 'SEARCHING' | 'ACCEPTED' | 'ARRIVING' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

  // Al COMPLETAR se liquida el viaje real: se calcula la tarifa, se persisten
  // finalFare/netEarning/commission, se registra la ganancia del conductor (que
  // alimenta wallet + dashboard) y se libera al conductor (ONLINE). Sin esto, un
  // viaje real completado dejaba saldo en cero.
  if (status === 'completed') {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        distanceKm: true, etaMinutes: true, driverId: true, originAddress: true,
        destAddress: true, finalFare: true, serviceType: true, deliveryPin: true,
        surgeMultiplier: true,
      },
    });
    // Envío = mercancía que cambia de manos. Sin el PIN de quien recibe no se
    // cierra: es lo único que prueba que el paquete llegó a su destinatario y
    // no al bolsillo del repartidor. Lanza si no coincide.
    if (trip?.serviceType === 'ENVIOS') {
      assertCustodyPin(trip.deliveryPin, pin, 'entrega');
    }
    const distanceKm = trip?.distanceKm ?? 0;
    const minutes = trip?.etaMinutes ?? Math.max(1, Math.round(distanceKm * 3));
    // Se cobra con la MISMA tabla con la que se cotizó, incluido el
    // multiplicador que se le mostró al pasajero. Antes aquí estaba la fórmula
    // genérica: un taxi se cotizaba por decreto y se cobraba por otra cosa.
    const { grossFare, commission, netEarning } = liquidarViaje(
      trip?.serviceType,
      distanceKm,
      minutes,
      trip?.surgeMultiplier ?? 1,
    );

    // Cierre ATÓMICO. La guarda va en el `where`, no en un `if` previo: entre
    // leer el estado y escribirlo hay una ventana por la que pasan las dos
    // peticiones, y como `recordCompletedTrip` INCREMENTA el acumulado del día
    // (no puede ser idempotente), un segundo "completado" le paga al conductor
    // el viaje dos veces. Un segundo mensaje es de lo más fácil que hay: un
    // doble toque, una reconexión del WebSocket que reenvía, un reintento tras
    // un `ack` perdido. Y al revés: sin esto, un "completado" que llega tarde
    // revive un viaje que el pasajero ya canceló, y encima lo cobra.
    const cierre = await prisma.trip.updateMany({
      where: { id: tripId, status: guardaNoTerminal('trip') as { notIn: TripStatus[] } },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        // Si ya se selló una tarifa final, se respeta; si no, la calculada.
        finalFare: trip?.finalFare ?? grossFare,
        netEarning,
        commission,
      },
    });

    const updated = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!updated) return null;

    // Otro llegó antes (o el viaje ya estaba cerrado): se devuelve el estado
    // real SIN volver a liquidar ni volver a tocar al conductor.
    if (cierre.count === 0) {
      return _toTripDTO(updated, updated.passengerId ?? '');
    }

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

  // Mismo motivo que arriba, sin dinero de por medio pero igual de confuso: un
  // `arriving` que llega tarde no debe resucitar un viaje ya cancelado y
  // ponerle al pasajero "tu conductor está llegando" a un viaje que él anuló.
  const avance = await prisma.trip.updateMany({
    where: { id: tripId, status: guardaNoTerminal('trip') as { notIn: TripStatus[] } },
    data: { status: prismaStatus },
  });
  const updated = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!updated) return null;
  const dto = _toTripDTO(updated, updated.passengerId ?? '');
  // Si no cambió nada, tampoco se avisa: sería repetir el último estado.
  if (avance.count > 0) {
    _notifyTripListeners(tripId, updated.passengerId ?? '', dto);
  }
  return dto;
}

export async function cancelClientTrip(clientId: string, tripId: string): Promise<boolean> {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, passengerId: clientId } });
  if (!trip) return false;
  const cancellable = ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED'];
  if (!cancellable.includes(trip.status)) return false;
  // El pasajero se echó atrás: se deja de buscarle conductor.
  cancelSearchRetry(`trip:${tripId}`);
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

export async function getActiveClientTrip(clientId: string): Promise<ClientTripWithPinDTO | null> {
  const active = ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'];
  const trip = await prisma.trip.findFirst({
    where: { passengerId: clientId, status: { in: active as never[] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!trip) return null;
  // Vista propia del cliente: aquí sí va el PIN (así lo recupera si reinstala
  // la app o pierde el estado local con un envío en curso).
  return _conPin(_toTripDTO(trip, clientId), trip.deliveryPin);
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
  return trips.map((trip) =>
    _toTripDTO(trip, clientId, {
      driver: trip.driver,
      vehicle: trip.driver?.vehicles[0],
    }),
  );
}

export async function getClientTripRaw(
  tripId: string,
): Promise<{ clientId: string; driverId: string | null } | undefined> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { passengerId: true, driverId: true },
  });
  if (!trip?.passengerId) return undefined;
  return { clientId: trip.passengerId, driverId: trip.driverId };
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

/**
 * Snapshot del viaje. Por defecto SIN el PIN: este mismo objeto se emite por WS
 * a los suscriptores y se le devuelve al conductor en `trip_accepted`.
 *
 * `incluirPin` solo lo activa la ruta REST del cliente, que ya comprobó que el
 * viaje es suyo.
 */
export async function getClientTripSnapshot(
  tripId: string,
  incluirPin = false,
): Promise<ClientTripWithPinDTO | null> {
  // Incluye la identidad del conductor asignado para que el fallback por
  // polling REST pinte lo mismo que el WS (nombre, vehículo y su TIPO real).
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      driver: { include: { vehicles: { where: { isActive: true }, take: 1 } } },
    },
  });
  if (!trip) return null;
  const dto = _toTripDTO(trip, trip.passengerId ?? '', {
    driver: trip.driver,
    vehicle: trip.driver?.vehicles[0],
  });
  return incluirPin ? _conPin(dto, trip.deliveryPin) : dto;
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
  const dto = _toTripDTO(trip, trip.passengerId, {
    driver: trip.driver,
    vehicle: trip.driver?.vehicles[0],
  });
  _notifyTripListeners(tripId, trip.passengerId, dto);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PrismaOrder = {
  id: string; orderRef: string; businessId: string; status: string; subtotal: number;
  deliveryFee: number; total: number; etaMinutes: number | null; deliveryAddress: string;
  pickupPhotoUrl: string | null; deliveryPhotoUrl: string | null; hasSignature: boolean;
  createdAt: Date; pickedUpAt: Date | null; deliveredAt: Date | null;
  driverName: string | null; driverPhone: string | null; customerName: string | null;
  prepMinutes: number | null; acceptedAt: Date | null; readyAt: Date | null;
  deliveryLat?: number | null; deliveryLng?: number | null;
};

type PrismaOrderLine = {
  productName: string; quantity: number; unitPrice: number; subtotal: number;
  optionsSummary?: string | null;
  notes?: string | null;
};

function _toSummary(
  o: PrismaOrder,
  businessName: string,
  lines: PrismaOrderLine[],
  ficha: DriverCardFields = {},
): ClientOrderSummaryDTO {
  const statusMap: Record<string, string> = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PREPARING: 'preparing',
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
    items: lines.map((l) => ({
      productName: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      subtotal: l.subtotal,
      optionsSummary: l.optionsSummary ?? undefined,
      // La nota va en el mismo DTO que ve la cocina y que ve el cliente: el
      // "sin cebolla" tiene que llegar a quien prepara el plato.
      notes: l.notes ?? undefined,
    })),
    deliveryAddress: o.deliveryAddress,
    driverName: o.driverName || undefined,
    // Privacy: never expose the driver's real number to the passenger.
    driverPhone: maskPhone(o.driverPhone),
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(o.driverPhone),
    // Foto, calificación y placa del repartidor: el pedido solo guarda su
    // nombre desnormalizado, así que la ficha la resuelve quien llama.
    ...ficha,
    pickupPhotoUrl: o.pickupPhotoUrl ?? undefined,
    deliveryPhotoUrl: o.deliveryPhotoUrl ?? undefined,
    hasSignature: o.hasSignature,
    createdAt: o.createdAt.toISOString(),
    pickedUpAt: o.pickedUpAt?.toISOString(),
    deliveredAt: o.deliveredAt?.toISOString(),
    prepMinutes: o.prepMinutes ?? undefined,
    acceptedAt: o.acceptedAt?.toISOString(),
    readyAt: o.readyAt?.toISOString(),
    deliveryLat: o.deliveryLat ?? undefined,
    deliveryLng: o.deliveryLng ?? undefined,
  };
}

/**
 * Añade al pedido la geografía que el cliente necesita para seguirlo de
 * verdad: dónde está el negocio y dónde va su repartidor ahora mismo.
 *
 * Antes el mapa de seguimiento inventaba esas posiciones con el hash del
 * nombre del negocio y del texto de la dirección — un dibujo bonito que no
 * decía nada. Si el negocio no tiene coordenadas (los registrados por
 * autoservicio no las capturaban), se devuelve sin ellas y la app oculta el
 * mapa: mejor nada que algo falso.
 */
async function _withOrderGeo(
  dto: ClientOrderWithPinDTO,
  o: { businessId: string; driverId: string | null; status: string },
  businessGeo?: { lat: number | null; lng: number | null } | null,
): Promise<ClientOrderWithPinDTO> {
  if (businessGeo?.lat != null && businessGeo.lng != null) {
    dto.businessLat = businessGeo.lat;
    dto.businessLng = businessGeo.lng;
  }
  const enCurso = o.status === 'DRIVER_TO_PICKUP' || o.status === 'AT_PICKUP' || o.status === 'IN_TRANSIT';
  if (o.driverId && enCurso) {
    const d = await prisma.driver.findUnique({
      where: { id: o.driverId },
      select: { lastLat: true, lastLng: true },
    });
    if (d?.lastLat != null && d.lastLng != null) {
      dto.driverLat = d.lastLat;
      dto.driverLng = d.lastLng;
    }
  }
  return dto;
}

type PrismaTrip = {
  id: string; requestRef: string; serviceType: string; status: string;
  originAddress: string; destAddress: string; estimatedFare: number;
  finalFare: number | null;
  distanceKm: number | null; etaMinutes: number | null;
  createdAt: Date; acceptedAt: Date | null; completedAt: Date | null;
  recipientName: string | null; recipientPhone: string | null; packageDescription: string | null;
  deliveryPin?: string | null;
  paymentMethod?: string | null;
  stops?: unknown;
};

/**
 * Viaje visto por SU cliente: incluye el PIN de custodia del envío.
 *
 * `_toTripDTO` nunca lo añade (seguro por defecto: ese mismo DTO viaja al
 * conductor en `trip_accepted` y a todos los suscriptores del WS). Solo estas
 * vistas del cliente, con propiedad ya verificada, lo exponen. Mismo patrón que
 * `ClientOrderWithPinDTO` y `ClientErrandWithPinsDTO`.
 */
export type ClientTripWithPinDTO = ClientTripDTO & { deliveryPin?: string };

function _conPin(dto: ClientTripDTO, pin: string | null | undefined): ClientTripWithPinDTO {
  return pin ? { ...dto, deliveryPin: pin } : dto;
}

/**
 * Ficha del conductor y su vehículo tal como la pinta el pasajero.
 *
 * Antes solo viajaba `"Marca Modelo • PLACA"` concatenado aquí: la app recibía
 * una cadena y no podía hacer nada con ella salvo imprimirla en gris. La placa
 * en su recuadro, el color del carro y la cara del conductor —lo que de verdad
 * mira alguien antes de subirse— son campos distintos, así que se mandan
 * distintos y que sea la app quien decida cómo maquetarlos.
 */
interface FichaConductor {
  driver?: {
    name: string; phone: string; avatarUrl: string | null;
    rating: number; totalTrips: number; isVerified: boolean; createdAt: Date;
  } | null;
  vehicle?: {
    brand: string; model: string; color: string; plate: string;
    type: string; photoUrl: string | null;
  } | null;
}

function _fichaToDTO(f: FichaConductor): Partial<ClientTripDTO> {
  return {
    driverName: f.driver?.name,
    // Privacidad: el pasajero ve una referencia enmascarada, no el número real.
    driverPhone: maskPhone(f.driver?.phone),
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(f.driver?.phone),
    ...fichaFromDriver(f.driver, f.vehicle),
  };
}

function _toTripDTO(trip: PrismaTrip, _passengerId: string, ficha?: FichaConductor): ClientTripDTO {
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
    paymentMethod: trip.paymentMethod ?? undefined,
    distanceKm: trip.distanceKm ?? 0,
    etaMinutes: trip.etaMinutes ?? 0,
    status: statusMap[trip.status] ?? 'searching',
    // Las paradas viajan también al conductor (este DTO es el de
    // `trip_accepted`): tiene que saber por dónde pasa ANTES de aceptar.
    ...(stopsFromDb(trip.stops) ? { stops: stopsFromDb(trip.stops) } : {}),
    ...(ficha ? _fichaToDTO(ficha) : {}),
    createdAt: trip.createdAt.toISOString(),
    acceptedAt: trip.acceptedAt?.toISOString(),
    completedAt: trip.completedAt?.toISOString(),
    recipientName: trip.recipientName ?? undefined,
    recipientPhone: trip.recipientPhone ?? undefined,
    packageDescription: trip.packageDescription ?? undefined,
  };
}
