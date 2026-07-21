import { DriverStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { TripRequestDTO } from '../types';
import { sendPushToDriver, sendPushToClient } from '../services/push.service';
import { getErrandOfferInfo } from './errand.service';
import { getOrderOfferInfo } from './order-offer.service';
import { evaluateGeoJump } from './fraud.service';
import { onDriverHeartbeat } from './safety-alerts.service';
import { pilotSkipVerification } from './kyc.service';
import { docKillSwitchEnforced } from './document-expiry.service';

// ─────────────────────────────────────────────────────────────────────────────
// Geospatial matching service (PostGIS).
//
// Replaces the old dispatch *simulator*. Responsibilities:
//   • Persist each driver's live position into the PostGIS `geo` column.
//   • Find the nearest available drivers to a trip origin (ST_DWithin/ST_Distance).
//   • Run a one-driver-at-a-time offer cycle with timeout + fallback to the next
//     nearest driver (idempotent: a SEARCHING trip is never offered to two
//     drivers simultaneously).
//
// Prisma has no native PostGIS type, so all geo reads/writes use parameterised
// raw SQL (tagged templates ⇒ no string interpolation ⇒ injection-safe).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Phase 1: driver position writes ─────────────────────────────────────────

/**
 * Persist a driver's latest GPS fix.
 *
 * Writes the PostGIS `geo` point (note: ST_MakePoint takes lng,lat) alongside
 * the plain lastLat/lastLng/lastSeenAt columns used for presence/debugging.
 * Safe to call on every location_update, whether or not the driver is on a trip.
 */
export async function updateDriverGeo(driverId: string, lat: number, lng: number): Promise<void> {
  // Antifraude: lee la posición previa y evalúa el salto (velocidad imposible)
  // antes de sobrescribirla — marca GPS falso sin bloquear jamás el fix.
  const prev = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { lastLat: true, lastLng: true, lastSeenAt: true },
  });
  if (prev) evaluateGeoJump(driverId, prev, lat, lng);

  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        "lastLat" = ${lat},
        "lastLng" = ${lng},
        "lastSeenAt" = now()
    WHERE "id" = ${driverId}`;

  // Seguridad operativa (geocerca de destino, detención, desvío): pasivo y
  // best-effort — jamás afecta el fix ni el servicio.
  void onDriverHeartbeat(driverId, lat, lng);
}

// ─── Phase 2: geospatial nearest-driver matching ──────────────────────────────

const OFFER_TIMEOUT_MS = 15_000;
const SEARCH_RADIUS_M = 5_000;   // 5 km initial radius
const MAX_CANDIDATES = 5;         // try up to 5 drivers before giving up
const GEO_FRESHNESS_S = 120;      // ignore drivers last seen > 2 min ago

type NearbyDriver = { driverId: string; distanceMeters: number };

interface OfferState {
  tripId: string;
  candidates: NearbyDriver[];
  candidateIndex: number;
  currentDriverId: string;
  timeout: NodeJS.Timeout;
}

// tripId → active offer state (at most one offer per trip at a time)
const activeOffers = new Map<string, OfferState>();

// Injected by ws.handler.ts at startup — keeps this service free of WS internals.
let _sendToDriver: ((driverId: string, msg: Record<string, unknown>) => void) | null = null;
let _notifyTripUpdate: ((tripId: string) => Promise<void>) | null = null;
// Inyectado desde ws.handler para avisar al pasajero cuando no hay conductores.
// Evita un import circular con client.service (que ya importa este módulo).
let _onNoDrivers: ((tripId: string) => void) | null = null;

export function registerSendToDriver(
  fn: (driverId: string, msg: Record<string, unknown>) => void,
): void {
  _sendToDriver = fn;
}

export function registerNotifyTripUpdate(fn: (tripId: string) => Promise<void>): void {
  _notifyTripUpdate = fn;
}

export function registerOnNoDrivers(fn: (tripId: string) => void): void {
  _onNoDrivers = fn;
}

// ─── Geo query ────────────────────────────────────────────────────────────────

/** Tipo de solicitud a despachar: decide qué preferencia del conductor aplica. */
type ServiceKind = 'trip' | 'errand' | 'order';

/**
 * Tipos de vehículo válidos para un servicio pedido. El pasajero que pide MOTO
 * solo debe recibir motos; quien pide carro (TAXI/PARTICULAR) solo carros —
 * antes se ofrecía "al azar". Envíos/mandados aceptan cualquier vehículo.
 */
function vehicleTypesForService(serviceType: string | null | undefined): string[] | null {
  switch (serviceType) {
    case 'MOTO':
      return ['MOTO'];
    case 'TAXI':
    case 'PARTICULAR':
      return ['TAXI', 'PARTICULAR'];
    default:
      return null; // ENVIOS / MANDADO / otros → cualquier vehículo activo
  }
}

async function findNearestAvailableDrivers(
  originLat: number,
  originLng: number,
  radiusMeters: number,
  maxResults: number,
  freshnessSeconds: number,
  serviceKind: ServiceKind,
  vehicleTypes: string[] | null = null,
): Promise<NearbyDriver[]> {
  // All parameters come from internal constants or trusted DB data — no user strings.
  // freshnessSeconds * INTERVAL '1 second' uses PostgreSQL's integer×interval operator.
  // Preferencias de servicio: cada tipo solo se ofrece a conductores que lo
  // aceptan (accepts*); el patrón (kind != X OR col) evita SQL dinámico.
  // Filtro de vehículo: si se pide carro/moto, solo conductores con ese tipo de
  // vehículo activo (EXISTS sobre vehicles). vehicleTypes viene de un mapa fijo.
  const vehicleFilter =
    vehicleTypes && vehicleTypes.length > 0
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "vehicles" v
          WHERE v."driverId" = d."id" AND v."isActive" = true
            AND v."type"::text IN (${Prisma.join(vehicleTypes)})
        )`
      : Prisma.empty;

  // Piloto: se puede despachar a conductores aún no verificados (default off →
  // en producción se exige d."isVerified" = true como siempre).
  const verifiedFilter = pilotSkipVerification()
    ? Prisma.empty
    : Prisma.sql`AND d."isVerified" = true`;

  // Kill-switch documental: con DOC_KILL_SWITCH_ENFORCE=true, un conductor con
  // documentos obligatorios vencidos (BLOCKED) se cae del matching.
  const complianceFilter = docKillSwitchEnforced()
    ? Prisma.sql`AND d."complianceStatus"::text <> 'BLOCKED'`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ driver_id: string; distance_m: number }>>`
    SELECT d."id" AS driver_id,
           ST_Distance(
             d."geo",
             ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography
           ) AS distance_m
    FROM "drivers" d
    WHERE d."geo" IS NOT NULL
      AND d."status" = 'ONLINE'
      ${verifiedFilter}
      ${complianceFilter}
      AND (${serviceKind} != 'trip' OR d."acceptsTrips" = true)
      AND (${serviceKind} != 'errand' OR d."acceptsErrands" = true)
      AND (${serviceKind} != 'order' OR d."acceptsOrders" = true)
      ${vehicleFilter}
      AND d."lastSeenAt" >= now() - ${freshnessSeconds} * INTERVAL '1 second'
      AND ST_DWithin(
            d."geo",
            ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography,
            ${radiusMeters}
          )
    ORDER BY distance_m ASC
    LIMIT ${maxResults}`;
  return rows.map((r) => ({ driverId: r.driver_id, distanceMeters: Number(r.distance_m) }));
}

/**
 * Posiciones anónimas de conductores ONLINE y frescos alrededor del cliente,
 * para pintar los vehículos cercanos en el mapa del home (solo coordenadas,
 * sin identidad del conductor).
 */
export async function getNearbyDriverPositions(
  lat: number,
  lng: number,
): Promise<Array<{ lat: number; lng: number; vehicleType: string }>> {
  const rows = await prisma.$queryRaw<
    Array<{ lat: number; lng: number; vehicleType: string | null }>
  >`
    SELECT ST_Y(d."geo"::geometry) AS lat,
           ST_X(d."geo"::geometry) AS lng,
           v."type"::text          AS "vehicleType"
    FROM "drivers" d
    LEFT JOIN LATERAL (
      SELECT "type" FROM "vehicles"
      WHERE "driverId" = d."id" AND "isActive" = true
      LIMIT 1
    ) v ON true
    WHERE d."geo" IS NOT NULL
      AND d."status" = 'ONLINE'
      AND d."isVerified" = true
      AND d."lastSeenAt" >= now() - ${GEO_FRESHNESS_S} * INTERVAL '1 second'
      AND ST_DWithin(
            d."geo",
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${SEARCH_RADIUS_M}
          )
    LIMIT 25`;
  return rows.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lng),
    vehicleType: r.vehicleType ?? 'PARTICULAR',
  }));
}

// ─── TripRequestDTO builder ───────────────────────────────────────────────────

async function buildTripRequestDTO(tripId: string): Promise<TripRequestDTO | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { passenger: true },
  });
  if (!trip || !trip.passenger) return null;
  return {
    id: trip.id,
    passenger: {
      id: trip.passenger.id,
      name: trip.passenger.name ?? 'Pasajero',
      rating: 5.0,
      verified: trip.passenger.kycStatus === 'VERIFIED',
    },
    origin: { lat: trip.originLat, lng: trip.originLng, address: trip.originAddress },
    destination: { lat: trip.destLat, lng: trip.destLng, address: trip.destAddress },
    distanceKm: trip.distanceKm ?? 0,
    estimatedMinutes: trip.etaMinutes ?? 0,
    estimatedFare: trip.estimatedFare,
    // Tipo de servicio: el conductor lo necesita para saber si es un ENVÍO
    // (requiere foto de recogida/entrega) vs un viaje de pasajero.
    serviceType: trip.serviceType,
  };
}

// ─── Offer cycle ──────────────────────────────────────────────────────────────

/**
 * Entry point — called from requestClientTrip after the Trip row is created.
 * Fire-and-forget from the caller's perspective.
 */
export async function startMatchingCycle(
  tripId: string,
  originLat: number,
  originLng: number,
): Promise<void> {
  // Filtra por tipo de vehículo pedido (carro vs moto) para no ofrecer "al azar".
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { serviceType: true },
  });
  const vehicleTypes = vehicleTypesForService(trip?.serviceType);
  const candidates = await findNearestAvailableDrivers(
    originLat,
    originLng,
    SEARCH_RADIUS_M,
    MAX_CANDIDATES,
    GEO_FRESHNESS_S,
    'trip',
    vehicleTypes,
  );
  if (candidates.length === 0) {
    console.log(`[Matching] No drivers available within ${SEARCH_RADIUS_M}m for trip ${tripId}`);
    _onNoDrivers?.(tripId);
    return;
  }
  await _offerToCandidate(tripId, candidates, 0);
}

async function _offerToCandidate(
  tripId: string,
  candidates: NearbyDriver[],
  index: number,
): Promise<void> {
  if (index >= candidates.length) {
    console.log(`[Matching] All ${candidates.length} candidates exhausted for trip ${tripId}`);
    _onNoDrivers?.(tripId);
    return;
  }

  const candidate = candidates[index]!;

  // Guard: trip must still be SEARCHING (may have been cancelled in the meantime)
  const current = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { status: true },
  });
  if (!current || current.status !== 'SEARCHING') return;

  const dto = await buildTripRequestDTO(tripId);
  if (!dto) return;

  const timeout = setTimeout(() => {
    void onDriverDeclineOrTimeout(tripId);
  }, OFFER_TIMEOUT_MS);

  activeOffers.set(tripId, {
    tripId,
    candidates,
    candidateIndex: index,
    currentDriverId: candidate.driverId,
    timeout,
  });

  _sendToDriver?.(candidate.driverId, { type: 'trip_request', trip: dto });
  // Push FCM en paralelo al WS: despierta la app si está en background.
  void sendPushToDriver(candidate.driverId, {
    title: 'Nueva solicitud de viaje',
    body: `${dto.distanceKm.toFixed(1)} km · tarifa estimada $${Math.round(dto.estimatedFare)}`,
    data: { type: 'trip_request', tripId },
  });
  console.log(
    `[Matching] Offered trip ${tripId} to driver ${candidate.driverId} ` +
      `(${Math.round(candidate.distanceMeters)}m away, candidate ${index + 1}/${candidates.length})`,
  );
}

/**
 * Called when the current offer driver declines or the 15-second window expires.
 * Advances to the next candidate.  If `driverId` is provided, the state is only
 * advanced when it matches the currently-pending driver (prevents stale timeouts
 * from advancing after an accept has already cleared the offer).
 */
export async function onDriverDeclineOrTimeout(
  tripId: string,
  driverId?: string,
): Promise<void> {
  const state = activeOffers.get(tripId);
  if (!state) return;
  if (driverId && state.currentDriverId !== driverId) return;
  clearTimeout(state.timeout);
  activeOffers.delete(tripId);
  await _offerToCandidate(tripId, state.candidates, state.candidateIndex + 1);
}

/**
 * Called when the offered driver sends `accept { tripId }`.
 *
 * Transactionally verifies the trip is still SEARCHING and flips it to ACCEPTED.
 * Returns `true` on success, `false` if the offer is stale (wrong driver, already
 * accepted by someone else, or cancelled).
 */
export async function onDriverAccept(tripId: string, driverId: string): Promise<boolean> {
  const state = activeOffers.get(tripId);
  if (!state || state.currentDriverId !== driverId) return false;

  clearTimeout(state.timeout);
  activeOffers.delete(tripId);

  // Despacho de pool abierto: el viaje queda SELLADO con la empresa del conductor
  // (operatorId) si está afiliado, para trazabilidad legal y liquidación. Los
  // conductores independientes dejan operatorId en null.
  const driverInfo = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { operatorId: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.trip.findUnique({
      where: { id: tripId },
      select: { status: true },
    });
    if (!current || current.status !== 'SEARCHING') return null;
    return tx.trip.update({
      where: { id: tripId },
      data: {
        status: 'ACCEPTED',
        driverId,
        acceptedAt: new Date(),
        ...(driverInfo?.operatorId ? { operatorId: driverInfo.operatorId } : {}),
      },
    });
  });

  if (!updated) return false;

  await prisma.driver.update({
    where: { id: driverId },
    data: { status: DriverStatus.ON_TRIP },
  });

  if (_notifyTripUpdate) await _notifyTripUpdate(tripId);

  if (updated.passengerId) {
    void sendPushToClient(updated.passengerId, {
      title: 'Conductor asignado',
      body: 'Tu conductor está en camino. Abre la app para seguirlo en el mapa.',
      data: { type: 'trip_accepted', tripId },
    });
  }

  console.log(`[Matching] Driver ${driverId} accepted trip ${tripId}`);
  return true;
}

// ─── Errand offer cycle (mandados) ─────────────────────────────────────────────
//
// Misma mecánica que los viajes: el mandado se ofrece a un conductor cercano a
// la vez, con timeout de 15s y fallback al siguiente candidato. Reutiliza la
// búsqueda geoespacial (findNearestAvailableDrivers) y el canal _sendToDriver ya
// registrado por ws.handler. La escritura en BD y la notificación al cliente las
// hace errand.service tras la aceptación; aquí solo gestionamos la oferta.

interface ErrandOfferState {
  errandId: string;
  candidates: NearbyDriver[];
  candidateIndex: number;
  currentDriverId: string;
  timeout: NodeJS.Timeout;
}

const activeErrandOffers = new Map<string, ErrandOfferState>();

/**
 * Punto de entrada — se llama desde la ruta /client/errands/request tras crear
 * el mandado. Fire-and-forget. [pickupLat]/[pickupLng] anclan la búsqueda de
 * conductores cercanos (el cliente envía su ubicación; si no, centro de Pamplona).
 */
export async function startErrandMatchingCycle(
  errandId: string,
  pickupLat: number,
  pickupLng: number,
): Promise<void> {
  const candidates = await findNearestAvailableDrivers(
    pickupLat,
    pickupLng,
    SEARCH_RADIUS_M,
    MAX_CANDIDATES,
    GEO_FRESHNESS_S,
    'errand',
  );
  if (candidates.length === 0) {
    console.log(`[Matching] No drivers available within ${SEARCH_RADIUS_M}m for errand ${errandId}`);
    return;
  }
  await _offerErrandToCandidate(errandId, candidates, 0);
}

async function _offerErrandToCandidate(
  errandId: string,
  candidates: NearbyDriver[],
  index: number,
): Promise<void> {
  if (index >= candidates.length) {
    console.log(`[Matching] All ${candidates.length} candidates exhausted for errand ${errandId}`);
    return;
  }

  const candidate = candidates[index]!;

  // El mandado debe seguir en búsqueda (pudo cancelarse o aceptarse entretanto).
  const info = await getErrandOfferInfo(errandId);
  if (!info || info.status !== 'searching') return;

  const timeout = setTimeout(() => {
    void onErrandDeclineOrTimeout(errandId);
  }, OFFER_TIMEOUT_MS);

  activeErrandOffers.set(errandId, {
    errandId,
    candidates,
    candidateIndex: index,
    currentDriverId: candidate.driverId,
    timeout,
  });

  _sendToDriver?.(candidate.driverId, { type: 'errand_request', errand: info.dto });
  // Push FCM en paralelo al WS: despierta la app si está en background.
  void sendPushToDriver(candidate.driverId, {
    title: 'Nuevo mandado disponible',
    body: info.dto.description,
    data: { type: 'errand_request', errandId },
  });
  console.log(
    `[Matching] Offered errand ${errandId} to driver ${candidate.driverId} ` +
      `(${Math.round(candidate.distanceMeters)}m away, candidate ${index + 1}/${candidates.length})`,
  );
}

/**
 * Avanza al siguiente candidato cuando el conductor actual rechaza o expira la
 * ventana de 15s. Si se pasa [driverId], solo avanza cuando coincide con el
 * conductor pendiente (evita que un timeout viejo avance tras una aceptación).
 */
export async function onErrandDeclineOrTimeout(
  errandId: string,
  driverId?: string,
): Promise<void> {
  const state = activeErrandOffers.get(errandId);
  if (!state) return;
  if (driverId && state.currentDriverId !== driverId) return;
  clearTimeout(state.timeout);
  activeErrandOffers.delete(errandId);
  await _offerErrandToCandidate(errandId, state.candidates, state.candidateIndex + 1);
}

/**
 * Cierra el ciclo de oferta cuando el conductor ofertado acepta el mandado.
 * Devuelve true solo si ese conductor era el que tenía la oferta activa (evita
 * que una aceptación tardía/duplicada gane tras un timeout). La escritura en BD
 * y la notificación al cliente las realiza errand.service.
 */
export function onErrandAccept(errandId: string, driverId: string): boolean {
  const state = activeErrandOffers.get(errandId);
  if (!state || state.currentDriverId !== driverId) return false;
  clearTimeout(state.timeout);
  activeErrandOffers.delete(errandId);
  return true;
}

// ─── Order offer cycle (pedidos a negocios) ─────────────────────────────────────
//
// Mismo patrón que viajes y mandados: oferta secuencial a repartidores cercanos
// con timeout de 15s y fallback al siguiente. Antes los pedidos se "entregaban"
// con una simulación server-side (MOCK_DRIVERS): ahora se despachan a
// repartidores reales en línea. La escritura en BD (acceptClientOrder) y la
// notificación al cliente las hace client.service tras la aceptación.

interface OrderOfferState {
  orderId: string;
  candidates: NearbyDriver[];
  candidateIndex: number;
  currentDriverId: string;
  timeout: NodeJS.Timeout;
}

const activeOrderOffers = new Map<string, OrderOfferState>();

/**
 * Punto de entrada — se llama desde POST /client/orders tras crear el pedido.
 * Fire-and-forget. El matching se ancla a las coordenadas del negocio (donde
 * el repartidor debe recoger); sin coords, al centro de Pamplona.
 */
export async function startOrderMatchingCycle(orderId: string): Promise<void> {
  const info = await getOrderOfferInfo(orderId);
  if (!info) return;
  const candidates = await findNearestAvailableDrivers(
    info.lat,
    info.lng,
    SEARCH_RADIUS_M,
    MAX_CANDIDATES,
    GEO_FRESHNESS_S,
    'order',
  );
  if (candidates.length === 0) {
    console.log(`[Matching] No drivers available within ${SEARCH_RADIUS_M}m for order ${orderId}`);
    return;
  }
  await _offerOrderToCandidate(orderId, candidates, 0);
}

async function _offerOrderToCandidate(
  orderId: string,
  candidates: NearbyDriver[],
  index: number,
): Promise<void> {
  if (index >= candidates.length) {
    console.log(`[Matching] All ${candidates.length} candidates exhausted for order ${orderId}`);
    return;
  }

  const candidate = candidates[index]!;

  // El pedido debe seguir disponible (pudo aceptarse o cancelarse entretanto).
  // Llega al matching en PREPARING (el restaurante ya lo aceptó y cocina).
  const info = await getOrderOfferInfo(orderId);
  if (!info || info.status !== 'PREPARING' || info.hasDriver) return;

  const timeout = setTimeout(() => {
    void onOrderDeclineOrTimeout(orderId);
  }, OFFER_TIMEOUT_MS);

  activeOrderOffers.set(orderId, {
    orderId,
    candidates,
    candidateIndex: index,
    currentDriverId: candidate.driverId,
    timeout,
  });

  _sendToDriver?.(candidate.driverId, { type: 'order_request', order: info.dto });
  void sendPushToDriver(candidate.driverId, {
    title: 'Nuevo pedido para entregar',
    body: `${info.dto.businessName} → ${info.dto.deliveryAddress}`,
    data: { type: 'order_request', orderId },
  });
  console.log(
    `[Matching] Offered order ${orderId} to driver ${candidate.driverId} ` +
      `(${Math.round(candidate.distanceMeters)}m away, candidate ${index + 1}/${candidates.length})`,
  );
}

/** Avanza al siguiente repartidor cuando el actual rechaza o expira la ventana. */
export async function onOrderDeclineOrTimeout(
  orderId: string,
  driverId?: string,
): Promise<void> {
  const state = activeOrderOffers.get(orderId);
  if (!state) return;
  if (driverId && state.currentDriverId !== driverId) return;
  clearTimeout(state.timeout);
  activeOrderOffers.delete(orderId);
  await _offerOrderToCandidate(orderId, state.candidates, state.candidateIndex + 1);
}

/**
 * Cierra el ciclo cuando el repartidor ofertado acepta el pedido. Devuelve true
 * solo si ese conductor tenía la oferta activa (evita aceptaciones tardías).
 */
export function onOrderAccept(orderId: string, driverId: string): boolean {
  const state = activeOrderOffers.get(orderId);
  if (!state || state.currentDriverId !== driverId) return false;
  clearTimeout(state.timeout);
  activeOrderOffers.delete(orderId);
  return true;
}
