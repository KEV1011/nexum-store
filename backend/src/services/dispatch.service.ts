import crypto from 'crypto';
import {
  DISPATCH_MIN_INTERVAL_MS,
  DISPATCH_MAX_INTERVAL_MS,
  TRIP_REQUEST_TIMEOUT_MS,
  MOCK_ERRANDS,
} from '../config/constants';
import { ErrandRequestDTO, WorkMode } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Errand (mandado) dispatch simulator.
//
// Trip dispatch has been replaced by the real geospatial matching engine in
// matching.service.ts.  This file keeps only the errand simulation used in
// mandado work-mode until Phase 4 wires real errand matching.
// ─────────────────────────────────────────────────────────────────────────────

type ErrandDispatchCb = (errand: ErrandRequestDTO) => void;
type TimeoutCallback = (id: string) => void;

let errandCallback: ErrandDispatchCb | null = null;
let timeoutCallback: TimeoutCallback | null = null;
let dispatchTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let currentPendingId: string | null = null;
let isOnline = false;
let currentWorkMode: WorkMode = 'pasajero';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateErrand(): ErrandRequestDTO {
  const template = MOCK_ERRANDS[randomBetween(0, MOCK_ERRANDS.length - 1)]!;
  return { id: crypto.randomUUID(), ...template };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

function scheduleNext(): void {
  if (!isOnline || currentWorkMode !== 'mandado') return;
  const delay = randomBetween(DISPATCH_MIN_INTERVAL_MS, DISPATCH_MAX_INTERVAL_MS);

  dispatchTimer = setTimeout(() => {
    if (!isOnline || !errandCallback) return;

    const errand = generateErrand();
    currentPendingId = errand.id;
    errandCallback(errand);

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
  onTimeout: TimeoutCallback,
  workMode: WorkMode = 'pasajero',
  onErrand?: ErrandDispatchCb,
): void {
  errandCallback = onErrand ?? null;
  timeoutCallback = onTimeout;
  currentWorkMode = workMode;
  isOnline = true;
  if (workMode === 'mandado') scheduleNext();
}

export function setDriverWorkMode(mode: WorkMode): void {
  const wasNotMandado = currentWorkMode !== 'mandado';
  currentWorkMode = mode;
  if (mode === 'mandado' && wasNotMandado && isOnline && !dispatchTimer) scheduleNext();
}

export function stopDispatch(): void {
  isOnline = false;
  if (dispatchTimer) { clearTimeout(dispatchTimer); dispatchTimer = null; }
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  currentPendingId = null;
}

export function acknowledgeErrandResponse(id: string): boolean {
  if (currentPendingId !== id) return false;
  if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null; }
  currentPendingId = null;
  return true;
}

export function resumeDispatch(): void {
  if (isOnline && currentWorkMode === 'mandado') scheduleNext();
}
