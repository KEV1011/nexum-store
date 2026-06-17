import { DriverStatus } from '@prisma/client';
import {
  ErrandCategory,
  ErrandStatus,
  ClientErrandDTO,
  RequestClientErrandDTO,
  ErrandRequestDTO,
} from '../types';
import { ERRAND_SERVICE_FEE } from '../config/constants';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { sendPushToDriver, sendPushToClient } from './push.service';
import { getDriverProfile } from './driver-profile.service';

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
  pickupLat: number | null; pickupLng: number | null;
  purchaseBudget: number | null; actualCost: number | null; notes: string | null;
  status: string; driverName: string | null; driverPhone: string | null;
  createdAt: Date; acceptedAt: Date | null; deliveredAt: Date | null;
  userId: string;
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
      pickupLat: dto.pickupLat ?? null,
      pickupLng: dto.pickupLng ?? null,
      serviceFee: ERRAND_SERVICE_FEE,
      purchaseBudget: dto.purchaseBudget ?? null,
      notes: dto.notes ?? null,
      status: 'SEARCHING',
    },
  });
  // Fire-and-forget: ofrecer el mandado a conductores reales en modo mandado.
  void startErrandMatching(errand.id);
  return _toDTO(errand);
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
  if (status === 'delivered' || status === 'cancelled') errandDeclined.delete(errandId);
  const dto = _toDTO(updated);
  _notify(errandId, dto);
  return dto;
}

export async function cancelClientErrand(clientId: string, errandId: string): Promise<boolean> {
  const errand = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!errand || errand.userId !== clientId) return false;
  if (!['SEARCHING', 'ACCEPTED'].includes(errand.status)) return false;

  const updated = await prisma.errand.update({ where: { id: errandId }, data: { status: 'CANCELLED' } });
  _notify(errandId, _toDTO(updated));

  // Cortar el ciclo de ofertas (si seguía buscando) y avisar al conductor
  // implicado: el que tenía la oferta pendiente o el que ya había aceptado.
  const offer = errandOffers.get(errandId);
  if (offer) {
    clearTimeout(offer.timeout);
    errandOffers.delete(errandId);
    _sendErrandToDriver?.(offer.currentDriverId, {
      type: 'errand_cancelled', errandId, reason: 'El cliente canceló el mandado',
    });
  }
  errandDeclined.delete(errandId);
  if (errand.status === 'ACCEPTED' && errand.driverId) {
    _sendErrandToDriver?.(errand.driverId, {
      type: 'errand_cancelled', errandId, reason: 'El cliente canceló el mandado',
    });
    // El conductor queda libre para recibir nuevas solicitudes.
    try {
      await prisma.driver.update({ where: { id: errand.driverId }, data: { status: DriverStatus.ONLINE } });
    } catch { /* el conductor puede no existir en escenarios de seed */ }
  }
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

export async function getClientErrandRaw(
  errandId: string,
): Promise<{ clientId: string; driverId: string | null } | undefined> {
  const errand = await prisma.errand.findUnique({
    where: { id: errandId },
    select: { userId: true, driverId: true },
  });
  if (!errand) return undefined;
  return { clientId: errand.userId, driverId: errand.driverId };
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

export function toErrandRequestDTO(errand: { id: string; category: string; description: string; pickupAddress: string; dropoffAddress: string; pickupLat?: number | null; pickupLng?: number | null; serviceFee: number; purchaseBudget: number | null; notes: string | null }): ErrandRequestDTO {
  return {
    id: errand.id,
    category: (CATEGORY_FROM_PRISMA[errand.category] ?? 'other') as ErrandCategory,
    description: errand.description,
    pickupAddress: errand.pickupAddress,
    dropoffAddress: errand.dropoffAddress,
    pickupLat: errand.pickupLat ?? undefined,
    pickupLng: errand.pickupLng ?? undefined,
    serviceFee: errand.serviceFee,
    purchaseBudget: errand.purchaseBudget ?? undefined,
    notes: errand.notes ?? undefined,
  };
}

// ─── Matching geoespacial real (PostGIS offer cycle) ──────────────────────────
//
// Reemplaza al antiguo simulador de mandados (dispatch.service.ts). Cuando un
// cliente crea un Errand en SEARCHING se buscan conductores reales: ONLINE,
// verificados, en modo de trabajo MANDADO y cerca del punto de recogida
// (PostGIS). El mandado se ofrece a un conductor a la vez por WebSocket
// (`errand_request`), con timeout y avance al siguiente candidato — el mismo
// patrón que los viajes urbanos (matching.service.ts) e intermunicipales
// (intercity.service.ts).

const ERRAND_OFFER_TIMEOUT_MS = 15_000;
const ERRAND_SEARCH_RADIUS_M = 5_000;  // cubre el casco urbano de Pamplona
const ERRAND_MAX_CANDIDATES = 5;
const ERRAND_GEO_FRESHNESS_S = 120;    // ignora fixes de hace más de 2 min
// Al conectarse un conductor en modo mandado se reintentan los mandados en
// SEARCHING recientes (ventana acotada para no revivir solicitudes viejas).
const ERRAND_REKICK_WINDOW_MS = 30 * 60_000;

// Punto de referencia cuando el cliente no mandó coordenadas de recogida —
// mismo default que los viajes urbanos (centro de Pamplona).
const PAMPLONA_CENTER = { lat: 7.3754, lng: -72.6486 };

interface ErrandOfferState {
  errandId: string;
  candidates: string[];
  candidateIndex: number;
  currentDriverId: string;
  timeout: NodeJS.Timeout;
}

// errandId → oferta activa (a lo sumo una a la vez por mandado)
const errandOffers = new Map<string, ErrandOfferState>();
// errandId → conductores que ya rechazaron (no volver a ofrecerles)
const errandDeclined = new Map<string, Set<string>>();

// Inyectado por ws.handler.ts al arrancar — este servicio no conoce sockets.
let _sendErrandToDriver: ((driverId: string, msg: Record<string, unknown>) => void) | null = null;

export function registerErrandSendToDriver(
  fn: (driverId: string, msg: Record<string, unknown>) => void,
): void {
  _sendErrandToDriver = fn;
}

async function _findErrandDrivers(
  pickupLat: number,
  pickupLng: number,
  exclude: Set<string>,
): Promise<string[]> {
  // Parámetros internos (constantes + datos de BD): sin strings de usuario.
  // SQL parametrizado vía tagged template — nunca interpolación.
  const rows = await prisma.$queryRaw<Array<{ driver_id: string; distance_m: number }>>`
    SELECT d."id" AS driver_id,
           ST_Distance(
             d."geo",
             ST_SetSRID(ST_MakePoint(${pickupLng}, ${pickupLat}), 4326)::geography
           ) AS distance_m
    FROM "drivers" d
    WHERE d."geo" IS NOT NULL
      AND d."status" = 'ONLINE'
      AND d."isVerified" = true
      AND d."workMode" = 'MANDADO'
      AND d."lastSeenAt" >= now() - ${ERRAND_GEO_FRESHNESS_S} * INTERVAL '1 second'
      AND ST_DWithin(
            d."geo",
            ST_SetSRID(ST_MakePoint(${pickupLng}, ${pickupLat}), 4326)::geography,
            ${ERRAND_SEARCH_RADIUS_M}
          )
    ORDER BY distance_m ASC
    LIMIT ${ERRAND_MAX_CANDIDATES + 5}`;
  return rows
    .map((r) => r.driver_id)
    .filter((id) => !exclude.has(id))
    .slice(0, ERRAND_MAX_CANDIDATES);
}

/** Arranca (o reinicia) el ciclo de oferta a conductores reales. */
export async function startErrandMatching(errandId: string): Promise<void> {
  const errand = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!errand || errand.status !== 'SEARCHING') return;
  if (errandOffers.has(errandId)) return; // ya hay una oferta en curso

  const lat = errand.pickupLat ?? PAMPLONA_CENTER.lat;
  const lng = errand.pickupLng ?? PAMPLONA_CENTER.lng;
  const declined = errandDeclined.get(errandId) ?? new Set<string>();
  const candidates = await _findErrandDrivers(lat, lng, declined);
  if (candidates.length === 0) {
    // Sin datos personales en logs: solo ids técnicos.
    console.log(`[Errand] No drivers available for errand ${errandId}`);
    return;
  }
  await _offerErrandTo(errandId, candidates, 0);
}

async function _offerErrandTo(
  errandId: string,
  candidates: string[],
  index: number,
): Promise<void> {
  if (index >= candidates.length) {
    console.log(`[Errand] All ${candidates.length} candidates exhausted for errand ${errandId}`);
    return;
  }
  const driverId = candidates[index]!;

  // El mandado pudo cancelarse o aceptarse mientras tanto.
  const errand = await prisma.errand.findUnique({ where: { id: errandId } });
  if (!errand || errand.status !== 'SEARCHING') return;

  const dto = toErrandRequestDTO(errand);

  const timeout = setTimeout(() => {
    // Sin respuesta: limpiar el popup del conductor y pasar al siguiente.
    _sendErrandToDriver?.(driverId, {
      type: 'errand_cancelled', errandId, reason: 'Tiempo de respuesta agotado',
    });
    void driverDeclineErrand(driverId, errandId);
  }, ERRAND_OFFER_TIMEOUT_MS);

  errandOffers.set(errandId, {
    errandId,
    candidates,
    candidateIndex: index,
    currentDriverId: driverId,
    timeout,
  });

  _sendErrandToDriver?.(driverId, { type: 'errand_request', errand: dto });
  // Push FCM en paralelo al WS: despierta la app si está en background.
  void sendPushToDriver(driverId, {
    title: 'Nuevo mandado disponible',
    body: `${dto.description.slice(0, 80)} · servicio $${Math.round(dto.serviceFee)}`,
    data: { type: 'errand_request', errandId },
  });
  console.log(
    `[Errand] Offered errand ${errandId} to driver ${driverId} ` +
      `(candidate ${index + 1}/${candidates.length})`,
  );
}

/**
 * El conductor rechaza la oferta (o se agota el timeout). Si `driverId` no
 * coincide con la oferta vigente se ignora (evita que un timeout viejo avance
 * el ciclo después de una aceptación).
 */
export async function driverDeclineErrand(driverId: string, errandId: string): Promise<void> {
  const state = errandOffers.get(errandId);
  if (!state || state.currentDriverId !== driverId) return;
  clearTimeout(state.timeout);
  errandOffers.delete(errandId);

  if (!errandDeclined.has(errandId)) errandDeclined.set(errandId, new Set());
  errandDeclined.get(errandId)!.add(driverId);

  await _offerErrandTo(errandId, state.candidates, state.candidateIndex + 1);
}

/**
 * El conductor ofertado acepta el mandado. Verifica transaccionalmente que el
 * Errand siga en SEARCHING, lo pasa a ACCEPTED con la identidad real del
 * conductor y lo deja ocupado (ON_TRIP). Devuelve el DTO o `null` si la
 * oferta ya no es válida (otro conductor, cancelado o timeout vencido).
 */
export async function driverAcceptErrand(
  driverId: string,
  errandId: string,
): Promise<ClientErrandDTO | null> {
  const state = errandOffers.get(errandId);
  if (!state || state.currentDriverId !== driverId) return null;
  clearTimeout(state.timeout);
  errandOffers.delete(errandId);
  errandDeclined.delete(errandId);

  let driverName = 'Conductor Nexum';
  let driverPhone: string | null = null;
  try {
    const profile = await getDriverProfile(driverId);
    driverName = profile.fullName;
    driverPhone = profile.phone;
  } catch { /* sin perfil aún; continuar con defaults */ }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.errand.findUnique({
      where: { id: errandId },
      select: { status: true },
    });
    if (!current || current.status !== 'SEARCHING') return null;
    return tx.errand.update({
      where: { id: errandId },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), driverId, driverName, driverPhone },
    });
  });
  if (!updated) return null;

  try {
    await prisma.driver.update({ where: { id: driverId }, data: { status: DriverStatus.ON_TRIP } });
  } catch { /* el conductor puede no existir en escenarios de seed */ }

  const dto = _toDTO(updated);
  _notify(errandId, dto);
  void sendPushToClient(updated.userId, {
    title: 'Mandado aceptado',
    body: `${driverName} está haciendo tu mandado. Abre la app para seguirlo.`,
    data: { type: 'errand_accepted', errandId },
  });
  console.log(`[Errand] Driver ${driverId} accepted errand ${errandId}`);
  return dto;
}

/**
 * Reintenta el matching de mandados en SEARCHING sin oferta activa. Se llama
 * cuando un conductor entra en modo mandado: cubre el caso de un mandado
 * creado cuando aún no había conductores disponibles.
 */
export async function kickPendingErrandMatching(): Promise<void> {
  const pending = await prisma.errand.findMany({
    where: {
      status: 'SEARCHING',
      createdAt: { gte: new Date(Date.now() - ERRAND_REKICK_WINDOW_MS) },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const e of pending) {
    if (!errandOffers.has(e.id)) void startErrandMatching(e.id);
  }
}
