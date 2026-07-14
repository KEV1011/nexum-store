import {
  ErrandCategory,
  ErrandStatus,
  ClientErrandDTO,
  RequestClientErrandDTO,
  ErrandRequestDTO,
} from '../types';
import { DriverStatus } from '@prisma/client';
import { ERRAND_SERVICE_FEE } from '../config/constants';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { sendPushToClient } from './push.service';

// ─── Ephemeral WS subscription state ──────────────────────────────────────────
type ErrandCallback = (errandId: string, errand: ClientErrandDTO) => void;
const errandListeners = new Map<string, Set<ErrandCallback>>();

// ─── Enum mappings ─────────────────────────────────────────────────────────────

const CATEGORY_TO_PRISMA: Record<ErrandCategory, string> = {
  pharmacy: 'PHARMACY', groceries: 'GROCERIES', documents: 'DOCUMENTS',
  payments: 'PAYMENTS', food: 'FOOD', shopping: 'SHOPPING', other: 'OTHER',
};

const STATUS_TO_PRISMA: Record<ErrandStatus, 'SEARCHING' | 'ACCEPTED' | 'SHOPPING' | 'ON_THE_WAY' | 'DELIVERED' | 'CANCELLED'> = {
  searching: 'SEARCHING', accepted: 'ACCEPTED', shopping: 'SHOPPING',
  on_the_way: 'ON_THE_WAY', delivered: 'DELIVERED', cancelled: 'CANCELLED',
};

const STATUS_FROM_PRISMA: Record<string, ErrandStatus> = {
  SEARCHING: 'searching', ACCEPTED: 'accepted', SHOPPING: 'shopping',
  ON_THE_WAY: 'on_the_way', DELIVERED: 'delivered', CANCELLED: 'cancelled',
};

const CATEGORY_FROM_PRISMA: Record<string, ErrandCategory> = {
  PHARMACY: 'pharmacy', GROCERIES: 'groceries', DOCUMENTS: 'documents',
  PAYMENTS: 'payments', FOOD: 'food', SHOPPING: 'shopping', OTHER: 'other',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DbErrand = {
  id: string; requestRef: string; category: string; description: string;
  pickupAddress: string; dropoffAddress: string; serviceFee: number;
  purchaseBudget: number | null; actualCost: number | null; notes: string | null;
  status: string; driverName: string | null; driverPhone: string | null;
  createdAt: Date; acceptedAt: Date | null; deliveredAt: Date | null;
  userId: string;
  proofPhotoUrl: string | null; deliveryPhotoUrl: string | null;
};

function _toDTO(e: DbErrand): ClientErrandDTO {
  return {
    id: e.id,
    requestRef: e.requestRef,
    category: (CATEGORY_FROM_PRISMA[e.category] ?? 'other') as ErrandCategory,
    description: e.description,
    pickupAddress: e.pickupAddress,
    dropoffAddress: e.dropoffAddress,
    serviceFee: e.serviceFee,
    purchaseBudget: e.purchaseBudget ?? undefined,
    actualPurchaseCost: e.actualCost ?? undefined,
    notes: e.notes ?? undefined,
    status: (STATUS_FROM_PRISMA[e.status] ?? 'searching') as ErrandStatus,
    driverName: e.driverName ?? undefined,
    // Privacy: masked reference only, communication via in-app chat.
    driverPhone: maskPhone(e.driverPhone),
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(e.driverPhone),
    createdAt: e.createdAt.toISOString(),
    acceptedAt: e.acceptedAt?.toISOString(),
    deliveredAt: e.deliveredAt?.toISOString(),
    // Prueba de custodia subida por el mandadero (recogida y entrega).
    pickupPhotoUrl: e.proofPhotoUrl ?? undefined,
    deliveryPhotoUrl: e.deliveryPhotoUrl ?? undefined,
  };
}

function _notify(errandId: string, errand: ClientErrandDTO): void {
  for (const cb of errandListeners.get(errandId) ?? []) cb(errandId, errand);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function requestClientErrand(
  clientId: string,
  dto: RequestClientErrandDTO,
): Promise<ClientErrandDTO> {
  const requestRef = `NXE-${Math.floor(1000 + Math.random() * 8000)}`;
  const errand = await prisma.errand.create({
    data: {
      requestRef,
      userId: clientId,
      category: CATEGORY_TO_PRISMA[dto.category] as 'PHARMACY',
      description: dto.description,
      pickupAddress: dto.pickupAddress,
      dropoffAddress: dto.dropoffAddress,
      serviceFee: ERRAND_SERVICE_FEE,
      purchaseBudget: dto.purchaseBudget ?? null,
      notes: dto.notes ?? null,
      status: 'SEARCHING',
    },
  });
  return _toDTO(errand);
}

export async function acceptClientErrand(
  errandId: string,
  driverName: string,
  driverPhone: string,
  driverId?: string,
): Promise<ClientErrandDTO | null> {
  const existing = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!existing || existing.status !== 'SEARCHING') return null;

  // Sella la empresa del conductor al aceptar: el mandado queda atribuido a
  // su flota y aparece en la liquidación del portal (/operator/trips + CSV).
  let operatorSeal: string | null = null;
  if (driverId) {
    const d = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { operatorId: true },
    });
    operatorSeal = d?.operatorId ?? null;
  }

  const updated = await prisma.errand.update({
    where: { id: errandId },
    data: {
      status: 'ACCEPTED',
      acceptedAt: new Date(),
      driverName,
      driverPhone,
      ...(driverId ? { driverId } : {}),
      ...(operatorSeal ? { operatorId: operatorSeal } : {}),
    },
  });

  // Marca al conductor en viaje para que el matching geoespacial no le ofrezca
  // otro servicio mientras hace el mandado (se libera al entregar/cancelar).
  if (driverId) {
    await prisma.driver.update({
      where: { id: driverId },
      data: { status: DriverStatus.ON_TRIP },
    });
  }

  const dto = _toDTO(updated);
  _notify(errandId, dto);

  // Push FCM en paralelo al WS: el cliente se entera aunque tenga la app cerrada.
  void sendPushToClient(existing.userId, {
    title: 'Mandadero asignado',
    body: `${driverName} se encargará de tu mandado.`,
    data: { type: 'errand_accepted', errandId },
  });
  return dto;
}

export async function updateErrandStatus(
  errandId: string,
  status: ErrandStatus,
  actualCost?: number,
): Promise<ClientErrandDTO | null> {
  const existing = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!existing) return null;

  const updated = await prisma.errand.update({
    where: { id: errandId },
    data: {
      status: STATUS_TO_PRISMA[status],
      ...(actualCost !== undefined && { actualCost }),
      ...(status === 'delivered' && { deliveredAt: new Date() }),
    },
  });
  const dto = _toDTO(updated);
  _notify(errandId, dto);

  if (status === 'delivered') {
    void sendPushToClient(existing.userId, {
      title: 'Mandado entregado',
      body: 'Tu mandado fue entregado. ¡Gracias por usar Nexum!',
      data: { type: 'errand_delivered', errandId },
    });
  }
  return dto;
}

export async function cancelClientErrand(clientId: string, errandId: string): Promise<boolean> {
  const errand = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!errand || errand.userId !== clientId) return false;
  if (!['SEARCHING', 'ACCEPTED'].includes(errand.status)) return false;

  const updated = await prisma.errand.update({ where: { id: errandId }, data: { status: 'CANCELLED' } });
  _notify(errandId, _toDTO(updated));
  return true;
}

export async function getActiveClientErrand(clientId: string): Promise<ClientErrandDTO | null> {
  const errand = await prisma.errand.findFirst({
    where: {
      userId: clientId,
      status: { in: ['SEARCHING', 'ACCEPTED', 'SHOPPING', 'ON_THE_WAY'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  return errand ? _toDTO(errand) : null;
}

export async function getClientErrandById(clientId: string, errandId: string): Promise<ClientErrandDTO | null> {
  const errand = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!errand || errand.userId !== clientId) return null;
  return _toDTO(errand);
}

export async function getClientErrandRaw(errandId: string): Promise<{ clientId: string } | undefined> {
  const errand = await prisma.errand.findUnique({ where: { id: errandId }, select: { userId: true } });
  if (!errand) return undefined;
  return { clientId: errand.userId };
}

export function subscribeClientErrand(errandId: string, cb: ErrandCallback): () => void {
  if (!errandListeners.has(errandId)) errandListeners.set(errandId, new Set());
  errandListeners.get(errandId)!.add(cb);
  return () => errandListeners.get(errandId)?.delete(cb);
}

export async function getClientErrandSnapshot(errandId: string): Promise<ClientErrandDTO | null> {
  const errand = await prisma.errand.findUnique({ where: { id: errandId } });
  return errand ? _toDTO(errand) : null;
}

export function toErrandRequestDTO(errand: { id: string; category: string; description: string; pickupAddress: string; dropoffAddress: string; serviceFee: number; purchaseBudget: number | null; notes: string | null }): ErrandRequestDTO {
  return {
    id: errand.id,
    category: (CATEGORY_FROM_PRISMA[errand.category] ?? 'other') as ErrandCategory,
    description: errand.description,
    pickupAddress: errand.pickupAddress,
    dropoffAddress: errand.dropoffAddress,
    serviceFee: errand.serviceFee,
    purchaseBudget: errand.purchaseBudget ?? undefined,
    notes: errand.notes ?? undefined,
  };
}

/**
 * Datos que el motor de matching necesita para ofrecer un mandado a un
 * conductor: el estado actual (para no ofrecer uno ya aceptado/cancelado) y el
 * DTO `errand_request` que se envía por WebSocket. Devuelve null si no existe.
 */
export async function getErrandOfferInfo(
  errandId: string,
): Promise<{ status: ErrandStatus; dto: ErrandRequestDTO } | null> {
  const errand = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!errand) return null;
  return {
    status: (STATUS_FROM_PRISMA[errand.status] ?? 'searching') as ErrandStatus,
    dto: toErrandRequestDTO(errand),
  };
}
