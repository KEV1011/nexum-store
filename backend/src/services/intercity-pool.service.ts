import { sanitizeStops, stopsFromDb } from '../lib/trip-stops';
import {
  IntercityCity,
  PooledTripStatus,
  PublishPooledTripDTO,
  BookSeatsDTO,
  PooledTripDTO,
  SeatBookingDTO,
  SeatBookingStatus,
} from '../types';
import {
  getIntercityRoute,
  getMaxFarePerSeat,
  INTERCITY_REMOVE_CAP,
  INTERCITY_DUAL_MODEL,
} from '../config/constants';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';

// ─── Ephemeral WS subscription state ──────────────────────────────────────────
type TripCallback = (tripId: string, trip: PooledTripDTO) => void;
const tripListeners = new Map<string, Set<TripCallback>>();

const MAX_SEATS = 7;

export class PooledTripError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PooledTripError';
  }
}

// ─── Enum mappings ─────────────────────────────────────────────────────────────

const CITY_TO_PRISMA: Record<string, 'PAMPLONA' | 'CUCUTA' | 'BUCARAMANGA' | 'CHITAGA' | 'MALAGA' | 'OCANA' | 'BOGOTA'> = {
  pamplona: 'PAMPLONA', cucuta: 'CUCUTA', bucaramanga: 'BUCARAMANGA',
  chitaga: 'CHITAGA', malaga: 'MALAGA', ocana: 'OCANA', bogota: 'BOGOTA',
};

const CITY_FROM_PRISMA: Record<string, IntercityCity> = {
  PAMPLONA: 'pamplona', CUCUTA: 'cucuta', BUCARAMANGA: 'bucaramanga',
  CHITAGA: 'chitaga', MALAGA: 'malaga', OCANA: 'ocana', BOGOTA: 'bogota',
};

const STATUS_FROM_PRISMA: Record<string, PooledTripStatus> = {
  OPEN: 'open', FULL: 'full', DEPARTED: 'departed', COMPLETED: 'completed', CANCELLED: 'cancelled',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DbPooledTrip = {
  id: string; tripRef: string; driverId: string; driverName: string; driverPhone: string;
  vehicleDescription: string; origin: string; destination: string; departureTime: Date;
  totalSeats: number; farePerSeat: number; maxFarePerSeat: number; allowFleet: boolean;
  status: string; notes: string | null; createdAt: Date;
  stops?: unknown;
  operatorId?: string | null;
  bookings?: DbSeatBooking[];
};

type DbSeatBooking = {
  id: string; tripId: string; userId: string; passengerName: string; passengerPhone: string;
  seatsBooked: number; pickupAddress: string | null; notes: string | null; status: string; bookedAt: Date;
};

function _toBookingDTO(b: DbSeatBooking): SeatBookingDTO {
  return {
    id: b.id,
    tripId: b.tripId,
    passengerName: b.passengerName,
    // Privacy: the driver sees a masked reference, not the passenger's number.
    passengerPhone: maskPhone(b.passengerPhone) ?? '',
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(b.passengerPhone),
    seatsBooked: b.seatsBooked,
    pickupAddress: b.pickupAddress ?? undefined,
    notes: b.notes ?? undefined,
    status: (b.status === 'CONFIRMED' ? 'confirmed' : 'cancelled') as SeatBookingStatus,
    bookedAt: b.bookedAt.toISOString(),
  };
}

function _toDTO(t: DbPooledTrip, includeBookings: boolean): PooledTripDTO {
  const route = getIntercityRoute(
    (CITY_FROM_PRISMA[t.origin] ?? t.origin.toLowerCase()) as IntercityCity,
    (CITY_FROM_PRISMA[t.destination] ?? t.destination.toLowerCase()) as IntercityCity,
  );
  const confirmedBookings = (t.bookings ?? []).filter((b) => b.status === 'CONFIRMED');
  const takenSeats = confirmedBookings.reduce((sum, b) => sum + b.seatsBooked, 0);

  const dto: PooledTripDTO = {
    id: t.id,
    tripRef: t.tripRef,
    driverId: t.driverId,
    driverName: t.driverName,
    // Privacy: passengers see a masked reference, not the driver's number.
    driverPhone: maskPhone(t.driverPhone) ?? '',
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(t.driverPhone),
    vehicleDescription: t.vehicleDescription,
    origin: (CITY_FROM_PRISMA[t.origin] ?? t.origin.toLowerCase()) as IntercityCity,
    destination: (CITY_FROM_PRISMA[t.destination] ?? t.destination.toLowerCase()) as IntercityCity,
    departureTime: t.departureTime.toISOString(),
    totalSeats: t.totalSeats,
    availableSeats: t.totalSeats - takenSeats,
    farePerSeat: t.farePerSeat,
    maxFarePerSeat: t.maxFarePerSeat,
    allowFleet: t.allowFleet,
    status: (STATUS_FROM_PRISMA[t.status] ?? 'open') as PooledTripStatus,
    notes: t.notes ?? undefined,
    stops: stopsFromDb(t.stops),
    distanceKm: route?.distanceKm,
    durationMinutes: route?.durationMinutes,
    createdAt: t.createdAt.toISOString(),
    operatorId: t.operatorId ?? undefined,
  };

  if (includeBookings) {
    dto.bookings = confirmedBookings.map(_toBookingDTO);
  }
  return dto;
}

async function _fetchWithBookings(id: string): Promise<DbPooledTrip | null> {
  return prisma.pooledTrip.findUnique({
    where: { id },
    include: { bookings: true },
  }) as Promise<DbPooledTrip | null>;
}

function _notify(tripId: string, trip: PooledTripDTO): void {
  for (const cb of tripListeners.get(tripId) ?? []) cb(tripId, trip);
}

// ─── Driver: publish & manage ─────────────────────────────────────────────────

export interface PublishPooledTripOpts {
  /** Empresa que publica la salida — se sella en el registro. */
  operatorId?: string;
  /**
   * true cuando publica una empresa habilitada (verificada): las rutas
   * troncales del modelo dual SÍ están permitidas para ella — ese es
   * exactamente el propósito del modelo.
   */
  licensedOperator?: boolean;
}

export async function publishPooledTrip(
  driverId: string,
  driverName: string,
  driverPhone: string,
  dto: PublishPooledTripDTO,
  opts?: PublishPooledTripOpts,
): Promise<PooledTripDTO> {
  if (dto.origin === dto.destination) throw new PooledTripError('El origen y el destino no pueden ser iguales');
  const route = getIntercityRoute(dto.origin, dto.destination);
  if (!route) throw new PooledTripError(`No hay ruta definida entre ${dto.origin} y ${dto.destination}`);

  // Option B (dual model): trunk routes require a habilitated operator.
  if (INTERCITY_DUAL_MODEL && route.requiresLicensedOperator && !opts?.licensedOperator) {
    throw new PooledTripError(
      'Esta es una ruta troncal que requiere operador de transporte habilitado. ' +
        'Por ahora no está disponible para conductores particulares.',
    );
  }

  if (!Number.isInteger(dto.totalSeats) || dto.totalSeats < 1 || dto.totalSeats > MAX_SEATS) {
    throw new PooledTripError(`Los puestos deben estar entre 1 y ${MAX_SEATS}`);
  }
  const departure = new Date(dto.departureTime);
  if (Number.isNaN(departure.getTime()) || departure.getTime() < Date.now()) {
    throw new PooledTripError('La hora de salida debe ser en el futuro');
  }
  if (dto.farePerSeat < 0) throw new PooledTripError('La tarifa por puesto no puede ser negativa');

  // Cost-share reference value (always computed). Enforcement (Option A) is
  // skipped only when Option C (INTERCITY_REMOVE_CAP) is explicitly enabled.
  const maxFare = getMaxFarePerSeat(dto.origin, dto.destination, dto.totalSeats);
  if (!INTERCITY_REMOVE_CAP && dto.farePerSeat > maxFare) {
    throw new PooledTripError(
      `La tarifa por puesto ($${dto.farePerSeat.toLocaleString('es-CO')}) supera el máximo legal de gasto compartido para esta ruta ($${maxFare.toLocaleString('es-CO')}).`,
    );
  }

  const tripRef = `NXP-${Math.floor(1000 + Math.random() * 8000)}`;
  const trip = await prisma.pooledTrip.create({
    data: {
      tripRef,
      driverId,
      driverName,
      driverPhone,
      vehicleDescription: dto.vehicleDescription,
      origin: CITY_TO_PRISMA[dto.origin] ?? dto.origin.toUpperCase(),
      destination: CITY_TO_PRISMA[dto.destination] ?? dto.destination.toUpperCase(),
      departureTime: departure,
      totalSeats: dto.totalSeats,
      farePerSeat: dto.farePerSeat,
      maxFarePerSeat: maxFare,
      allowFleet: dto.allowFleet ?? false,
      status: 'OPEN',
      notes: dto.notes ?? null,
      stops: sanitizeStops(dto.stops),
      operatorId: opts?.operatorId ?? null,
    },
    include: { bookings: true },
  });
  return _toDTO(trip as DbPooledTrip, true);
}

export async function getDriverPooledTrips(driverId: string): Promise<PooledTripDTO[]> {
  const trips = await prisma.pooledTrip.findMany({
    where: { driverId },
    include: { bookings: true },
    orderBy: { createdAt: 'desc' },
  });
  return trips.map((t) => _toDTO(t as DbPooledTrip, true));
}

// ─── Empresa: salidas programadas ─────────────────────────────────────────────

export async function getOperatorPooledTrips(operatorId: string): Promise<PooledTripDTO[]> {
  const trips = await prisma.pooledTrip.findMany({
    where: { operatorId },
    include: { bookings: true },
    orderBy: { departureTime: 'desc' },
  });
  return trips.map((t) => _toDTO(t as DbPooledTrip, true));
}

/** Cancela una salida publicada por la empresa (solo las suyas). */
export async function cancelPooledTripByOperator(
  operatorId: string,
  tripId: string,
): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.operatorId !== operatorId) return null;
  if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'CANCELLED' }, include: { bookings: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

export async function departPooledTrip(driverId: string, tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status !== 'OPEN' && t.status !== 'FULL') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'DEPARTED' }, include: { bookings: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

export async function completePooledTrip(driverId: string, tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status !== 'DEPARTED') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'COMPLETED' }, include: { bookings: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

export async function cancelPooledTrip(driverId: string, tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'CANCELLED' }, include: { bookings: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

// ─── Client: search & book ────────────────────────────────────────────────────

export interface SearchPooledTripsQuery {
  origin?: IntercityCity;
  destination?: IntercityCity;
  date?: string;
}

export async function searchPooledTrips(query: SearchPooledTripsQuery): Promise<PooledTripDTO[]> {
  const now = new Date();
  let target: Date | null = null;
  if (query.date) {
    const d = new Date(query.date);
    if (!Number.isNaN(d.getTime())) target = d;
  }

  const where: Record<string, unknown> = {
    status: 'OPEN',
    departureTime: { gt: now },
    ...(query.origin && { origin: CITY_TO_PRISMA[query.origin] ?? query.origin.toUpperCase() }),
    ...(query.destination && { destination: CITY_TO_PRISMA[query.destination] ?? query.destination.toUpperCase() }),
  };

  const trips = await prisma.pooledTrip.findMany({
    where: where as NonNullable<Parameters<typeof prisma.pooledTrip.findMany>[0]>['where'],
    include: { bookings: { where: { status: 'CONFIRMED' } } },
    orderBy: { departureTime: 'asc' },
  });

  // Nombre de la empresa para las salidas publicadas por operadores: da
  // confianza en la búsqueda ("Salida de Cotranal" vs conductor particular).
  const operatorIds = [...new Set(trips.map((t) => t.operatorId).filter((id): id is string => !!id))];
  const operatorNames = new Map<string, string>();
  if (operatorIds.length > 0) {
    const ops = await prisma.operator.findMany({
      where: { id: { in: operatorIds } },
      select: { id: true, legalName: true, tradeName: true },
    });
    for (const o of ops) operatorNames.set(o.id, o.tradeName ?? o.legalName);
  }

  return trips
    .map((t) => {
      const dto = _toDTO(t as DbPooledTrip, false);
      if (dto.operatorId) dto.operatorName = operatorNames.get(dto.operatorId);
      return dto;
    })
    .filter((t) => {
      if (t.availableSeats <= 0) return false;
      if (target) {
        const d = new Date(t.departureTime);
        return (
          d.getFullYear() === target.getFullYear() &&
          d.getMonth() === target.getMonth() &&
          d.getDate() === target.getDate()
        );
      }
      return true;
    });
}

export async function getPooledTripById(tripId: string, includeBookings = false): Promise<PooledTripDTO | null> {
  const t = await prisma.pooledTrip.findUnique({
    where: { id: tripId },
    include: { bookings: includeBookings },
  });
  return t ? _toDTO(t as DbPooledTrip, includeBookings) : null;
}

export async function bookSeats(
  clientId: string,
  passengerName: string,
  passengerPhone: string,
  tripId: string,
  dto: BookSeatsDTO,
): Promise<{ trip: PooledTripDTO; booking: SeatBookingDTO }> {
  return prisma.$transaction(async (tx) => {
    const t = await tx.pooledTrip.findUnique({
      where: { id: tripId },
      include: { bookings: { where: { status: 'CONFIRMED' } } },
    });
    if (!t) throw new PooledTripError('El viaje no existe');
    if (t.status !== 'OPEN') throw new PooledTripError('Este viaje ya no acepta reservas');
    if (t.driverId === clientId) throw new PooledTripError('No puedes reservar tu propio viaje');

    const existing = (t.bookings as DbSeatBooking[]).find((b) => b.userId === clientId);
    if (existing) throw new PooledTripError('Ya tienes una reserva en este viaje');

    const takenSeats = (t.bookings as DbSeatBooking[]).reduce((sum, b) => sum + b.seatsBooked, 0);
    const available = t.totalSeats - takenSeats;
    const requested = dto.seatsBooked;

    if (!Number.isInteger(requested) || requested < 1) throw new PooledTripError('Debes reservar al menos un puesto');
    if (requested > available) throw new PooledTripError(`Solo quedan ${available} puesto(s) disponible(s)`);
    if (requested === t.totalSeats && requested > 1 && !t.allowFleet) {
      throw new PooledTripError('Este conductor no permite reservar el vehículo completo');
    }

    const booking = await tx.seatBooking.create({
      data: {
        tripId,
        userId: clientId,
        passengerName,
        passengerPhone,
        seatsBooked: requested,
        pickupAddress: dto.pickupAddress ?? null,
        notes: dto.notes ?? null,
        status: 'CONFIRMED',
      },
    });

    const newAvailable = available - requested;
    let updatedTrip = t;
    if (newAvailable <= 0) {
      updatedTrip = await tx.pooledTrip.update({
        where: { id: tripId },
        data: { status: 'FULL' },
        include: { bookings: { where: { status: 'CONFIRMED' } } },
      });
    }

    const allBookings = [
      ...(updatedTrip.bookings as DbSeatBooking[]),
      ...(updatedTrip === t ? [booking] : []) as DbSeatBooking[],
    ];
    const tripWithBooking = { ...updatedTrip, bookings: allBookings } as DbPooledTrip;
    const tripDto = _toDTO(tripWithBooking, false);
    _notify(tripId, tripDto);

    return { trip: tripDto, booking: _toBookingDTO(booking as DbSeatBooking) };
  });
}

export async function cancelSeatBooking(clientId: string, bookingId: string): Promise<PooledTripDTO | null> {
  const b = await prisma.seatBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) return null;

  if (b.status === 'CANCELLED') {
    const t = await _fetchWithBookings(b.tripId);
    return t ? _toDTO(t, false) : null;
  }

  const trip = await prisma.pooledTrip.findUnique({ where: { id: b.tripId } });
  if (!trip) return null;
  if (trip.status === 'COMPLETED' || trip.status === 'DEPARTED') {
    throw new PooledTripError('No puedes cancelar una reserva de un viaje que ya salió');
  }

  await prisma.seatBooking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });

  // Reopen if full trip now has freed seats
  let updatedTrip = trip;
  if (trip.status === 'FULL') {
    const remaining = await prisma.seatBooking.aggregate({
      where: { tripId: b.tripId, status: 'CONFIRMED' },
      _sum: { seatsBooked: true },
    });
    if ((remaining._sum.seatsBooked ?? 0) < trip.totalSeats) {
      updatedTrip = await prisma.pooledTrip.update({ where: { id: b.tripId }, data: { status: 'OPEN' } });
    }
  }

  const t = await prisma.pooledTrip.findUnique({
    where: { id: b.tripId }, include: { bookings: true },
  });
  if (!t) return null;
  const dto = _toDTO({ ...updatedTrip, ...t, bookings: t.bookings } as DbPooledTrip, false);
  _notify(b.tripId, dto);
  return dto;
}

export async function getClientBookings(clientId: string): Promise<Array<PooledTripDTO & { myBooking: SeatBookingDTO }>> {
  const bookings = await prisma.seatBooking.findMany({
    where: { userId: clientId, status: 'CONFIRMED' },
    include: { trip: { include: { bookings: true } } },
    orderBy: { bookedAt: 'desc' },
  });

  return bookings.map((b) => {
    const tripWithBookings = b.trip as DbPooledTrip;
    return {
      ..._toDTO(tripWithBookings, false),
      myBooking: _toBookingDTO(b as DbSeatBooking),
    };
  });
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribePooledTrip(tripId: string, cb: TripCallback): () => void {
  if (!tripListeners.has(tripId)) tripListeners.set(tripId, new Set());
  tripListeners.get(tripId)!.add(cb);
  return () => tripListeners.get(tripId)?.delete(cb);
}

export async function getPooledTripSnapshot(tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  return t ? _toDTO(t, false) : null;
}
