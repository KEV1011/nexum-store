import crypto from 'crypto';
import {
  DISPATCH_MIN_INTERVAL_MS,
  DISPATCH_MAX_INTERVAL_MS,
  TRIP_REQUEST_TIMEOUT_MS,
  MOCK_PASSENGERS,
  MOCK_ROUTES,
  MOCK_ERRANDS,
  FARE_BASE,
  FARE_PER_KM,
  FARE_PER_MIN,
  FARE_MINIMUM,
} from '../config/constants';
import { TripRequestDTO, ErrandRequestDTO, WorkMode } from '../types';

type TripDispatchCb = (trip: TripRequestDTO) => void;
type ErrandDispatchCb = (errand: ErrandRequestDTO) => void;
type TimeoutCallback = (id: string) => void;

let tripCallback: TripDispatchCb | null = null;
let errandCallback: ErrandDispatchCb | null = null;
let timeoutCallback: TimeoutCallback | null = null;
let dispatchTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let currentPendingId: string | null = null;
let isOnline = false;
let currentWorkMode: WorkMode = 'pasajero';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function generateErrand(): ErrandRequestDTO {
  const template = MOCK_ERRANDS[randomBetween(0, MOCK_ERRANDS.length - 1)]!;
  return { id: crypto.randomUUID(), ...template };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

function scheduleNext(): void {
  if (!isOnline) return;
  const delay = randomBetween(DISPATCH_MIN_INTERVAL_MS, DISPATCH_MAX_INTERVAL_MS);

  dispatchTimer = setTimeout(() => {
    if (!isOnline) return;

    if (currentWorkMode === 'mandado') {
      if (!errandCallback) return;
      const errand = generateErrand();
      currentPendingId = errand.id;
      errandCallback(errand);
    } else {
      if (!tripCallback) return;
      const trip = generateTrip();
      currentPendingId = trip.id;
      tripCallback(trip);
    }

    pendingTimeout = setTimeout(() => {
      if (currentPendingId) {
        const id = currentPendingId;
        currentPendingId = null;
        timeoutCallback?.(id);
        scheduleNext();
      }
    }, TRIP_REQUEST_TIMEOUT_MS);
  }, delay);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startDispatch(
  onTrip: TripDispatchCb,
  onTimeout: TimeoutCallback,
  workMode: WorkMode = 'pasajero',
  onErrand?: ErrandDispatchCb,
): void {
  tripCallback = onTrip;
  errandCallback = onErrand ?? null;
  timeoutCallback = onTimeout;
  currentWorkMode = workMode;
  isOnline = true;
  scheduleNext();
}

export function setDriverWorkMode(mode: WorkMode): void {
  currentWorkMode = mode;
}

export function stopDispatch(): void {
  isOnline = false;
  if (dispatchTimer) { clearTimeout(dispatchTimer); dispatchTimer = null; }
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  currentPendingId = null;
}

export function acknowledgeTripResponse(id: string): boolean {
  if (currentPendingId !== id) return false;
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  currentPendingId = null;
  return true;
}

// Alias for backwards compatibility
export const acknowledgeErrandResponse = acknowledgeTripResponse;

export function resumeDispatch(): void {
  if (isOnline) scheduleNext();
}
