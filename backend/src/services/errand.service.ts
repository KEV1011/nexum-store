import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { ErrandCategory as PrismaErrandCategory } from '@prisma/client';
import {
  ErrandCategory,
  ErrandStatus,
  ClientErrandDTO,
  RequestClientErrandDTO,
  ErrandRequestDTO,
} from '../types';
import { ERRAND_SERVICE_FEE } from '../config/constants';

const ERRAND_CATEGORY_MAP: Record<string, PrismaErrandCategory> = {
  pharmacy: PrismaErrandCategory.PHARMACY,
  groceries: PrismaErrandCategory.GROCERIES,
  documents: PrismaErrandCategory.DOCUMENTS,
  payments: PrismaErrandCategory.PAYMENTS,
  food: PrismaErrandCategory.FOOD,
  shopping: PrismaErrandCategory.SHOPPING,
  other: PrismaErrandCategory.OTHER,
};

// ─── Internal state ───────────────────────────────────────────────────────────

interface ClientErrand {
  id: string;
  requestRef: string;
  clientId: string;
  category: ErrandCategory;
  description: string;
  pickupAddress: string;
  dropoffAddress: string;
  serviceFee: number;
  purchaseBudget?: number;
  actualPurchaseCost?: number;
  notes?: string;
  status: ErrandStatus;
  driverName?: string;
  driverPhone?: string;
  createdAt: Date;
  acceptedAt?: Date;
  deliveredAt?: Date;
}

const errandStore = new Map<string, ClientErrand>();
const clientActiveErrand = new Map<string, string>(); // clientId → errandId

type ErrandCallback = (errandId: string, errand: ClientErrandDTO) => void;
const errandListeners = new Map<string, Set<ErrandCallback>>();

// ─── Public API ───────────────────────────────────────────────────────────────

export function requestClientErrand(
  clientId: string,
  dto: RequestClientErrandDTO,
): ClientErrandDTO {
  const id = `cern-${randomUUID().slice(0, 8)}`;
  const requestRef = `NXE-${Math.floor(1000 + Math.random() * 8000)}`;

  const errand: ClientErrand = {
    id,
    requestRef,
    clientId,
    category: dto.category,
    description: dto.description,
    pickupAddress: dto.pickupAddress,
    dropoffAddress: dto.dropoffAddress,
    serviceFee: ERRAND_SERVICE_FEE,
    purchaseBudget: dto.purchaseBudget,
    notes: dto.notes,
    status: 'searching',
    createdAt: new Date(),
  };

  errandStore.set(id, errand);
  clientActiveErrand.set(clientId, id);

  // Persist to DB (fire-and-forget)
  prisma.errand.create({
    data: {
      id, requestRef, userId: clientId,
      category: ERRAND_CATEGORY_MAP[dto.category.toLowerCase()] ?? PrismaErrandCategory.OTHER,
      description: dto.description,
      pickupAddress: dto.pickupAddress,
      dropoffAddress: dto.dropoffAddress,
      serviceFee: ERRAND_SERVICE_FEE,
      purchaseBudget: dto.purchaseBudget,
      notes: dto.notes,
    },
  }).catch(() => { /* non-fatal */ });

  return _toDTO(errand);
}

export function acceptClientErrand(
  errandId: string,
  driverName: string,
  driverPhone: string,
): ClientErrandDTO | null {
  const errand = errandStore.get(errandId);
  if (!errand || errand.status !== 'searching') return null;
  errand.status = 'accepted';
  errand.acceptedAt = new Date();
  errand.driverName = driverName;
  errand.driverPhone = driverPhone;
  _notify(errandId, errand);
  return _toDTO(errand);
}

export function updateErrandStatus(
  errandId: string,
  status: ErrandStatus,
  actualCost?: number,
): ClientErrandDTO | null {
  const errand = errandStore.get(errandId);
  if (!errand) return null;
  errand.status = status;
  if (actualCost !== undefined) errand.actualPurchaseCost = actualCost;
  if (status === 'delivered') errand.deliveredAt = new Date();
  _notify(errandId, errand);
  return _toDTO(errand);
}

export function cancelClientErrand(clientId: string, errandId: string): boolean {
  const errand = errandStore.get(errandId);
  if (!errand || errand.clientId !== clientId) return false;
  if (!['searching', 'accepted'].includes(errand.status)) return false;
  errand.status = 'cancelled';
  _notify(errandId, errand);
  return true;
}

export function getActiveClientErrand(clientId: string): ClientErrandDTO | null {
  const id = clientActiveErrand.get(clientId);
  if (!id) return null;
  const errand = errandStore.get(id);
  if (!errand) return null;
  const activeStatuses: ErrandStatus[] = ['searching', 'accepted', 'shopping', 'on_the_way'];
  if (!activeStatuses.includes(errand.status)) return null;
  return _toDTO(errand);
}

export function getClientErrandById(
  clientId: string,
  errandId: string,
): ClientErrandDTO | null {
  const errand = errandStore.get(errandId);
  if (!errand || errand.clientId !== clientId) return null;
  return _toDTO(errand);
}

export function getClientErrandRaw(errandId: string): ClientErrand | undefined {
  return errandStore.get(errandId);
}

export function subscribeClientErrand(errandId: string, cb: ErrandCallback): () => void {
  if (!errandListeners.has(errandId)) errandListeners.set(errandId, new Set());
  errandListeners.get(errandId)!.add(cb);
  return () => errandListeners.get(errandId)?.delete(cb);
}

export function getClientErrandSnapshot(errandId: string): ClientErrandDTO | null {
  const errand = errandStore.get(errandId);
  if (!errand) return null;
  return _toDTO(errand);
}

// Convert a raw errand to the DTO the driver app receives
export function toErrandRequestDTO(errand: ClientErrand): ErrandRequestDTO {
  return {
    id: errand.id,
    category: errand.category,
    description: errand.description,
    pickupAddress: errand.pickupAddress,
    dropoffAddress: errand.dropoffAddress,
    serviceFee: errand.serviceFee,
    purchaseBudget: errand.purchaseBudget,
    notes: errand.notes,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _notify(errandId: string, errand: ClientErrand): void {
  const dto = _toDTO(errand);
  for (const cb of errandListeners.get(errandId) ?? []) cb(errandId, dto);
}

function _toDTO(e: ClientErrand): ClientErrandDTO {
  return {
    id: e.id,
    requestRef: e.requestRef,
    category: e.category,
    description: e.description,
    pickupAddress: e.pickupAddress,
    dropoffAddress: e.dropoffAddress,
    serviceFee: e.serviceFee,
    purchaseBudget: e.purchaseBudget,
    actualPurchaseCost: e.actualPurchaseCost,
    notes: e.notes,
    status: e.status,
    driverName: e.driverName,
    driverPhone: e.driverPhone,
    createdAt: e.createdAt.toISOString(),
    acceptedAt: e.acceptedAt?.toISOString(),
    deliveredAt: e.deliveredAt?.toISOString(),
  };
}
