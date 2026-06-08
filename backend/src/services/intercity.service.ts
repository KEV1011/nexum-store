import {
  IntercityCity,
  IntercitySeats,
  IntercityStatus,
  RequestIntercityDTO,
  IntercityBookingDTO,
} from '../types';
import { prisma } from '../lib/prisma';

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

// ─── Mock driver pool for simulation ──────────────────────────────────────────
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
    driverPhone: b.driverPhone ?? undefined,
    driverVehicle: b.driverVehicle ?? undefined,
    pickupAddress: b.pickupAddress ?? undefined,
    dropoffAddress: b.dropoffAddress ?? undefined,
    notes: b.notes ?? undefined,
    createdAt: b.createdAt.toISOString(),
    confirmedAt: b.confirmedAt?.toISOString(),
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function requestIntercityBooking(
  clientId: string,
  dto: RequestIntercityDTO,
): Promise<IntercityBookingDTO> {
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
  _scheduleDriverResponse(booking.id, dto.offeredFare);
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
      driverName: null, driverPhone: null, driverVehicle: null, counterFare: null,
    },
  });
  const dto = _toDTO(updated as DbBooking);
  _notify(bookingId, dto);
  _scheduleDriverResponse(bookingId, b.offeredFare);
  return true;
}

export async function cancelIntercityBooking(clientId: string, bookingId: string): Promise<boolean> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) return false;
  if (!['SEARCHING', 'DRIVER_FOUND', 'CONFIRMED'].includes(b.status)) return false;

  const updated = await prisma.intercityBooking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });
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

export function subscribeIntercityBooking(bookingId: string, cb: BookingCallback): () => void {
  if (!bookingListeners.has(bookingId)) bookingListeners.set(bookingId, new Set());
  bookingListeners.get(bookingId)!.add(cb);
  return () => bookingListeners.get(bookingId)?.delete(cb);
}

export async function getIntercityBookingSnapshot(bookingId: string): Promise<IntercityBookingDTO | null> {
  const b = await prisma.intercityBooking.findUnique({ where: { id: bookingId } });
  return b ? _toDTO(b as DbBooking) : null;
}
