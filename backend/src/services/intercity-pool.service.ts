import { randomUUID } from 'crypto';
import {
  IntercityCity,
  PooledTripStatus,
  PublishPooledTripDTO,
  BookSeatsDTO,
  PooledTripDTO,
  SeatBookingDTO,
  SeatBookingStatus,
} from '../types';
import { getIntercityRoute, getMaxFarePerSeat } from '../config/constants';

// ─── Internal state ─────────────────────────────────────────────────────────────

interface SeatBooking {
  id: string;
  tripId: string;
  clientId: string;
  passengerName: string;
  passengerPhone: string;
  seatsBooked: number;
  pickupAddress?: string;
  notes?: string;
  status: SeatBookingStatus;
  bookedAt: Date;
}

interface PooledTrip {
  id: string;
  tripRef: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleDescription: string;
  origin: IntercityCity;
  destination: IntercityCity;
  departureTime: Date;
  totalSeats: number;
  farePerSeat: number;
  maxFarePerSeat: number;
  allowFleet: boolean;
  status: PooledTripStatus;
  notes?: string;
  createdAt: Date;
  bookings: SeatBooking[];
}

const tripStore = new Map<string, PooledTrip>();

type TripCallback = (tripId: string, trip: PooledTripDTO) => void;
const tripListeners = new Map<string, Set<TripCallback>>();

const MAX_SEATS = 7;

// ─── Errors ─────────────────────────────────────────────────────────────────────

export class PooledTripError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PooledTripError';
  }
}

// ─── Driver: publish & manage ─────────────────────────────────────────────────────

export function publishPooledTrip(
  driverId: string,
  driverName: string,
  driverPhone: string,
  dto: PublishPooledTripDTO,
): PooledTripDTO {
  const route = getIntercityRoute(dto.origin, dto.destination);
  if (!route) {
    throw new PooledTripError(`No hay ruta definida entre ${dto.origin} y ${dto.destination}`);
  }
  if (dto.origin === dto.destination) {
    throw new PooledTripError('El origen y el destino no pueden ser iguales');
  }
  if (!Number.isInteger(dto.totalSeats) || dto.totalSeats < 1 || dto.totalSeats > MAX_SEATS) {
    throw new PooledTripError(`Los puestos deben estar entre 1 y ${MAX_SEATS}`);
  }
  const departure = new Date(dto.departureTime);
  if (Number.isNaN(departure.getTime()) || departure.getTime() < Date.now()) {
    throw new PooledTripError('La hora de salida debe ser en el futuro');
  }

  const maxFare = getMaxFarePerSeat(dto.origin, dto.destination, dto.totalSeats);
  if (dto.farePerSeat > maxFare) {
    throw new PooledTripError(
      `La tarifa por puesto ($${dto.farePerSeat.toLocaleString('es-CO')}) supera el máximo legal de gasto compartido para esta ruta ($${maxFare.toLocaleString('es-CO')}).`,
    );
  }
  if (dto.farePerSeat < 0) {
    throw new PooledTripError('La tarifa por puesto no puede ser negativa');
  }

  const id = `pool-${randomUUID().slice(0, 8)}`;
  const tripRef = `NXP-${Math.floor(1000 + Math.random() * 8000)}`;

  const trip: PooledTrip = {
    id,
    tripRef,
    driverId,
    driverName,
    driverPhone,
    vehicleDescription: dto.vehicleDescription,
    origin: dto.origin,
    destination: dto.destination,
    departureTime: departure,
    totalSeats: dto.totalSeats,
    farePerSeat: dto.farePerSeat,
    maxFarePerSeat: maxFare,
    allowFleet: dto.allowFleet ?? false,
    status: 'open',
    notes: dto.notes,
    createdAt: new Date(),
    bookings: [],
  };

  tripStore.set(id, trip);
  return _toDTO(trip, true);
}

export function getDriverPooledTrips(driverId: string): PooledTripDTO[] {
  return [...tripStore.values()]
    .filter((t) => t.driverId === driverId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((t) => _toDTO(t, true));
}

export function departPooledTrip(driverId: string, tripId: string): PooledTripDTO | null {
  const t = tripStore.get(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status !== 'open' && t.status !== 'full') return null;
  t.status = 'departed';
  _notify(t);
  return _toDTO(t, true);
}

export function completePooledTrip(driverId: string, tripId: string): PooledTripDTO | null {
  const t = tripStore.get(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status !== 'departed') return null;
  t.status = 'completed';
  _notify(t);
  return _toDTO(t, true);
}

export function cancelPooledTrip(driverId: string, tripId: string): PooledTripDTO | null {
  const t = tripStore.get(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status === 'completed' || t.status === 'cancelled') return null;
  t.status = 'cancelled';
  _notify(t);
  return _toDTO(t, true);
}

// ─── Client: search & book ────────────────────────────────────────────────────────

export interface SearchPooledTripsQuery {
  origin?: IntercityCity;
  destination?: IntercityCity;
  date?: string; // ISO date; matches trips departing on that calendar day
}

export function searchPooledTrips(query: SearchPooledTripsQuery): PooledTripDTO[] {
  const now = Date.now();
  let target: Date | null = null;
  if (query.date) {
    const d = new Date(query.date);
    if (!Number.isNaN(d.getTime())) target = d;
  }

  return [...tripStore.values()]
    .filter((t) => {
      if (t.status !== 'open') return false;
      if (_availableSeats(t) <= 0) return false;
      if (t.departureTime.getTime() < now) return false;
      if (query.origin && t.origin !== query.origin) return false;
      if (query.destination && t.destination !== query.destination) return false;
      if (target) {
        const sameDay =
          t.departureTime.getFullYear() === target.getFullYear() &&
          t.departureTime.getMonth() === target.getMonth() &&
          t.departureTime.getDate() === target.getDate();
        if (!sameDay) return false;
      }
      return true;
    })
    .sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime())
    .map((t) => _toDTO(t, false));
}

export function getPooledTripById(tripId: string, includeBookings = false): PooledTripDTO | null {
  const t = tripStore.get(tripId);
  if (!t) return null;
  return _toDTO(t, includeBookings);
}

export function bookSeats(
  clientId: string,
  passengerName: string,
  passengerPhone: string,
  tripId: string,
  dto: BookSeatsDTO,
): { trip: PooledTripDTO; booking: SeatBookingDTO } {
  const t = tripStore.get(tripId);
  if (!t) throw new PooledTripError('El viaje no existe');
  if (t.status !== 'open') throw new PooledTripError('Este viaje ya no acepta reservas');
  if (t.driverId === clientId) throw new PooledTripError('No puedes reservar tu propio viaje');

  const existing = t.bookings.find(
    (b) => b.clientId === clientId && b.status === 'confirmed',
  );
  if (existing) throw new PooledTripError('Ya tienes una reserva en este viaje');

  const available = _availableSeats(t);
  const requested = dto.seatsBooked;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new PooledTripError('Debes reservar al menos un puesto');
  }
  if (requested > available) {
    throw new PooledTripError(`Solo quedan ${available} puesto(s) disponible(s)`);
  }
  // Booking all remaining seats at once requires the driver to allow fleet.
  if (requested === t.totalSeats && requested > 1 && !t.allowFleet) {
    throw new PooledTripError('Este conductor no permite reservar el vehículo completo');
  }

  const booking: SeatBooking = {
    id: `seat-${randomUUID().slice(0, 8)}`,
    tripId,
    clientId,
    passengerName,
    passengerPhone,
    seatsBooked: requested,
    pickupAddress: dto.pickupAddress,
    notes: dto.notes,
    status: 'confirmed',
    bookedAt: new Date(),
  };
  t.bookings.push(booking);

  if (_availableSeats(t) <= 0) t.status = 'full';
  _notify(t);

  return { trip: _toDTO(t, false), booking: _toBookingDTO(booking) };
}

export function cancelSeatBooking(clientId: string, bookingId: string): PooledTripDTO | null {
  for (const t of tripStore.values()) {
    const booking = t.bookings.find((b) => b.id === bookingId && b.clientId === clientId);
    if (!booking) continue;
    if (booking.status === 'cancelled') return _toDTO(t, false);
    if (t.status === 'completed' || t.status === 'departed') {
      throw new PooledTripError('No puedes cancelar una reserva de un viaje que ya salió');
    }
    booking.status = 'cancelled';
    // Freeing a seat reopens a full trip.
    if (t.status === 'full' && _availableSeats(t) > 0) t.status = 'open';
    _notify(t);
    return _toDTO(t, false);
  }
  return null;
}

export function getClientBookings(clientId: string): Array<PooledTripDTO & { myBooking: SeatBookingDTO }> {
  const result: Array<PooledTripDTO & { myBooking: SeatBookingDTO }> = [];
  for (const t of tripStore.values()) {
    const mine = t.bookings.find((b) => b.clientId === clientId && b.status === 'confirmed');
    if (mine) {
      result.push({ ..._toDTO(t, false), myBooking: _toBookingDTO(mine) });
    }
  }
  return result.sort((a, b) => new Date(b.myBooking.bookedAt).getTime() - new Date(a.myBooking.bookedAt).getTime());
}

// ─── Realtime ────────────────────────────────────────────────────────────────────

export function subscribePooledTrip(tripId: string, cb: TripCallback): () => void {
  if (!tripListeners.has(tripId)) tripListeners.set(tripId, new Set());
  tripListeners.get(tripId)!.add(cb);
  return () => tripListeners.get(tripId)?.delete(cb);
}

export function getPooledTripSnapshot(tripId: string): PooledTripDTO | null {
  const t = tripStore.get(tripId);
  if (!t) return null;
  return _toDTO(t, false);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function _availableSeats(t: PooledTrip): number {
  const taken = t.bookings
    .filter((b) => b.status === 'confirmed')
    .reduce((sum, b) => sum + b.seatsBooked, 0);
  return t.totalSeats - taken;
}

function _notify(t: PooledTrip): void {
  const dto = _toDTO(t, false);
  for (const cb of tripListeners.get(t.id) ?? []) cb(t.id, dto);
}

function _toBookingDTO(b: SeatBooking): SeatBookingDTO {
  return {
    id: b.id,
    tripId: b.tripId,
    passengerName: b.passengerName,
    passengerPhone: b.passengerPhone,
    seatsBooked: b.seatsBooked,
    pickupAddress: b.pickupAddress,
    notes: b.notes,
    status: b.status,
    bookedAt: b.bookedAt.toISOString(),
  };
}

function _toDTO(t: PooledTrip, includeBookings: boolean): PooledTripDTO {
  const route = getIntercityRoute(t.origin, t.destination);
  const dto: PooledTripDTO = {
    id: t.id,
    tripRef: t.tripRef,
    driverId: t.driverId,
    driverName: t.driverName,
    driverPhone: t.driverPhone,
    vehicleDescription: t.vehicleDescription,
    origin: t.origin,
    destination: t.destination,
    departureTime: t.departureTime.toISOString(),
    totalSeats: t.totalSeats,
    availableSeats: _availableSeats(t),
    farePerSeat: t.farePerSeat,
    maxFarePerSeat: t.maxFarePerSeat,
    allowFleet: t.allowFleet,
    status: t.status,
    notes: t.notes,
    distanceKm: route?.distanceKm,
    durationMinutes: route?.durationMinutes,
    createdAt: t.createdAt.toISOString(),
  };
  if (includeBookings) {
    dto.bookings = t.bookings
      .filter((b) => b.status === 'confirmed')
      .map((b) => _toBookingDTO(b));
  }
  return dto;
}
