import crypto from 'crypto';
import {
  DISPATCH_MIN_INTERVAL_MS,
  DISPATCH_MAX_INTERVAL_MS,
  TRIP_REQUEST_TIMEOUT_MS,
  MOCK_PASSENGERS,
  MOCK_ROUTES,
  FARE_BASE,
  FARE_PER_KM,
  FARE_PER_MIN,
  FARE_MINIMUM,
} from '../config/constants';
import { TripRequestDTO } from '../types';

type DispatchCallback = (trip: TripRequestDTO) => void;
type TimeoutCallback = (tripId: string) => void;

let dispatchCallback: DispatchCallback | null = null;
let timeoutCallback: TimeoutCallback | null = null;
let dispatchTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTripTimeout: ReturnType<typeof setTimeout> | null = null;
let currentPendingTripId: string | null = null;
let isOnline = false;

function calcFare(distanceKm: number, minutes: number): number {
  const gross = FARE_BASE + distanceKm * FARE_PER_KM + minutes * FARE_PER_MIN;
  return Math.max(gross, FARE_MINIMUM);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateTrip(): TripRequestDTO {
  const route = MOCK_ROUTES[randomBetween(0, MOCK_ROUTES.length - 1)]!;
  const passenger = MOCK_PASSENGERS[randomBetween(0, MOCK_PASSENGERS.length - 1)]!;
  return {
    id: crypto.randomUUID(),
    passenger,
    origin: route.origin,
    destination: route.destination,
    distanceKm: route.distanceKm,
    estimatedMinutes: route.estimatedMinutes,
    estimatedFare: calcFare(route.distanceKm, route.estimatedMinutes),
  };
}

function scheduleNext(): void {
  if (!isOnline) return;
  const delay = randomBetween(DISPATCH_MIN_INTERVAL_MS, DISPATCH_MAX_INTERVAL_MS);
  dispatchTimer = setTimeout(() => {
    if (!isOnline || !dispatchCallback) return;
    const trip = generateTrip();
    currentPendingTripId = trip.id;
    dispatchCallback(trip);

    // Auto-cancel if driver doesn't respond within timeout
    pendingTripTimeout = setTimeout(() => {
      if (currentPendingTripId === trip.id) {
        currentPendingTripId = null;
        timeoutCallback?.(trip.id);
        scheduleNext();
      }
    }, TRIP_REQUEST_TIMEOUT_MS);
  }, delay);
}

export function startDispatch(onTrip: DispatchCallback, onTimeout: TimeoutCallback): void {
  dispatchCallback = onTrip;
  timeoutCallback = onTimeout;
  isOnline = true;
  scheduleNext();
}

export function stopDispatch(): void {
  isOnline = false;
  if (dispatchTimer) { clearTimeout(dispatchTimer); dispatchTimer = null; }
  if (pendingTripTimeout) { clearTimeout(pendingTripTimeout); pendingTripTimeout = null; }
  currentPendingTripId = null;
}

export function acknowledgeTripResponse(tripId: string): boolean {
  if (currentPendingTripId !== tripId) return false;
  if (pendingTripTimeout) { clearTimeout(pendingTripTimeout); pendingTripTimeout = null; }
  currentPendingTripId = null;
  return true;
}

export function resumeDispatch(): void {
  if (isOnline) scheduleNext();
}
