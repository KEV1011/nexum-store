import { Trip, TripState, TripSummaryDTO, TripRequestDTO, DriverStatus } from '../types';
import { COMMISSION_RATE } from '../config/constants';
import { recordCompletedTrip } from './earnings.service';
import { calcFare } from '../lib/fare';
import { prisma } from '../lib/prisma';

// ─── In-memory dispatch state (ephemeral) ─────────────────────────────────────
// The trips Map holds dispatch-generated trips while they are pending/active.
// Persistent state is written to the Trip table on key lifecycle events.

const trips = new Map<string, Trip>();
let driverStatus: DriverStatus = 'offline';
let activeDriverId: string | null = null;  // set when driver authenticates

// ─── Trip state machine helpers ───────────────────────────────────────────────

function assertState(trip: Trip, allowed: TripState[]): void {
  if (!allowed.includes(trip.state))
    throw new Error(`Invalid state transition from "${trip.state}"`);
}

function getOrThrow(id: string): Trip {
  const t = trips.get(id);
  if (!t) throw new Error(`Trip ${id} not found`);
  return t;
}

const STATUS_MAP: Record<TripState, string> = {
  pending: 'SEARCHING',
  accepted: 'ACCEPTED',
  going_to_pickup: 'ARRIVING',
  arrived_at_pickup: 'ARRIVED',
  in_progress: 'IN_PROGRESS',
  completed: 'COMPLETED',
  rejected: 'CANCELLED',
  cancelled: 'CANCELLED',
};

function todayStart(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

// ─── Public service interface ─────────────────────────────────────────────────

export interface TripService {
  getDriverStatus(): DriverStatus;
  setDriverStatus(s: DriverStatus, driverId?: string): Promise<void>;
  getDailyTrips(driverId?: string): Promise<number>;
  getDailyEarnings(driverId?: string): Promise<number>;

  createTripFromRequest(req: TripRequestDTO): Promise<Trip>;
  acceptTrip(id: string): Promise<Trip>;
  rejectTrip(id: string): Promise<Trip>;
  startTrip(id: string): Promise<Trip>;
  arriveAtPickup(id: string): Promise<Trip>;
  beginTrip(id: string): Promise<Trip>;
  finishTrip(id: string, driverId?: string): Promise<TripSummaryDTO>;
  cancelTrip(id: string): Promise<Trip>;

  getTrip(id: string): Trip | undefined;
  getActiveTrip(): Trip | undefined;
  getAllTrips(): Trip[];
}

const service: TripService = {
  getDriverStatus: () => driverStatus,

  async setDriverStatus(s: DriverStatus, driverId?: string): Promise<void> {
    driverStatus = s;
    const id = driverId ?? activeDriverId;
    if (driverId) activeDriverId = driverId;
    if (!id) return;
    const statusMap: Record<DriverStatus, 'OFFLINE' | 'ONLINE' | 'ON_TRIP'> = {
      offline: 'OFFLINE', online: 'ONLINE', busy: 'ON_TRIP',
    };
    try {
      await prisma.driver.update({ where: { id }, data: { status: statusMap[s] } });
    } catch { /* driver may not exist in seed scenario */ }
  },

  async getDailyTrips(driverId?: string): Promise<number> {
    const id = driverId ?? activeDriverId;
    if (id) {
      return prisma.trip.count({
        where: { driverId: id, status: 'COMPLETED', completedAt: { gte: todayStart() } },
      });
    }
    // Fallback to in-memory
    const start = todayStart();
    return [...trips.values()].filter((t) => t.state === 'completed' && t.completedAt && t.completedAt >= start).length;
  },

  async getDailyEarnings(driverId?: string): Promise<number> {
    const id = driverId ?? activeDriverId;
    if (id) {
      const result = await prisma.trip.aggregate({
        where: { driverId: id, status: 'COMPLETED', completedAt: { gte: todayStart() } },
        _sum: { netEarning: true },
      });
      return result._sum.netEarning ?? 0;
    }
    // Fallback to in-memory
    const start = todayStart();
    return [...trips.values()]
      .filter((t) => t.state === 'completed' && t.completedAt && t.completedAt >= start)
      .reduce((sum, t) => sum + t.netEarning, 0);
  },

  async createTripFromRequest(req: TripRequestDTO): Promise<Trip> {
    const { grossFare, netEarning } = calcFare(req.distanceKm, req.estimatedMinutes);
    const trip: Trip = {
      id: req.id,
      passenger: req.passenger,
      origin: req.origin,
      destination: req.destination,
      distanceKm: req.distanceKm,
      estimatedMinutes: req.estimatedMinutes,
      state: 'pending',
      grossFare,
      netEarning,
      createdAt: new Date(),
    };
    trips.set(trip.id, trip);

    try {
      await prisma.trip.create({
        data: {
          requestRef: req.id,
          driverId: activeDriverId,
          serviceType: 'PARTICULAR',
          status: 'SEARCHING',
          originAddress: req.origin.address,
          originLat: req.origin.lat,
          originLng: req.origin.lng,
          destAddress: req.destination.address,
          destLat: req.destination.lat,
          destLng: req.destination.lng,
          estimatedFare: grossFare,
          netEarning,
          commission: Math.round(grossFare * COMMISSION_RATE),
          distanceKm: req.distanceKm,
          etaMinutes: req.estimatedMinutes,
          passengerName: req.passenger.name,
          passengerRating: req.passenger.rating,
        },
      });
    } catch { /* ignore if duplicate requestRef */ }

    return trip;
  },

  async acceptTrip(id: string): Promise<Trip> {
    const trip = getOrThrow(id);
    assertState(trip, ['pending']);
    trip.state = 'accepted';
    trip.acceptedAt = new Date();
    driverStatus = 'busy';
    void service.setDriverStatus('busy');

    try {
      await prisma.trip.update({
        where: { requestRef: id },
        data: { status: 'ACCEPTED', acceptedAt: trip.acceptedAt },
      });
    } catch { /* ignore DB errors for dispatch trips */ }

    return trip;
  },

  async rejectTrip(id: string): Promise<Trip> {
    const trip = getOrThrow(id);
    assertState(trip, ['pending']);
    trip.state = 'rejected';

    try {
      await prisma.trip.update({ where: { requestRef: id }, data: { status: 'CANCELLED' } });
    } catch { /* ignore */ }

    return trip;
  },

  async startTrip(id: string): Promise<Trip> {
    const trip = getOrThrow(id);
    assertState(trip, ['accepted']);
    trip.state = 'going_to_pickup';
    trip.startedAt = new Date();

    try {
      await prisma.trip.update({
        where: { requestRef: id },
        data: { status: STATUS_MAP['going_to_pickup'] as 'ARRIVING', startedAt: trip.startedAt },
      });
    } catch { /* ignore */ }

    return trip;
  },

  async arriveAtPickup(id: string): Promise<Trip> {
    const trip = getOrThrow(id);
    assertState(trip, ['going_to_pickup']);
    trip.state = 'arrived_at_pickup';
    trip.arrivedAt = new Date();

    try {
      await prisma.trip.update({
        where: { requestRef: id },
        data: { status: 'ARRIVED', arrivedAt: trip.arrivedAt },
      });
    } catch { /* ignore */ }

    return trip;
  },

  async beginTrip(id: string): Promise<Trip> {
    const trip = getOrThrow(id);
    assertState(trip, ['arrived_at_pickup']);
    trip.state = 'in_progress';

    try {
      await prisma.trip.update({ where: { requestRef: id }, data: { status: 'IN_PROGRESS' } });
    } catch { /* ignore */ }

    return trip;
  },

  async finishTrip(id: string, driverId?: string): Promise<TripSummaryDTO> {
    const trip = getOrThrow(id);
    assertState(trip, ['arrived_at_pickup', 'in_progress']);
    const now = new Date();
    trip.state = 'completed';
    trip.completedAt = now;

    const startMs = trip.startedAt?.getTime() ?? now.getTime();
    const actualMinutes = Math.max(1, Math.round((now.getTime() - startMs) / 60_000));
    const durationMinutes = actualMinutes > 2 ? actualMinutes : trip.estimatedMinutes;

    const { grossFare, commission, netEarning } = calcFare(trip.distanceKm, durationMinutes);
    trip.grossFare = grossFare;
    trip.netEarning = netEarning;
    driverStatus = 'online';
    void service.setDriverStatus('online', driverId);

    recordCompletedTrip({
      tripId: trip.id,
      origin: trip.origin.address,
      destination: trip.destination.address,
      grossFare,
      netEarning,
      completedAt: now.toISOString(),
    }, driverId ?? activeDriverId ?? undefined);

    try {
      await prisma.trip.update({
        where: { requestRef: id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          finalFare: grossFare,
          netEarning,
          commission,
          etaMinutes: durationMinutes,
          ...(driverId && { driverId }),
        },
      });
    } catch { /* ignore */ }

    return {
      id: trip.id,
      passenger: trip.passenger,
      origin: trip.origin,
      destination: trip.destination,
      distanceKm: trip.distanceKm,
      durationMinutes,
      grossFare,
      commission,
      netEarning,
      completedAt: now.toISOString(),
    };
  },

  async cancelTrip(id: string): Promise<Trip> {
    const trip = getOrThrow(id);
    trip.state = 'cancelled';
    driverStatus = 'online';
    void service.setDriverStatus('online');

    try {
      await prisma.trip.update({ where: { requestRef: id }, data: { status: 'CANCELLED' } });
    } catch { /* ignore */ }

    return trip;
  },

  getTrip: (id) => trips.get(id),
  getActiveTrip: () => [...trips.values()].find((t) => !['completed', 'rejected', 'cancelled'].includes(t.state)),
  getAllTrips: () => [...trips.values()],
};

export function getTripService(): TripService { return service; }
