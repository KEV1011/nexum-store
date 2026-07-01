import {
  IntercityCity,
  IntercitySeats,
  IntercityStatus,
  RequestIntercityDTO,
  IntercityBookingDTO,
} from '../types';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { getDriverProfile } from './driver-profile.service';
import { sendPushToDriver } from './push.service';
import {
  routeRequiresLicensedOperator,
  getIntercityRoute,
  INTERCITY_DUAL_MODEL,
  INTERCITY_SIMULATE,
  INTERCITY_CITY_COORDS,
} from '../config/constants';

export class IntercityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntercityError';
  }
}

// ─── Ephemeral WS subscription state ──────────────────────────────────────────
type BookingCallback = (bookingId: string, booking: IntercityBookingDTO) => void;
const bookingListeners = new Map<string, Set<BookingCallback>>();

// ─── Enum mappings ─────────────────────────────────────────────────────────────

const SEATS_TO_PRISMA: Record<IntercitySeats, 'ONE' | 'TWO' | 'THREE' | 'FLEET'> = {
  one: 'ONE', two: 'TWO', three: 'THREE', fleet: 'FLEET',
};

const SEATS_FROM_PRISMA: Record<string, IntercitySeats> = {
  ONE: 'one', TWO: 'two', THREE: 'three', FLEET: 'fleet',
};

const STATUS_FROM_PRISMA: Record<string, IntercityStatus> = {
  SEARCHING: 'searching', DRIVER_FOUND: 'driver_found', CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELLED: 'cancelled',
};

const CITY_TO_PRISMA: Record<IntercityCity, 'PAMPLONA' | 'CUCUTA' | 'BUCARAMANGA' | 'CHITAGA' | 'MALAGA' | 'OCANA' | 'BOGOTA'> = {
  pamplona: 'PAMPLONA', cucuta: 'CUCUTA', bucaramanga: 'BUCARAMANGA',
  chitaga: 'CHITAGA', malaga: 'MALAGA', ocana: 'OCANA', bogota: 'BOGOTA',
};

const CITY_FROM_PRISMA: Record<string, IntercityCity> = {
  PAMPLONA: 'pamplona', CUCUTA: 'cucuta', BUCARAMANGA: 'bucaramanga',
  CHITAGA: 'chitaga', MALAGA: 'malaga', OCANA: 'ocana', BOGOTA: 'bogota',
};

// ─── Mock driver pool for simulation (solo con INTERCITY_SIMULATE=true) ──────
const MOCK_INTERCITY_DRIVERS = [
  { name: 'Hernán Castellanos', phone: '+57 311 789 0123', vehicle: 'Toyota Fortuner Gris 2022 • TJK 451' },
  { name: 'Wilson Durán', phone: '+57 317 654 3210', vehicle: 'Chevrolet Captiva Blanca 2021 • MPN 334' },
  { name: 'Ramiro Sepúlveda', phone: '+57 313 456 0987', vehicle: 'Nissan X-Trail Negra 2023 • OPS 876' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DbBooking = {
  id: string; requestRef: string; userId: string;
  origin: string; destination: string; departureTime: Date; seats: string;
  offeredFare: number; counterFare: number | null; status: string;
  driverName: string | null; driverPhone: string | null; driverVehicle: string | null;
  pickupAddress: string | null; dropoffAddress: string | null; notes: string | null;
  createdAt: Date; confirmedAt: Date | null;
  rating?: number | null; ratingComment?: string | null;
};

function _toDTO(b: DbBooking): IntercityBookingDTO {
  return {
    id: b.id,
    requestRef: b.requestRef,
    origin: (CITY_FROM_PRISMA[b.origin] ?? b.origin.toLowerCase()) as IntercityCity,
    destination: (CITY_FROM_PRISMA[b.destination] ?? b.destination.toLowerCase()) as IntercityCity,
    departureTime: b.departureTime.toISOString(),
    seats: (SEATS_FROM_PRISMA[b.seats] ?? 'one') as IntercitySeats,
    offeredFare: b.offeredFare,
    counterFare: b.counterFare ?? undefined,
    status: (STATUS_FROM_PRISMA[b.status] ?? 'searching') as IntercityStatus,
    driverName: b.driverName ?? undefined,
    // Privacy: masked reference only, communication via in-app chat.
    driverPhone: maskPhone(b.driverPhone),
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(b.driverPhone),
    driverVehicle: b.driverVehicle ?? undefined,
    pickupAddress: b.pickupAddress ?? undefined,
    dropoffAddress: b.dropoffAddress ?? undefined,
    notes: b.notes ?? undefined,
    createdAt: b.createdAt.toISOString(),
    confirmedAt: b.confirmedAt?.toISOString(),
    rating: b.rating ?? undefined,
    ratingComment: b.ratingComment ?? undefined,
  };
}

function _notify(bookingId: string, dto: IntercityBookingDTO): void {
  for (const cb of bookingListeners.get(bookingId) ?? []) cb(bookingId, dto);
}

function _scheduleDriverResponse(bookingId: string, offeredFare: number): void {
  const delayMs = Math.random() * 6000 + 6000;
  const hasCounter = Math.random() > 0.45;

  setTimeout(() => {
    void (async () => {
      const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
      if (!b || b.status !== 'SEARCHING') return;

      const driver = MOCK_INTERCITY_DRIVERS[Math.floor(Math.random() * MOCK_INTERCITY_DRIVERS.length)]!;

      let updated: DbBooking;
      if (hasCounter) {
        const pct = 0.05 + Math.random() * 0.10;
        const counterFare = Math.round((offeredFare * (1 + pct)) / 1000) * 1000;
        updated = await prisma.intercityBooking.update({
          where: { id: bookingId },
          data: {
            status: 'DRIVER_FOUND',
            driverName: driver.name,
            driverPhone: driver.phone,
            driverVehicle: driver.vehicle,
            counterFare,
          },
        }) as DbBooking;
      } else {
        updated = await prisma.intercityBooking.update({
          where: { id: bookingId },
          data: {
            status: 'CONFIRMED',
            driverName: driver.name,
            driverPhone: driver.phone,
            driverVehicle: driver.vehicle,
            confirmedAt: new Date(),
          },
        }) as DbBooking;
      }
      _notify(bookingId, _toDTO(updated));
    })();
  }, delayMs);
}

// ─── Real driver matching (PostGIS offer cycle) ───────────────────────────────
//
// Cuando se crea una IntercityBooking en SEARCHING se busca conductores
// reales: ONLINE, verificados, con `intercityEnabled` y cerca de la ciudad de
// origen (PostGIS, centroide municipal). La reserva se ofrece a un conductor a
// la vez por WebSocket (`intercity_request`), con timeout y avance al
// siguiente candidato — el mismo patrón que los viajes urbanos
// (matching.service.ts). El mock _scheduleDriverResponse queda solo detrás de
// INTERCITY_SIMULATE para demos.

const INTERCITY_OFFER_TIMEOUT_MS = 30_000;
const INTERCITY_SEARCH_RADIUS_M = 25_000; // cubre el casco urbano del municipio
const INTERCITY_MAX_CANDIDATES = 5;
const INTERCITY_GEO_FRESHNESS_S = 600;    // intermunicipal tolera fixes de 10 min

interface IntercityOfferState {
  bookingId: string;
  candidates: string[];
  candidateIndex: number;
  currentDriverId: string;
  timeout: NodeJS.Timeout;
}

// bookingId → oferta activa (a lo sumo una a la vez por reserva)
const intercityOffers = new Map<string, IntercityOfferState>();
// bookingId → conductores que ya rechazaron (no volver a ofrecerles)
const intercityDeclined = new Map<string, Set<string>>();

// Inyectado por ws.handler.ts al arrancar — este servicio no conoce sockets.
let _sendToDriver: ((driverId: string, msg: Record<string, unknown>) => void) | null = null;

export function registerIntercitySendToDriver(
  fn: (driverId: string, msg: Record<string, unknown>) => void,
): void {
  _sendToDriver = fn;
}

async function _findIntercityDrivers(
  origin: IntercityCity,
  dest: IntercityCity,
  exclude: Set<string>,
  requireLicensed: boolean,
): Promise<string[]> {
  const c = INTERCITY_CITY_COORDS[origin];

  // Ruta troncal (Option B): solo conductores afiliados a una empresa INTERCITY
  // o MIXTA habilitada (ACTIVE + verificada) que tenga AUTORIZADA esa ruta
  // origen→destino en operator_routes. Los códigos de ciudad provienen de un
  // mapa fijo (no de strings de usuario) y van parametrizados igualmente.
  const licensedFilter = requireLicensed
    ? Prisma.sql`
      AND d."operatorId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "operators" o
        WHERE o."id" = d."operatorId"
          AND o."status"::text = 'ACTIVE'
          AND o."isVerified" = true
          AND o."type"::text IN ('INTERCITY', 'MIXED')
      )
      AND EXISTS (
        SELECT 1 FROM "operator_routes" r
        WHERE r."operatorId" = d."operatorId"
          AND r."originCity" = ${CITY_TO_PRISMA[origin]}
          AND r."destCity" = ${CITY_TO_PRISMA[dest]}
          AND r."authorized" = true
      )`
    : Prisma.empty;

  // Parámetros internos (constantes + centroide de tabla fija): sin strings de
  // usuario. SQL parametrizado vía tagged template — nunca interpolación.
  const rows = await prisma.$queryRaw<Array<{ driver_id: string; distance_m: number }>>`
    SELECT d."id" AS driver_id,
           ST_Distance(
             d."geo",
             ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography
           ) AS distance_m
    FROM "drivers" d
    WHERE d."geo" IS NOT NULL
      AND d."status" = 'ONLINE'
      AND d."isVerified" = true
      AND d."intercityEnabled" = true
      AND d."lastSeenAt" >= now() - ${INTERCITY_GEO_FRESHNESS_S} * INTERVAL '1 second'
      AND ST_DWithin(
            d."geo",
            ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
            ${INTERCITY_SEARCH_RADIUS_M}
          )${licensedFilter}
    ORDER BY distance_m ASC
    LIMIT ${INTERCITY_MAX_CANDIDATES + 5}`;
  return rows
    .map((r) => r.driver_id)
    .filter((id) => !exclude.has(id))
    .slice(0, INTERCITY_MAX_CANDIDATES);
}

/** Arranca (o reinicia) el ciclo de oferta a conductores reales. */
export async function startIntercityMatching(bookingId: string): Promise<void> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.status !== 'SEARCHING') return;

  const origin = (CITY_FROM_PRISMA[b.origin] ?? 'pamplona') as IntercityCity;
  const dest = (CITY_FROM_PRISMA[b.destination] ?? 'cucuta') as IntercityCity;
  // En el modelo dual, las rutas troncales solo se ofrecen a flotas habilitadas.
  const requireLicensed = INTERCITY_DUAL_MODEL && routeRequiresLicensedOperator(origin, dest);
  const declined = intercityDeclined.get(bookingId) ?? new Set<string>();
  const candidates = await _findIntercityDrivers(origin, dest, declined, requireLicensed);
  if (candidates.length === 0) {
    // Sin datos personales en logs: solo ids técnicos.
    console.log(`[Intercity] No drivers available for booking ${bookingId}`);
    return;
  }
  await _offerIntercityTo(bookingId, candidates, 0);
}

async function _offerIntercityTo(
  bookingId: string,
  candidates: string[],
  index: number,
): Promise<void> {
  if (index >= candidates.length) {
    console.log(`[Intercity] All ${candidates.length} candidates exhausted for booking ${bookingId}`);
    return;
  }
  const driverId = candidates[index]!;

  // La reserva pudo cancelarse mientras tanto.
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.status !== 'SEARCHING') return;

  const dto = _toDTO(b as DbBooking);
  const route = getIntercityRoute(dto.origin, dto.destination);

  const timeout = setTimeout(() => {
    void driverRejectIntercity(driverId, bookingId, true);
  }, INTERCITY_OFFER_TIMEOUT_MS);

  intercityOffers.set(bookingId, {
    bookingId,
    candidates,
    candidateIndex: index,
    currentDriverId: driverId,
    timeout,
  });

  _sendToDriver?.(driverId, {
    type: 'intercity_request',
    booking: dto,
    route: route
      ? { distanceKm: route.distanceKm, durationMinutes: route.durationMinutes }
      : null,
    timeoutSeconds: Math.round(INTERCITY_OFFER_TIMEOUT_MS / 1000),
  });
  // Push FCM en paralelo al WS: despierta la app si está en background.
  void sendPushToDriver(driverId, {
    title: 'Solicitud intermunicipal',
    body: `${dto.origin} → ${dto.destination} · oferta $${Math.round(dto.offeredFare)}`,
    data: { type: 'intercity_request', bookingId },
  });
  console.log(
    `[Intercity] Offered booking ${bookingId} to driver ${driverId} ` +
      `(candidate ${index + 1}/${candidates.length})`,
  );
}

/**
 * El conductor acepta la reserva. Sin contraoferta queda CONFIRMED; con
 * contraoferta queda DRIVER_FOUND y el cliente decide (confirmar/rechazar),
 * igual que el contrato que ya consume la app cliente.
 */
export async function driverAcceptIntercity(
  driverId: string,
  bookingId: string,
  counterFare?: number,
): Promise<IntercityBookingDTO | null> {
  const state = intercityOffers.get(bookingId);
  if (!state || state.currentDriverId !== driverId) return null;
  clearTimeout(state.timeout);
  intercityOffers.delete(bookingId);

  let driverName = 'Conductor Nexum';
  let driverPhone: string | null = null;
  let driverVehicle: string | null = null;
  try {
    const profile = await getDriverProfile(driverId);
    driverName = profile.fullName;
    driverPhone = profile.phone;
    driverVehicle = profile.vehicleDescription;
  } catch { /* sin perfil completo; se ofrece igual */ }

  const hasCounter =
    typeof counterFare === 'number' && counterFare > 0;

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.intercityBooking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });
    if (!current || current.status !== 'SEARCHING') return null;
    return tx.intercityBooking.update({
      where: { id: bookingId },
      data: hasCounter
        ? {
            status: 'DRIVER_FOUND',
            driverId,
            driverName,
            driverPhone,
            driverVehicle,
            counterFare: Math.round(counterFare),
          }
        : {
            status: 'CONFIRMED',
            driverId,
            driverName,
            driverPhone,
            driverVehicle,
            confirmedAt: new Date(),
          },
    });
  });
  if (!updated) return null;

  const dto = _toDTO(updated as DbBooking);
  _notify(bookingId, dto);
  console.log(`[Intercity] Driver ${driverId} accepted booking ${bookingId}`);
  return dto;
}

/**
 * El conductor rechaza (o expira el timeout): avanza al siguiente candidato.
 * `fromTimeout` evita que un timeout viejo pise una oferta ya resuelta.
 */
export async function driverRejectIntercity(
  driverId: string,
  bookingId: string,
  fromTimeout = false,
): Promise<void> {
  const state = intercityOffers.get(bookingId);
  if (!state || state.currentDriverId !== driverId) return;
  if (!fromTimeout) clearTimeout(state.timeout);
  intercityOffers.delete(bookingId);

  const declined = intercityDeclined.get(bookingId) ?? new Set<string>();
  declined.add(driverId);
  intercityDeclined.set(bookingId, declined);

  await _offerIntercityTo(bookingId, state.candidates, state.candidateIndex + 1);
}

function _dispatchDriverSearch(bookingId: string, offeredFare: number): void {
  if (INTERCITY_SIMULATE) {
    _scheduleDriverResponse(bookingId, offeredFare);
  } else {
    void startIntercityMatching(bookingId);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function requestIntercityBooking(
  clientId: string,
  dto: RequestIntercityDTO,
): Promise<IntercityBookingDTO> {
  if (dto.origin === dto.destination) {
    throw new IntercityError('El origen y el destino deben ser diferentes.');
  }

  // Option B (dual model): las rutas troncales requieren empresa habilitada. En
  // vez de bloquearlas, se despachan EXCLUSIVAMENTE a conductores afiliados a un
  // operador INTERCITY/MIXTO verificado con esa ruta autorizada (ver el filtro en
  // _findIntercityDrivers). Solo si aún no hay ninguna empresa habilitada para el
  // trayecto se informa con claridad, en lugar de buscar en vano.
  if (INTERCITY_DUAL_MODEL && routeRequiresLicensedOperator(dto.origin, dto.destination)) {
    const licensed = await prisma.operatorRoute.count({
      where: {
        originCity: CITY_TO_PRISMA[dto.origin],
        destCity: CITY_TO_PRISMA[dto.destination],
        authorized: true,
        operator: { status: 'ACTIVE', isVerified: true, type: { in: ['INTERCITY', 'MIXED'] } },
      },
    });
    if (licensed === 0) {
      throw new IntercityError(
        'Esta ruta troncal requiere una empresa de transporte habilitada y aún no ' +
          'hay ninguna disponible para este trayecto. Vuelve a intentarlo más tarde.',
      );
    }
  }

  const requestRef = `NXI-${Math.floor(1000 + Math.random() * 8000)}`;
  const booking = await prisma.intercityBooking.create({
    data: {
      requestRef,
      userId: clientId,
      origin: CITY_TO_PRISMA[dto.origin],
      destination: CITY_TO_PRISMA[dto.destination],
      departureTime: new Date(dto.departureTime),
      seats: SEATS_TO_PRISMA[dto.seats],
      offeredFare: dto.offeredFare,
      status: 'SEARCHING',
      pickupAddress: dto.pickupAddress ?? null,
      dropoffAddress: dto.dropoffAddress ?? null,
      notes: dto.notes ?? null,
    },
  });
  _dispatchDriverSearch(booking.id, dto.offeredFare);
  return _toDTO(booking as DbBooking);
}

export async function confirmIntercityBooking(
  clientId: string,
  bookingId: string,
): Promise<IntercityBookingDTO | null> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) return null;
  if (b.status !== 'DRIVER_FOUND') return null;

  const updated = await prisma.intercityBooking.update({
    where: { id: bookingId },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });
  const dto = _toDTO(updated as DbBooking);
  _notify(bookingId, dto);
  return dto;
}

export async function rejectIntercityOffer(clientId: string, bookingId: string): Promise<boolean> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) return false;
  if (b.status !== 'DRIVER_FOUND') return false;

  const updated = await prisma.intercityBooking.update({
    where: { id: bookingId },
    data: {
      status: 'SEARCHING',
      driverId: null, driverName: null, driverPhone: null, driverVehicle: null,
      counterFare: null,
    },
  });
  // El conductor cuya contraoferta fue rechazada no vuelve a recibir la reserva.
  if (b.driverId) {
    const declined = intercityDeclined.get(bookingId) ?? new Set<string>();
    declined.add(b.driverId);
    intercityDeclined.set(bookingId, declined);
  }
  const dto = _toDTO(updated as DbBooking);
  _notify(bookingId, dto);
  _dispatchDriverSearch(bookingId, b.offeredFare);
  return true;
}

export async function cancelIntercityBooking(clientId: string, bookingId: string): Promise<boolean> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) return false;
  if (!['SEARCHING', 'DRIVER_FOUND', 'CONFIRMED'].includes(b.status)) return false;

  const updated = await prisma.intercityBooking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });

  // Limpieza del ciclo de oferta: avisar al conductor con la oferta pendiente.
  const state = intercityOffers.get(bookingId);
  if (state) {
    clearTimeout(state.timeout);
    intercityOffers.delete(bookingId);
    _sendToDriver?.(state.currentDriverId, {
      type: 'intercity_cancelled',
      bookingId,
    });
  }
  intercityDeclined.delete(bookingId);

  _notify(bookingId, _toDTO(updated as DbBooking));
  return true;
}

export async function getActiveIntercityBooking(clientId: string): Promise<IntercityBookingDTO | null> {
  const b = await prisma.intercityBooking.findFirst({
    where: { userId: clientId, status: { in: ['SEARCHING', 'DRIVER_FOUND', 'CONFIRMED', 'IN_PROGRESS'] } },
    orderBy: { createdAt: 'desc' },
  });
  return b ? _toDTO(b as DbBooking) : null;
}

export async function getIntercityBookingById(clientId: string, bookingId: string): Promise<IntercityBookingDTO | null> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) return null;
  return _toDTO(b as DbBooking);
}

/** Viajes terminados (completados o cancelados) del cliente, más reciente primero. */
export async function getIntercityHistory(clientId: string): Promise<IntercityBookingDTO[]> {
  const rows = await prisma.intercityBooking.findMany({
    where: { userId: clientId, status: { in: ['COMPLETED', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((b) => _toDTO(b as DbBooking));
}

/**
 * Califica un viaje completado (1-5 estrellas, comentario opcional).
 * Solo el dueño de la reserva puede calificar, una sola vez.
 */
export async function rateIntercityBooking(
  clientId: string,
  bookingId: string,
  rating: number,
  comment?: string,
): Promise<IntercityBookingDTO> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new IntercityError('La calificación debe ser un entero entre 1 y 5');
  }
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) throw new IntercityError('Reserva no encontrada');
  if (b.status !== 'COMPLETED') throw new IntercityError('Solo puedes calificar viajes completados');
  if (b.rating != null) throw new IntercityError('Este viaje ya fue calificado');

  const updated = await prisma.intercityBooking.update({
    where: { id: bookingId },
    data: { rating, ratingComment: comment?.trim() || null },
  });
  return _toDTO(updated as DbBooking);
}

export function subscribeIntercityBooking(bookingId: string, cb: BookingCallback): () => void {
  if (!bookingListeners.has(bookingId)) bookingListeners.set(bookingId, new Set());
  bookingListeners.get(bookingId)!.add(cb);
  return () => bookingListeners.get(bookingId)?.delete(cb);
}

export async function getIntercityBookingSnapshot(bookingId: string): Promise<IntercityBookingDTO | null> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  return b ? _toDTO(b as DbBooking) : null;
}
