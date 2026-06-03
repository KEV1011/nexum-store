import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  IntercityCity as PrismaCity,
  IntercitySeats as PrismaSeats,
} from '@prisma/client';
import {
  IntercityCity,
  IntercitySeats,
  IntercityStatus,
  RequestIntercityDTO,
  IntercityBookingDTO,
} from '../types';

const CITY_MAP: Record<string, PrismaCity> = {
  pamplona: PrismaCity.PAMPLONA, cucuta: PrismaCity.CUCUTA, bucaramanga: PrismaCity.BUCARAMANGA,
  chitaga: PrismaCity.CHITAGA, malaga: PrismaCity.MALAGA, ocana: PrismaCity.OCANA, bogota: PrismaCity.BOGOTA,
};
const SEATS_MAP: Record<string, PrismaSeats> = {
  one: PrismaSeats.ONE, two: PrismaSeats.TWO, three: PrismaSeats.THREE, fleet: PrismaSeats.FLEET,
};

// ─── Internal state ───────────────────────────────────────────────────────────

interface IntercityBooking {
  id: string;
  requestRef: string;
  clientId: string;
  origin: IntercityCity;
  destination: IntercityCity;
  departureTime: Date;
  seats: IntercitySeats;
  offeredFare: number;
  counterFare?: number;
  status: IntercityStatus;
  driverName?: string;
  driverPhone?: string;
  driverVehicle?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  notes?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

const bookingStore = new Map<string, IntercityBooking>();
const clientActiveBooking = new Map<string, string>(); // clientId → bookingId

type BookingCallback = (bookingId: string, booking: IntercityBookingDTO) => void;
const bookingListeners = new Map<string, Set<BookingCallback>>();

const MOCK_INTERCITY_DRIVERS = [
  {
    name: 'Hernán Castellanos',
    phone: '+57 311 789 0123',
    vehicle: 'Toyota Fortuner Gris 2022 • TJK 451',
  },
  {
    name: 'Wilson Durán',
    phone: '+57 317 654 3210',
    vehicle: 'Chevrolet Captiva Blanca 2021 • MPN 334',
  },
  {
    name: 'Ramiro Sepúlveda',
    phone: '+57 313 456 0987',
    vehicle: 'Nissan X-Trail Negra 2023 • OPS 876',
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function requestIntercityBooking(
  clientId: string,
  dto: RequestIntercityDTO,
): IntercityBookingDTO {
  const id = `cint-${randomUUID().slice(0, 8)}`;
  const requestRef = `NXI-${Math.floor(1000 + Math.random() * 8000)}`;

  const booking: IntercityBooking = {
    id,
    requestRef,
    clientId,
    origin: dto.origin,
    destination: dto.destination,
    departureTime: new Date(dto.departureTime),
    seats: dto.seats,
    offeredFare: dto.offeredFare,
    status: 'searching',
    pickupAddress: dto.pickupAddress,
    dropoffAddress: dto.dropoffAddress,
    notes: dto.notes,
    createdAt: new Date(),
  };

  bookingStore.set(id, booking);
  clientActiveBooking.set(clientId, id);

  // Persist to DB (fire-and-forget)
  prisma.intercityBooking.create({
    data: {
      id, requestRef, userId: clientId,
      origin: CITY_MAP[dto.origin.toLowerCase()] ?? PrismaCity.PAMPLONA,
      destination: CITY_MAP[dto.destination.toLowerCase()] ?? PrismaCity.CUCUTA,
      departureTime: new Date(dto.departureTime),
      seats: SEATS_MAP[dto.seats.toLowerCase()] ?? PrismaSeats.ONE,
      offeredFare: dto.offeredFare,
      pickupAddress: dto.pickupAddress,
      dropoffAddress: dto.dropoffAddress,
      notes: dto.notes,
    },
  }).catch(() => { /* non-fatal */ });

  _scheduleDriverResponse(id, dto.offeredFare);
  return _toDTO(booking);
}

export function confirmIntercityBooking(
  clientId: string,
  bookingId: string,
): IntercityBookingDTO | null {
  const b = bookingStore.get(bookingId);
  if (!b || b.clientId !== clientId) return null;
  if (b.status !== 'driver_found') return null;
  b.status = 'confirmed';
  b.confirmedAt = new Date();
  _notify(bookingId, b);
  return _toDTO(b);
}

export function rejectIntercityOffer(clientId: string, bookingId: string): boolean {
  const b = bookingStore.get(bookingId);
  if (!b || b.clientId !== clientId) return false;
  if (b.status !== 'driver_found') return false;
  b.status = 'searching';
  b.driverName = undefined;
  b.driverPhone = undefined;
  b.driverVehicle = undefined;
  b.counterFare = undefined;
  _notify(bookingId, b);
  // Re-search with same offered fare (driver may accept this time)
  _scheduleDriverResponse(bookingId, b.offeredFare);
  return true;
}

export function cancelIntercityBooking(clientId: string, bookingId: string): boolean {
  const b = bookingStore.get(bookingId);
  if (!b || b.clientId !== clientId) return false;
  const cancellable: IntercityStatus[] = ['searching', 'driver_found', 'confirmed'];
  if (!cancellable.includes(b.status)) return false;
  b.status = 'cancelled';
  _notify(bookingId, b);
  return true;
}

export function getActiveIntercityBooking(
  clientId: string,
): IntercityBookingDTO | null {
  const id = clientActiveBooking.get(clientId);
  if (!id) return null;
  const b = bookingStore.get(id);
  if (!b) return null;
  const active: IntercityStatus[] = ['searching', 'driver_found', 'confirmed', 'in_progress'];
  if (!active.includes(b.status)) return null;
  return _toDTO(b);
}

export function getIntercityBookingById(
  clientId: string,
  bookingId: string,
): IntercityBookingDTO | null {
  const b = bookingStore.get(bookingId);
  if (!b || b.clientId !== clientId) return null;
  return _toDTO(b);
}

export function subscribeIntercityBooking(
  bookingId: string,
  cb: BookingCallback,
): () => void {
  if (!bookingListeners.has(bookingId)) bookingListeners.set(bookingId, new Set());
  bookingListeners.get(bookingId)!.add(cb);
  return () => bookingListeners.get(bookingId)?.delete(cb);
}

export function getIntercityBookingSnapshot(
  bookingId: string,
): IntercityBookingDTO | null {
  const b = bookingStore.get(bookingId);
  if (!b) return null;
  return _toDTO(b);
}

// ─── Simulation ───────────────────────────────────────────────────────────────

function _scheduleDriverResponse(bookingId: string, offeredFare: number): void {
  const delayMs = Math.random() * 6000 + 6000; // 6-12 s
  const hasCounter = Math.random() > 0.45; // 55% send counter offer

  setTimeout(() => {
    const b = bookingStore.get(bookingId);
    if (!b || b.status !== 'searching') return;

    const driver =
      MOCK_INTERCITY_DRIVERS[Math.floor(Math.random() * MOCK_INTERCITY_DRIVERS.length)]!;
    b.driverName = driver.name;
    b.driverPhone = driver.phone;
    b.driverVehicle = driver.vehicle;

    if (hasCounter) {
      // Counter is offered fare + 5-15 %
      const pct = 0.05 + Math.random() * 0.10;
      b.counterFare = Math.round((offeredFare * (1 + pct)) / 1000) * 1000;
      b.status = 'driver_found';
    } else {
      b.status = 'confirmed';
      b.confirmedAt = new Date();
    }
    _notify(bookingId, b);
  }, delayMs);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _notify(bookingId: string, b: IntercityBooking): void {
  const dto = _toDTO(b);
  for (const cb of bookingListeners.get(bookingId) ?? []) cb(bookingId, dto);
}

function _toDTO(b: IntercityBooking): IntercityBookingDTO {
  return {
    id: b.id,
    requestRef: b.requestRef,
    origin: b.origin,
    destination: b.destination,
    departureTime: b.departureTime.toISOString(),
    seats: b.seats,
    offeredFare: b.offeredFare,
    counterFare: b.counterFare,
    status: b.status,
    driverName: b.driverName,
    driverPhone: b.driverPhone,
    driverVehicle: b.driverVehicle,
    pickupAddress: b.pickupAddress,
    dropoffAddress: b.dropoffAddress,
    notes: b.notes,
    createdAt: b.createdAt.toISOString(),
    confirmedAt: b.confirmedAt?.toISOString(),
  };
}
