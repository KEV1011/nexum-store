import { Trip, TripState, TripSummaryDTO, TripRequestDTO, DriverStatus } from '../types';
import { FARE_BASE, FARE_PER_KM, FARE_PER_MIN, FARE_MINIMUM, COMMISSION_RATE } from '../config/constants';
import { recordCompletedTrip } from './earnings.service';

// ─── In-memory state ──────────────────────────────────────────────────────────

const trips = new Map<string, Trip>();
let driverStatus: DriverStatus = 'offline';

// ─── Fare ─────────────────────────────────────────────────────────────────────

function calcFare(distanceKm: number, minutes: number) {
  const raw = FARE_BASE + distanceKm * FARE_PER_KM + minutes * FARE_PER_MIN;
  const grossFare = Math.round(Math.max(raw, FARE_MINIMUM));
  const commission = Math.round(grossFare * COMMISSION_RATE);
  const netEarning = grossFare - commission;
  return { grossFare, commission, netEarning };
}

// ─── Trip state machine ───────────────────────────────────────────────────────

function assertState(trip: Trip, allowed: TripState[]): void {
  if (!allowed.includes(trip.state))
    throw new Error(`Invalid state transition from "${trip.state}"`);
}

function getOrThrow(id: string): Trip {
  const t = trips.get(id);
  if (!t) throw new Error(`Trip ${id} not found`);
  return t;
}

// ─── Public service object ────────────────────────────────────────────────────

export interface TripService {
  // Driver status
  getDriverStatus(): DriverStatus;
  setDriverStatus(s: DriverStatus): void;
  getDailyTrips(): number;
  getDailyEarnings(): number;

  // Trip lifecycle
  createTripFromRequest(req: TripRequestDTO): Trip;
  acceptTrip(id: string): Trip;
  rejectTrip(id: string): Trip;
  startTrip(id: string): Trip;
  arriveAtPickup(id: string): Trip;
  beginTrip(id: string): Trip;
  finishTrip(id: string): TripSummaryDTO;
  cancelTrip(id: string): Trip;

  // Queries
  getTrip(id: string): Trip | undefined;
  getActiveTrip(): Trip | undefined;
  getAllTrips(): Trip[];
}

function todayStart(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

const service: TripService = {
  getDriverStatus: () => driverStatus,
  setDriverStatus: (s) => { driverStatus = s; },

  getDailyTrips(): number {
    const start = todayStart();
    return [...trips.values()].filter(t => t.state === 'completed' && t.completedAt && t.completedAt >= start).length;
  },

  getDailyEarnings(): number {
    const start = todayStart();
    return [...trips.values()]
      .filter(t => t.state === 'completed' && t.completedAt && t.completedAt >= start)
      .reduce((sum, t) => sum + t.netEarning, 0);
  },

  createTripFromRequest(req: TripRequestDTO): Trip {
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
    return trip;
  },

  acceptTrip(id: string): Trip {
    const trip = getOrThrow(id);
    assertState(trip, ['pending']);
    trip.state = 'accepted';
    trip.acceptedAt = new Date();
    driverStatus = 'busy';
    return trip;
  },

  rejectTrip(id: string): Trip {
    const trip = getOrThrow(id);
    assertState(trip, ['pending']);
    trip.state = 'rejected';
    return trip;
  },

  startTrip(id: string): Trip {
    const trip = getOrThrow(id);
    assertState(trip, ['accepted']);
    trip.state = 'going_to_pickup';
    trip.startedAt = new Date();
    return trip;
  },

  arriveAtPickup(id: string): Trip {
    const trip = getOrThrow(id);
    assertState(trip, ['going_to_pickup']);
    trip.state = 'arrived_at_pickup';
    trip.arrivedAt = new Date();
    return trip;
  },

  beginTrip(id: string): Trip {
    const trip = getOrThrow(id);
    assertState(trip, ['arrived_at_pickup']);
    trip.state = 'in_progress';
    return trip;
  },

  finishTrip(id: string): TripSummaryDTO {
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

    recordCompletedTrip({
      tripId: trip.id,
      origin: trip.origin.address,
      destination: trip.destination.address,
      grossFare,
      netEarning,
      completedAt: now.toISOString(),
    });

    return { id: trip.id, passenger: trip.passenger, origin: trip.origin, destination: trip.destination, distanceKm: trip.distanceKm, durationMinutes, grossFare, commission, netEarning, completedAt: now.toISOString() };
  },

  cancelTrip(id: string): Trip {
    const trip = getOrThrow(id);
    trip.state = 'cancelled';
    driverStatus = 'online';
    return trip;
  },

  getTrip: (id) => trips.get(id),
  getActiveTrip: () => [...trips.values()].find(t => !['completed','rejected','cancelled'].includes(t.state)),
  getAllTrips: () => [...trips.values()],
};

export function getTripService(): TripService { return service; }
