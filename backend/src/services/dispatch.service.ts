import crypto from 'crypto';
import {
  DISPATCH_MIN_INTERVAL_MS,
  DISPATCH_MAX_INTERVAL_MS,
  TRIP_REQUEST_TIMEOUT_MS,
  MOCK_PASSENGERS,
  MOCK_ROUTES,
  MOCK_ERRANDS,
  MOCK_DELIVERIES,
  MOCK_PARCELS,
  FARE_BASE,
  FARE_PER_KM,
  FARE_PER_MIN,
  FARE_MINIMUM,
} from '../config/constants';
import {
  TripRequestDTO,
  ErrandRequestDTO,
  DeliveryRequestDTO,
  WorkMode,
} from '../types';

/** What kind of job currently occupies the single pending slot. */
export type PendingKind = 'trip' | 'errand' | 'delivery';

type TripDispatchCb = (trip: TripRequestDTO) => void;
type ErrandDispatchCb = (errand: ErrandRequestDTO) => void;
type DeliveryDispatchCb = (delivery: DeliveryRequestDTO) => void;
type TimeoutCallback = (id: string, kind: PendingKind) => void;

let tripCallback: TripDispatchCb | null = null;
let errandCallback: ErrandDispatchCb | null = null;
let deliveryCallback: DeliveryDispatchCb | null = null;
let timeoutCallback: TimeoutCallback | null = null;
let dispatchTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let currentPendingId: string | null = null;
let currentPendingKind: PendingKind | null = null;
let isOnline = false;

// The driver may now enable MULTIPLE job categories at once. The scheduler
// picks a random enabled mode each cycle and generates the matching job.
let enabledModes: Set<WorkMode> = new Set<WorkMode>(['pasajero']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcFare(distanceKm: number, minutes: number): number {
  const gross = FARE_BASE + distanceKm * FARE_PER_KM + minutes * FARE_PER_MIN;
  return Math.max(gross, FARE_MINIMUM);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickEnabledMode(): WorkMode | null {
  const modes = [...enabledModes];
  if (modes.length === 0) return null;
  return modes[randomBetween(0, modes.length - 1)]!;
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

function generateDelivery(kind: 'food' | 'parcel'): DeliveryRequestDTO {
  const pool = kind === 'food' ? MOCK_DELIVERIES : MOCK_PARCELS;
  const template = pool[randomBetween(0, pool.length - 1)]!;
  return { id: crypto.randomUUID(), ...template };
}

/** Emit one job of the given mode through the matching callback. */
function emitForMode(mode: WorkMode): void {
  switch (mode) {
    case 'mandado': {
      if (!errandCallback) return;
      const errand = generateErrand();
      currentPendingId = errand.id;
      currentPendingKind = 'errand';
      errandCallback(errand);
      return;
    }
    case 'pedido': {
      if (!deliveryCallback) return;
      const delivery = generateDelivery('food');
      currentPendingId = delivery.id;
      currentPendingKind = 'delivery';
      deliveryCallback(delivery);
      return;
    }
    case 'paquete': {
      if (!deliveryCallback) return;
      const delivery = generateDelivery('parcel');
      currentPendingId = delivery.id;
      currentPendingKind = 'delivery';
      deliveryCallback(delivery);
      return;
    }
    case 'pasajero':
    default: {
      if (!tripCallback) return;
      const trip = generateTrip();
      currentPendingId = trip.id;
      currentPendingKind = 'trip';
      tripCallback(trip);
      return;
    }
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

function scheduleNext(): void {
  if (!isOnline) return;
  const delay = randomBetween(DISPATCH_MIN_INTERVAL_MS, DISPATCH_MAX_INTERVAL_MS);

  dispatchTimer = setTimeout(() => {
    if (!isOnline) return;

    const mode = pickEnabledMode();
    if (!mode) return; // no categories enabled → stay idle

    emitForMode(mode);
    if (!currentPendingId || !currentPendingKind) return;

    const pendingKind = currentPendingKind;
    pendingTimeout = setTimeout(() => {
      if (currentPendingId) {
        const id = currentPendingId;
        currentPendingId = null;
        currentPendingKind = null;
        timeoutCallback?.(id, pendingKind);
        scheduleNext();
      }
    }, TRIP_REQUEST_TIMEOUT_MS);
  }, delay);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startDispatch(
  onTrip: TripDispatchCb,
  onTimeout: TimeoutCallback,
  modes: WorkMode[] = ['pasajero'],
  onErrand?: ErrandDispatchCb,
  onDelivery?: DeliveryDispatchCb,
): void {
  tripCallback = onTrip;
  errandCallback = onErrand ?? null;
  deliveryCallback = onDelivery ?? null;
  timeoutCallback = onTimeout;
  enabledModes = new Set(modes.length > 0 ? modes : ['pasajero']);
  isOnline = true;
  scheduleNext();
}

/** Replace the set of enabled job categories. Safe to call while online. */
export function setDriverModes(modes: WorkMode[]): void {
  enabledModes = new Set(modes.length > 0 ? modes : ['pasajero']);
}

export function getDriverModes(): WorkMode[] {
  return [...enabledModes];
}

export function stopDispatch(): void {
  isOnline = false;
  if (dispatchTimer) { clearTimeout(dispatchTimer); dispatchTimer = null; }
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  currentPendingId = null;
  currentPendingKind = null;
}

export function acknowledgeTripResponse(id: string): boolean {
  if (currentPendingId !== id) return false;
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  currentPendingId = null;
  currentPendingKind = null;
  return true;
}

// Aliases for the errand and delivery flows — they share the single pending slot.
export const acknowledgeErrandResponse = acknowledgeTripResponse;
export const acknowledgeDeliveryResponse = acknowledgeTripResponse;

export function resumeDispatch(): void {
  if (isOnline) scheduleNext();
}
