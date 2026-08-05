// ── Fletes de carga (cliente ↔ empresa/dueño de camiones) ─────────────────────
//
// Modelo marketplace: el cliente publica el flete (peso, tipo de camión, precio
// ofrecido, fecha opcional) y las flotas de carga verificadas lo ven en su
// portal y lo toman asignando conductor + vehículo. Al completar, la plataforma
// liquida descontando su comisión (mismo COMMISSION_RATE de los viajes) y las
// ganancias alimentan el wallet del conductor vía recordCompletedTrip.

import { FreightStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { generateCustodyPins, assertCustodyPin } from '../lib/custody-pin';
import { COMMISSION_RATE, INTERCITY_CITY_COORDS } from '../config/constants';
import { coordsOfSync } from './municipality.service';
import { recordCompletedTrip } from './earnings.service';
import { sendPushToDriver, sendPushToClient } from './push.service';
import { docKillSwitchEnforced } from './document-expiry.service';
import { getServiceTrack, realKmByService, type ServiceTrack } from './track.service';
import {
  EVENT_LABEL_ES, FREIGHT_EVENT_TYPES, costBreakdown, isFreightEventType, requiresAmount,
  type CostBreakdown, type FreightEventType,
} from '../lib/freight-costs';
import { freightTimes, onTimeStats, type OnTimeStats } from '../lib/freight-times';
import { fuelEfficiency, type VehicleEfficiency } from '../lib/fuel-efficiency';
import { directions } from './geo.service';

export class FreightError extends Error {}

// Centroide de Pamplona: fallback cuando no se reconoce la ciudad (acarreo
// urbano o texto libre). Da un punto de mapa válido siempre.
const _PAMPLONA = INTERCITY_CITY_COORDS.pamplona;

/**
 * Resuelve coordenadas aproximadas de una ciudad de flete (texto libre) al
 * centroide conocido; si no se reconoce, devuelve el centro de Pamplona. Así
 * el mapa del flete siempre tiene una trayectoria que dibujar, sin depender de
 * un geocodificador externo.
 */
function _cityCoords(city: string | null | undefined): { lat: number; lng: number } {
  if (!city) return _PAMPLONA;
  const key = city.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/\s+/g, '-');
  // Tabla de municipios primero: con el mapa fijo de siete, un flete
  // Oca\u00f1a \u2192 \u00c1brego dibujaba Pamplona \u2192 Pamplona.
  return coordsOfSync(key)
    ?? (INTERCITY_CITY_COORDS as Record<string, { lat: number; lng: number }>)[key]
    ?? _PAMPLONA;
}

// Inyectado por ws.handler al arrancar — avisa en tiempo real a los portales
// de las flotas con camiones del tipo pedido cuando entra un flete nuevo.
let _notifyFleetsNewFreight:
  | ((operatorIds: string[], freight: FreightDTO) => void)
  | null = null;
export function registerNotifyFleetsNewFreight(
  fn: (operatorIds: string[], freight: FreightDTO) => void,
): void {
  _notifyFleetsNewFreight = fn;
}

const CARGO_TYPES: VehicleType[] = ['TURBO', 'CAMION', 'MULA'];

/**
 * Antigüedad máxima del fix GPS para dar un ETA. Más generosa que la frescura
 * del matching (120 s) porque un camión en carretera pierde señal a ratos, pero
 * acotada: con media hora sin reportar, el ETA ya no describe nada.
 */
const ETA_MAX_FIX_AGE_S = Number(process.env['ETA_MAX_FIX_AGE_S'] ?? 1800);

export interface CreateFreightDTO {
  originAddress: string;
  destAddress: string;
  originCity?: string;
  destCity?: string;
  cargoDescription: string;
  weightKg: number;
  vehicleType: string;
  offeredPrice: number;
  scheduledFor?: string; // ISO — futuro = acarreo/flete programado
  /** Fecha comprometida de entrega. Sin ella no hay cumplimiento medible. */
  promisedAt?: string;
}

function _toDTO(f: {
  id: string; clientId: string; clientName: string | null; clientPhone: string | null;
  originAddress: string; destAddress: string; originCity: string | null; destCity: string | null;
  cargoDescription: string; weightKg: number; vehicleType: VehicleType; offeredPrice: number;
  scheduledFor: Date | null; status: FreightStatus; operatorId: string | null;
  driverId: string | null; vehicleId: string | null; finalPrice: number | null;
  commission: number | null; netEarning: number | null; createdAt: Date;
  acceptedAt: Date | null; completedAt: Date | null;
  startedAt?: Date | null; promisedAt?: Date | null;
  originLat?: number | null; originLng?: number | null;
  destLat?: number | null; destLng?: number | null;
}, driverPos?: { lat: number | null; lng: number | null } | null) {
  return {
    id: f.id,
    clientName: f.clientName ?? undefined,
    clientPhone: f.clientPhone ?? undefined,
    originAddress: f.originAddress,
    destAddress: f.destAddress,
    originCity: f.originCity ?? undefined,
    destCity: f.destCity ?? undefined,
    originLat: f.originLat ?? undefined,
    originLng: f.originLng ?? undefined,
    destLat: f.destLat ?? undefined,
    destLng: f.destLng ?? undefined,
    cargoDescription: f.cargoDescription,
    weightKg: f.weightKg,
    vehicleType: f.vehicleType,
    offeredPrice: f.offeredPrice,
    scheduledFor: f.scheduledFor?.toISOString(),
    status: f.status,
    operatorId: f.operatorId ?? undefined,
    driverId: f.driverId ?? undefined,
    vehicleId: f.vehicleId ?? undefined,
    finalPrice: f.finalPrice ?? undefined,
    commission: f.commission ?? undefined,
    netEarning: f.netEarning ?? undefined,
    createdAt: f.createdAt.toISOString(),
    acceptedAt: f.acceptedAt?.toISOString(),
    startedAt: f.startedAt?.toISOString(),
    completedAt: f.completedAt?.toISOString(),
    promisedAt: f.promisedAt?.toISOString(),
    // Duraciones derivadas (nunca se guardan): un flete viejo sin startedAt
    // devuelve null en vez de un número inventado.
    times: freightTimes({
      createdAt: f.createdAt,
      acceptedAt: f.acceptedAt,
      startedAt: f.startedAt ?? null,
      completedAt: f.completedAt,
      promisedAt: f.promisedAt ?? null,
    }),
    // Posición en vivo del conductor asignado (heartbeat GPS) — solo se llena
    // en fletes ACCEPTED/IN_PROGRESS, para el mapa de seguimiento.
    driverLat: driverPos?.lat ?? undefined,
    driverLng: driverPos?.lng ?? undefined,
  };
}
export type FreightDTO = ReturnType<typeof _toDTO>;

/**
 * Mapea filas a DTO añadiendo la posición EN VIVO del conductor asignado en los
 * fletes activos (paridad con el seguimiento urbano). Una sola consulta por
 * lote para todos los conductores involucrados.
 */
async function _toDTOsWithDriverPos(
  rows: Parameters<typeof _toDTO>[0][] & { driverId: string | null; status: FreightStatus }[],
): Promise<FreightDTO[]> {
  const activeDriverIds = [
    ...new Set(
      rows
        .filter((r) => r.driverId && (r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS'))
        .map((r) => r.driverId as string),
    ),
  ];
  const positions = new Map<string, { lat: number | null; lng: number | null }>();
  if (activeDriverIds.length > 0) {
    const drivers = await prisma.driver.findMany({
      where: { id: { in: activeDriverIds } },
      select: { id: true, lastLat: true, lastLng: true },
    });
    for (const d of drivers) positions.set(d.id, { lat: d.lastLat, lng: d.lastLng });
  }
  return rows.map((r) =>
    _toDTO(
      r,
      r.driverId && (r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS')
        ? positions.get(r.driverId) ?? null
        : null,
    ),
  );
}

// ─── Cliente ──────────────────────────────────────────────────────────────────

export async function createFreightRequest(clientId: string, dto: CreateFreightDTO): Promise<FreightDTO> {
  if (!dto.originAddress?.trim() || !dto.destAddress?.trim()) {
    throw new FreightError('Indica la dirección de recogida y la de entrega.');
  }
  if (!dto.cargoDescription?.trim()) throw new FreightError('Describe qué carga vas a mover.');
  if (!(dto.weightKg > 0)) throw new FreightError('El peso (kg) debe ser mayor a cero.');
  const vType = dto.vehicleType?.toUpperCase() as VehicleType;
  if (!CARGO_TYPES.includes(vType)) {
    throw new FreightError('El tipo de vehículo debe ser TURBO, CAMION o MULA.');
  }
  if (!(dto.offeredPrice > 0)) throw new FreightError('Indica el precio que ofreces por el flete.');

  let scheduledFor: Date | null = null;
  if (dto.scheduledFor) {
    const d = new Date(dto.scheduledFor);
    if (Number.isNaN(d.getTime())) throw new FreightError('La fecha programada no es válida.');
    scheduledFor = d;
  }

  let promisedAt: Date | null = null;
  if (dto.promisedAt) {
    const d = new Date(dto.promisedAt);
    if (Number.isNaN(d.getTime())) throw new FreightError('La fecha de entrega comprometida no es válida.');
    promisedAt = d;
  }
  // Prometer la entrega antes de la salida programada no describe nada real y
  // dejaría el flete marcado como tarde desde el primer minuto.
  if (promisedAt && scheduledFor && promisedAt < scheduledFor) {
    throw new FreightError('La entrega comprometida no puede ser anterior a la salida programada.');
  }

  const user = await prisma.user.findUnique({ where: { id: clientId }, select: { name: true, phone: true } });

  // Trayectoria para el mapa: centroide de cada ciudad (fallback Pamplona).
  const oc = _cityCoords(dto.originCity);
  const dc = _cityCoords(dto.destCity);

  const f = await prisma.freightRequest.create({
    data: {
      clientId,
      clientName: user?.name ?? null,
      clientPhone: user?.phone ?? null,
      originAddress: dto.originAddress.trim(),
      destAddress: dto.destAddress.trim(),
      originCity: dto.originCity?.trim() || null,
      destCity: dto.destCity?.trim() || null,
      cargoDescription: dto.cargoDescription.trim(),
      weightKg: Math.round(dto.weightKg),
      vehicleType: vType,
      offeredPrice: dto.offeredPrice,
      scheduledFor,
      promisedAt,
      originLat: oc.lat,
      originLng: oc.lng,
      destLat: dc.lat,
      destLng: dc.lng,
      // Cadena de custodia: PIN de carga (remitente) y de entrega (destinatario).
      ...generateCustodyPins(),
    },
  });
  const dto2 = _toDTO(f);

  // Aviso en vivo a las flotas con camiones de este tipo (fire-and-forget:
  // un fallo de notificación jamás debe romper la publicación del flete).
  if (_notifyFleetsNewFreight) {
    void prisma.vehicle
      .findMany({
        where: { type: vType, isActive: true, operatorId: { not: null } },
        select: { operatorId: true },
        distinct: ['operatorId'],
      })
      .then((rows) => {
        const ids = rows.map((r) => r.operatorId).filter((v): v is string => !!v);
        if (ids.length > 0) _notifyFleetsNewFreight?.(ids, dto2);
      })
      .catch(() => undefined);
  }

  // Push FCM a los conductores con camión activo de este tipo: pueden tomar el
  // flete desde su app aunque esté cerrada (complementa el WS del portal).
  void prisma.vehicle
    .findMany({
      where: { type: vType, isActive: true, operatorId: { not: null } },
      select: { driverId: true },
      distinct: ['driverId'],
    })
    .then((rows) => {
      for (const r of rows) {
        void sendPushToDriver(r.driverId, {
          title: 'Nuevo flete disponible',
          body: `${f.originAddress} → ${f.destAddress} · ${f.weightKg} kg · $${Math.round(f.offeredPrice)}`,
          data: { type: 'freight_new', freightId: f.id },
        });
      }
    })
    .catch(() => undefined);

  return dto2;
}

/**
 * Flete visto por SU cliente: incluye los PIN de custodia. `_toDTO` nunca los
 * añade (seguro por defecto: conductor y flota jamás los reciben aunque se
 * agreguen consumidores nuevos); solo esta vista los expone.
 */
export type ClientFreightDTO = FreightDTO & {
  pickupPin?: string;
  deliveryPin?: string;
};

export async function listClientFreights(clientId: string): Promise<ClientFreightDTO[]> {
  const rows = await prisma.freightRequest.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const dtos = await _toDTOsWithDriverPos(rows);
  return dtos.map((dto, i) => ({
    ...dto,
    pickupPin: rows[i]?.pickupPin ?? undefined,
    deliveryPin: rows[i]?.deliveryPin ?? undefined,
  }));
}

export async function cancelClientFreight(clientId: string, id: string): Promise<FreightDTO> {
  const f = await prisma.freightRequest.findUnique({ where: { id } });
  if (!f || f.clientId !== clientId) throw new FreightError('El flete no existe.');
  // Guard atómico de estado: si el transportador arrancó (IN_PROGRESS) entre
  // la lectura y el update, la cancelación ya no aplica.
  const res = await prisma.freightRequest.updateMany({
    where: { id, clientId, status: { in: ['REQUESTED', 'ACCEPTED'] } },
    data: { status: 'CANCELLED' },
  });
  if (res.count === 0) {
    throw new FreightError('El flete ya está en ruta y no se puede cancelar.');
  }
  const upd = await prisma.freightRequest.findUniqueOrThrow({ where: { id } });

  // Si ya estaba asignado, el conductor debe enterarse aunque tenga la app cerrada.
  if (f.status === 'ACCEPTED' && f.driverId) {
    void sendPushToDriver(f.driverId, {
      title: 'Flete cancelado',
      body: 'El cliente canceló el flete que tenías asignado.',
      data: { type: 'freight_cancelled', freightId: id },
    });
  }
  return _toDTO(upd);
}

// ─── Empresa / dueño de flota ─────────────────────────────────────────────────

/** Fletes abiertos que la flota puede tomar (tiene vehículo del tipo pedido). */
export async function listAvailableFreights(operatorId: string): Promise<FreightDTO[]> {
  const fleet = await prisma.vehicle.findMany({
    where: { operatorId, isActive: true, type: { in: CARGO_TYPES } },
    select: { type: true },
  });
  const types = [...new Set(fleet.map((v) => v.type))];
  if (types.length === 0) return [];
  const rows = await prisma.freightRequest.findMany({
    where: { status: 'REQUESTED', vehicleType: { in: types } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => _toDTO(r));
}

export async function listOperatorFreights(operatorId: string): Promise<FreightDTO[]> {
  const rows = await prisma.freightRequest.findMany({
    where: { operatorId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => _toDTO(r));
}

/**
 * Crea (si no existe) el viaje de carga de una solicitud del marketplace y lo
 * enlaza. Idempotente: `cargoTripId` es único y se comprueba antes, así que dos
 * aceptaciones concurrentes no dejan dos viajes.
 *
 * La mercancía descrita en la solicitud entra como la primera línea del viaje:
 * un flete del marketplace es un viaje con un solo destinatario, y así comparte
 * exactamente el mismo documento que un despacho propio de la flota.
 */
/**
 * Refleja el estado del flete en su viaje de carga. Best-effort y silencioso:
 * un flete anterior a la unificación no tiene viaje y no pasa nada.
 */
async function _syncCargoTrip(
  freightId: string,
  status: 'DISPATCHED' | 'COMPLETED' | 'CANCELLED',
): Promise<void> {
  try {
    const f = await prisma.freightRequest.findUnique({
      where: { id: freightId }, select: { cargoTripId: true },
    });
    if (!f?.cargoTripId) return;
    const ahora = new Date();
    await prisma.cargoTrip.update({
      where: { id: f.cargoTripId },
      data: {
        status,
        ...(status === 'DISPATCHED' ? { dispatchedAt: ahora, startedAt: ahora } : {}),
        ...(status === 'COMPLETED' ? { completedAt: ahora } : {}),
      },
    });
  } catch (e) {
    console.warn('[Carga] no se pudo sincronizar el viaje:', (e as Error).message);
  }
}

async function _ensureCargoTripForFreight(
  freightId: string,
  operatorId: string,
  driverId: string,
  vehicleId: string,
): Promise<string | null> {
  try {
    const f = await prisma.freightRequest.findUnique({
      where: { id: freightId },
      select: {
        cargoTripId: true, originCity: true, destCity: true, originAddress: true,
        destAddress: true, weightKg: true, offeredPrice: true, promisedAt: true,
        cargoDescription: true, clientName: true, scheduledFor: true,
      },
    });
    if (!f || f.cargoTripId) return f?.cargoTripId ?? null;

    const ultimo = await prisma.cargoTrip.findFirst({
      where: { operatorId }, orderBy: { number: 'desc' }, select: { number: true },
    });

    const trip = await prisma.cargoTrip.create({
      data: {
        operatorId,
        number: (ultimo?.number ?? 0) + 1,
        originCity: f.originCity ?? f.originAddress,
        originPlace: f.originCity ? f.originAddress : null,
        destCity: f.destCity ?? f.destAddress,
        weightKg: f.weightKg,
        freightAmount: f.offeredPrice,
        promisedAt: f.promisedAt,
        scheduledAt: f.scheduledFor,
        driverId,
        vehicleId,
        status: 'DRAFT',
        manifests: {
          create: {
            operatorId,
            code: `REM-F${Date.now().toString().slice(-8)}`,
            reference: f.cargoDescription.slice(0, 80),
            warehouse: f.originAddress,
            clientName: f.clientName ?? 'Cliente',
            clientCity: f.destCity ?? f.destAddress,
            unitLabel: 'bulto',
            measureLabel: 'kg',
            // El marketplace declara el peso, no una lista de bultos: se
            // registra como un solo renglón con el peso como medida.
            items: { create: [{ position: 1, measure: f.weightKg }] },
          },
        },
      },
      select: { id: true },
    });

    await prisma.freightRequest.update({
      where: { id: freightId },
      data: { cargoTripId: trip.id },
    });
    return trip.id;
  } catch (e) {
    // Best-effort: si falla, el flete sigue aceptado y operable como siempre.
    console.warn('[Carga] no se pudo crear el viaje del flete:', (e as Error).message);
    return null;
  }
}

export async function acceptFreight(
  operatorId: string,
  freightId: string,
  driverId: string,
  vehicleId: string,
  // false cuando el propio conductor toma el flete (no hay que avisarle a él).
  notifyDriver = true,
): Promise<FreightDTO> {
  const [driver, vehicle] = await Promise.all([
    prisma.driver.findFirst({
      where: { id: driverId, operatorId },
      select: { id: true, complianceStatus: true, blockedReason: true },
    }),
    prisma.vehicle.findFirst({ where: { id: vehicleId, operatorId, isActive: true } }),
  ]);
  if (!driver) throw new FreightError('El conductor indicado no está afiliado a tu flota.');
  if (!vehicle) throw new FreightError('El vehículo indicado no pertenece a tu flota.');
  // Kill-switch documental: un conductor BLOCKED no puede tomar/recibir fletes.
  if (docKillSwitchEnforced() && driver.complianceStatus === 'BLOCKED') {
    throw new FreightError(
      `El conductor tiene documentos vencidos (${driver.blockedReason ?? 'sin detalle'}). Renuévalos para poder asignarle fletes.`,
    );
  }

  const f = await prisma.freightRequest.findUnique({ where: { id: freightId } });
  if (!f) throw new FreightError('El flete no existe.');
  if (f.status !== 'REQUESTED') throw new FreightError('Otro transportador ya tomó este flete.');
  if (vehicle.type !== f.vehicleType) {
    throw new FreightError(`El cliente pidió ${f.vehicleType} y el vehículo asignado es ${vehicle.type}.`);
  }
  if (vehicle.capacityKg != null && vehicle.capacityKg < f.weightKg) {
    throw new FreightError(
      `La carga pesa ${f.weightKg} kg y el vehículo asignado soporta ${vehicle.capacityKg} kg.`,
    );
  }

  // updateMany con guard de status = tomar el flete es atómico (dos flotas no
  // pueden aceptarlo a la vez).
  const taken = await prisma.freightRequest.updateMany({
    where: { id: freightId, status: 'REQUESTED' },
    data: { status: 'ACCEPTED', operatorId, driverId, vehicleId, acceptedAt: new Date() },
  });
  if (taken.count === 0) throw new FreightError('Otro transportador ya tomó este flete.');

  // Unificación: aceptar la solicitud CREA el viaje de carga, que es la unidad
  // operativa única. Ahí cuelgan el rastro, los gastos, los tiempos, el remito
  // de la mercancía y el cobro — antes la mitad de eso vivía en el flete y la
  // otra mitad en un viaje aparte que no se conocían.
  await _ensureCargoTripForFreight(freightId, operatorId, driverId, vehicleId);

  const upd = await prisma.freightRequest.findUniqueOrThrow({ where: { id: freightId } });

  // Push FCM: al conductor asignado (cuando lo asigna la flota) y al cliente.
  if (notifyDriver) {
    void sendPushToDriver(driverId, {
      title: 'Te asignaron un flete',
      body: `${upd.originAddress} → ${upd.destAddress} · ${upd.weightKg} kg`,
      data: { type: 'freight_assigned', freightId },
    });
  }
  void sendPushToClient(upd.clientId, {
    title: 'Tu flete fue tomado',
    body: 'Un transportador aceptó tu carga. Míralo en "Mis fletes".',
    data: { type: 'freight_accepted', freightId },
  });
  return _toDTO(upd);
}

export async function updateFreightStatus(
  operatorId: string,
  freightId: string,
  status: 'in_progress' | 'completed' | 'cancelled',
): Promise<FreightDTO> {
  const f = await prisma.freightRequest.findUnique({ where: { id: freightId } });
  if (!f || f.operatorId !== operatorId) throw new FreightError('El flete no existe o no es de tu flota.');
  return _applyFreightStatus(f, status);
}

/**
 * El conductor ASIGNADO inicia o completa su flete desde la app (mismas
 * transiciones, liquidación y avisos que el portal de la flota). Soltar el
 * flete (cancelled) queda solo en el portal.
 */
export async function updateDriverFreightStatus(
  driverId: string,
  freightId: string,
  status: 'in_progress' | 'completed',
  pin?: string,
): Promise<FreightDTO> {
  const f = await prisma.freightRequest.findUnique({ where: { id: freightId } });
  if (!f || f.driverId !== driverId) throw new FreightError('El flete no existe o no está asignado a ti.');
  // Cadena de custodia: cargar exige el PIN del remitente y entregar el del
  // destinatario. Solo se exige por esta vía —el conductor SÍ está en el sitio—;
  // el portal de la flota conserva su vía administrativa (a distancia nadie
  // puede conocer el PIN) y esas transiciones quedan registradas igual.
  if (status === 'in_progress') {
    assertCustodyPin(f.pickupPin, pin, 'recogida');
  } else {
    assertCustodyPin(f.deliveryPin, pin, 'entrega');
  }
  return _applyFreightStatus(f, status, true);
}

async function _applyFreightStatus(
  f: NonNullable<Awaited<ReturnType<typeof prisma.freightRequest.findUnique>>>,
  status: 'in_progress' | 'completed' | 'cancelled',
  /** true cuando el PIN de custodia ya se validó (vía del conductor). */
  pinVerified = false,
): Promise<FreightDTO> {
  const freightId = f.id;
  const pinStamp = pinVerified
    ? status === 'in_progress'
      ? { pickupPinAt: new Date() }
      : { deliveryPinAt: new Date() }
    : {};

  // Todas las transiciones usan updateMany con guard de status: dos llamadas
  // concurrentes (portal + app del conductor) no pueden aplicar la misma
  // transición dos veces — clave en 'completed', que liquida ganancias.
  if (status === 'in_progress') {
    const res = await prisma.freightRequest.updateMany({
      where: { id: freightId, status: 'ACCEPTED' },
      // startedAt es la salida REAL: sin ella, la espera en bodega queda
      // escondida dentro del tiempo de viaje y nadie puede reclamarla.
      data: { status: 'IN_PROGRESS', startedAt: new Date(), ...pinStamp },
    });
    if (res.count === 0) throw new FreightError('Solo un flete aceptado puede iniciar ruta.');
    // El viaje es la unidad operativa: al salir el flete, sale su viaje (y con
    // él arrancan el rastro GPS y las alertas de ruta).
    await _syncCargoTrip(freightId, 'DISPATCHED');
    const upd = await prisma.freightRequest.findUniqueOrThrow({ where: { id: freightId } });
    void sendPushToClient(f.clientId, {
      title: 'Tu carga va en camino',
      body: `${f.originAddress} → ${f.destAddress}`,
      data: { type: 'freight_in_progress', freightId },
    });
    return _toDTO(upd);
  }

  if (status === 'cancelled') {
    // Solo un flete asignado o en ruta puede soltarse; un flete COMPLETED o
    // CANCELLED por el cliente NO debe volver al tablero.
    const res = await prisma.freightRequest.updateMany({
      where: { id: freightId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
      // Vuelve al tablero para que otra flota pueda tomarlo.
      // startedAt se limpia con el resto: el flete vuelve al tablero sin
      // historia de ejecución, y el próximo transportador arranca su reloj.
      data: {
        status: 'REQUESTED', operatorId: null, driverId: null, vehicleId: null,
        acceptedAt: null, startedAt: null,
      },
    });
    if (res.count === 0) throw new FreightError('El flete ya fue completado o cancelado.');
    await _syncCargoTrip(freightId, 'CANCELLED');
    const upd = await prisma.freightRequest.findUniqueOrThrow({ where: { id: freightId } });
    void sendPushToClient(f.clientId, {
      title: 'Tu flete volvió a publicarse',
      body: 'El transportador no pudo continuar. Otras flotas ya pueden tomarlo.',
      data: { type: 'freight_reopened', freightId },
    });
    return _toDTO(upd);
  }

  // completed → liquidación con comisión de plataforma
  const finalPrice = f.offeredPrice;
  const commission = Math.round(finalPrice * COMMISSION_RATE);
  const netEarning = finalPrice - commission;
  const res = await prisma.freightRequest.updateMany({
    where: { id: freightId, status: { in: ['IN_PROGRESS', 'ACCEPTED'] } },
    data: { status: 'COMPLETED', finalPrice, commission, netEarning, completedAt: new Date(), ...pinStamp },
  });
  if (res.count === 0) throw new FreightError('El flete no está en ruta.');
  await _syncCargoTrip(freightId, 'COMPLETED');
  const upd = await prisma.freightRequest.findUniqueOrThrow({ where: { id: freightId } });
  if (f.driverId) {
    recordCompletedTrip(
      {
        tripId: `freight-${f.id}`,
        origin: f.originAddress,
        destination: f.destAddress,
        grossFare: finalPrice,
        netEarning,
        completedAt: new Date().toISOString(),
      },
      f.driverId,
    );
  }
  void sendPushToClient(f.clientId, {
    title: 'Flete entregado',
    body: `Tu carga llegó a destino. Total: $${Math.round(finalPrice)}.`,
    data: { type: 'freight_completed', freightId },
  });
  return _toDTO(upd);
}

// ─── Fase C: panel financiero de la flota ─────────────────────────────────────

export interface FleetFinanceSummary {
  from: string;
  to: string;
  totalGross: number;
  totalCommission: number;
  /** Lo que le queda a la flota tras la comisión, ANTES de sus gastos. */
  totalNet: number;
  totalServices: number;
  /**
   * Gastos de ruta registrados por los conductores en los fletes del período
   * (combustible, peajes, viáticos, mantenimiento). Solo la carga los lleva:
   * es la única operación con bitácora de gastos.
   */
  costs: CostBreakdown;
  /** totalNet − costs.total. Este es el número que el dueño llama "ganancia". */
  totalMargin: number;
  /** Kilómetros reales recorridos en los fletes del período (rastro GPS). */
  realKm: number;
  /** Costo por kilómetro recorrido, 0 si aún no hay rastro. */
  costPerKm: number;
  /** Cumplimiento de las entregas con fecha comprometida. */
  onTime: OnTimeStats;
  /** Rendimiento km/galón por camión, calculado con los tanqueos del período. */
  efficiency: VehicleEfficiency[];
  byService: Record<string, { count: number; gross: number }>;
  byDriver: { name: string; count: number; gross: number; cost: number }[];
  byVehicle: { plate: string; count: number; gross: number; cost: number }[];
}

/** Consolidado financiero de TODOS los servicios sellados a la flota. */
export async function getFleetFinance(operatorId: string, fromISO?: string, toISO?: string): Promise<FleetFinanceSummary> {
  const now = new Date();
  const from = fromISO ? new Date(fromISO) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = toISO ? new Date(toISO) : now;

  const range = { gte: from, lte: to };
  const [trips, intercity, errands, orders, freights] = await Promise.all([
    prisma.trip.findMany({
      where: { operatorId, status: 'COMPLETED', completedAt: range },
      select: { finalFare: true, estimatedFare: true, driver: { select: { name: true } } },
    }),
    prisma.intercityBooking.findMany({
      where: { operatorId, status: 'COMPLETED', completedAt: range },
      select: { finalFare: true, offeredFare: true, driverName: true },
    }),
    prisma.errand.findMany({
      where: { operatorId, status: 'DELIVERED', deliveredAt: range },
      select: { serviceFee: true, driverName: true },
    }),
    prisma.order.findMany({
      where: { operatorId, status: 'DELIVERED', deliveredAt: range },
      select: { deliveryFee: true, driverName: true },
    }),
    prisma.freightRequest.findMany({
      // Un flete con viaje se contabiliza COMO VIAJE: contarlo también aquí
      // duplicaría la misma plata en el panel.
      where: { operatorId, status: 'COMPLETED', completedAt: range, cargoTripId: null },
      select: {
        id: true, finalPrice: true, commission: true, netEarning: true,
        driverId: true, vehicleId: true,
        createdAt: true, acceptedAt: true, startedAt: true,
        completedAt: true, promisedAt: true,
      },
    }),
  ]);

  // Viajes de carga completados del período: desde la unificación son la
  // unidad operativa, y traen su propio valor, sus gastos y su rastro.
  const cargoTrips = await prisma.cargoTrip.findMany({
    where: { operatorId, status: 'COMPLETED', completedAt: range },
    select: {
      id: true, freightAmount: true, driverId: true, vehicleId: true,
      createdAt: true, dispatchedAt: true, startedAt: true,
      completedAt: true, promisedAt: true,
    },
  });

  // Gastos de ruta y kilómetros reales de esos mismos fletes. Sin esto el panel
  // solo dice cuánto facturó la flota, que no es lo que el dueño pregunta.
  const freightIds = freights.map((f) => f.id);
  const cargoIds = cargoTrips.map((t) => t.id);
  const [expenseRows, kmByFreight, kmByCargo] = await Promise.all([
    freightIds.length || cargoIds.length
      ? prisma.freightEvent.findMany({
          where: { OR: [{ freightId: { in: freightIds } }, { cargoTripId: { in: cargoIds } }] },
          select: {
            freightId: true, cargoTripId: true, type: true, amountCop: true,
            gallons: true, odometerKm: true, createdAt: true,
          },
        })
      : Promise.resolve([] as {
          freightId: string | null; cargoTripId: string | null; type: string;
          amountCop: number | null; gallons: number | null; odometerKm: number | null;
          createdAt: Date;
        }[]),
    realKmByService('freight', freightIds),
    realKmByService('cargo', cargoIds),
  ]);

  const costs = costBreakdown(expenseRows);
  const costByFreight = new Map<string, number>();
  for (const e of expenseRows) {
    const monto = e.amountCop ?? 0;
    if (!(monto > 0) || !requiresAmount(e.type)) continue;
    const clave = e.cargoTripId ?? e.freightId;
    if (!clave) continue;
    costByFreight.set(clave, (costByFreight.get(clave) ?? 0) + monto);
  }
  const realKm =
    [...kmByFreight.values()].reduce((s, v) => s + v, 0) +
    [...kmByCargo.values()].reduce((s, v) => s + v, 0);

  // Nombres de conductor/placa para los fletes (guardan ids, no nombres).
  const drvIds = [...new Set(freights.map((x) => x.driverId).filter((v): v is string => !!v))];
  const vehIds = [...new Set(freights.map((x) => x.vehicleId).filter((v): v is string => !!v))];
  const [drvRows, vehRows] = await Promise.all([
    drvIds.length ? prisma.driver.findMany({ where: { id: { in: drvIds } }, select: { id: true, name: true } }) : [],
    vehIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehIds } }, select: { id: true, plate: true } }) : [],
  ]);
  const drvName = new Map(drvRows.map((d) => [d.id, d.name]));
  const vehPlate = new Map(vehRows.map((v) => [v.id, v.plate]));

  // Rendimiento km/galón: el tanqueo cuelga del flete y la placa cuelga del
  // flete, así que hay que dar ese salto para atribuir los galones a un camión.
  const plateByFreight = new Map<string, string>();
  for (const f of freights) {
    const plate = f.vehicleId ? vehPlate.get(f.vehicleId) : undefined;
    if (plate) plateByFreight.set(f.id, plate);
  }
  const cargoDrvIds = [...new Set(cargoTrips.map((t) => t.driverId).filter((v): v is string => !!v))];
  const cargoVehIds = [...new Set(cargoTrips.map((t) => t.vehicleId).filter((v): v is string => !!v))];
  const [cDrv, cVeh] = await Promise.all([
    cargoDrvIds.length ? prisma.driver.findMany({ where: { id: { in: cargoDrvIds } }, select: { id: true, name: true } }) : [],
    cargoVehIds.length ? prisma.vehicle.findMany({ where: { id: { in: cargoVehIds } }, select: { id: true, plate: true } }) : [],
  ]);
  const cDrvName = new Map(cDrv.map((d) => [d.id, d.name]));
  const cVehPlate = new Map(cVeh.map((v) => [v.id, v.plate]));

  // La placa del tanqueo sale de su flete o de su viaje: sin este salto, los
  // galones de los viajes de carga no se atribuirían a ningún camión y el
  // rendimiento saldría vacío justo para la operación que más lo necesita.
  const plateByCargo = new Map<string, string>();
  for (const t of cargoTrips) {
    const plate = t.vehicleId ? cVehPlate.get(t.vehicleId) : undefined;
    if (plate) plateByCargo.set(t.id, plate);
  }

  const efficiency = fuelEfficiency(
    expenseRows
      .filter((e) => e.type === 'FUEL')
      .map((e) => ({
        vehicle:
          (e.cargoTripId ? plateByCargo.get(e.cargoTripId) : undefined) ??
          (e.freightId ? plateByFreight.get(e.freightId) : undefined) ??
          '',
        odometerKm: e.odometerKm,
        gallons: e.gallons,
        amountCop: e.amountCop,
        at: e.createdAt,
      })),
  );

  const byService: Record<string, { count: number; gross: number }> = {};
  const byDriverMap = new Map<string, { count: number; gross: number; cost: number }>();
  const byVehicleMap = new Map<string, { count: number; gross: number; cost: number }>();
  let totalGross = 0;
  let totalCommission = 0;

  const add = (
    service: string, gross: number, commission: number,
    driverName?: string | null, plate?: string | null, cost = 0,
  ) => {
    totalGross += gross;
    totalCommission += commission;
    byService[service] = {
      count: (byService[service]?.count ?? 0) + 1,
      gross: (byService[service]?.gross ?? 0) + gross,
    };
    if (driverName) {
      const cur = byDriverMap.get(driverName) ?? { count: 0, gross: 0, cost: 0 };
      byDriverMap.set(driverName, { count: cur.count + 1, gross: cur.gross + gross, cost: cur.cost + cost });
    }
    if (plate) {
      const cur = byVehicleMap.get(plate) ?? { count: 0, gross: 0, cost: 0 };
      byVehicleMap.set(plate, { count: cur.count + 1, gross: cur.gross + gross, cost: cur.cost + cost });
    }
  };

  for (const t of trips) {
    const fare = t.finalFare ?? t.estimatedFare ?? 0;
    add('VIAJE', fare, Math.round(fare * COMMISSION_RATE), t.driver?.name);
  }
  for (const b of intercity) {
    const fare = b.finalFare ?? b.offeredFare ?? 0;
    add('INTERMUNICIPAL', fare, Math.round(fare * COMMISSION_RATE), b.driverName);
  }
  for (const e of errands) add('MANDADO', e.serviceFee ?? 0, Math.round((e.serviceFee ?? 0) * COMMISSION_RATE), e.driverName);
  for (const o of orders) add('PEDIDO', o.deliveryFee ?? 0, Math.round((o.deliveryFee ?? 0) * COMMISSION_RATE), o.driverName);
  for (const f of freights) {
    add(
      'FLETE',
      f.finalPrice ?? 0,
      f.commission ?? Math.round((f.finalPrice ?? 0) * COMMISSION_RATE),
      f.driverId ? drvName.get(f.driverId) : undefined,
      f.vehicleId ? vehPlate.get(f.vehicleId) : undefined,
      costByFreight.get(f.id) ?? 0,
    );
  }

  // Los viajes de carga entran como servicio CARGA: mismo tratamiento que
  // cualquier otro, con su valor, su conductor y su vehículo.
  for (const t of cargoTrips) {
    const bruto = t.freightAmount ?? 0;
    add(
      'CARGA',
      bruto,
      Math.round(bruto * COMMISSION_RATE),
      t.driverId ? cDrvName.get(t.driverId) : undefined,
      t.vehicleId ? cVehPlate.get(t.vehicleId) : undefined,
      costByFreight.get(t.id) ?? 0,
    );
  }

  const byDriver = [...byDriverMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.gross - a.gross);
  const byVehicle = [...byVehicleMap.entries()]
    .map(([plate, v]) => ({ plate, ...v }))
    .sort((a, b) => b.gross - a.gross);

  const totalNet = totalGross - totalCommission;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalGross,
    totalCommission,
    totalNet,
    totalServices: Object.values(byService).reduce((s, x) => s + x.count, 0),
    costs,
    totalMargin: totalNet - costs.total,
    realKm: Math.round(realKm * 100) / 100,
    costPerKm: realKm > 0 ? Math.round(costs.total / realKm) : 0,
    onTime: onTimeStats([
      ...freights,
      ...cargoTrips.map((t) => ({
        createdAt: t.createdAt, acceptedAt: t.dispatchedAt, startedAt: t.startedAt,
        completedAt: t.completedAt, promisedAt: t.promisedAt,
      })),
    ]),
    efficiency,
    byService,
    byDriver,
    byVehicle,
  };
}

// ─── Analítica y rendimiento de la flota (ranking) ────────────────────────────

export interface FleetAnalytics {
  from: string;
  to: string;
  totalGross: number;
  totalNet: number;
  totalCommission: number;
  totalServices: number;
  avgTicket: number;
  byService: { service: string; count: number; gross: number; avg: number }[];
  topDrivers: { name: string; count: number; gross: number; net: number; avgTicket: number; rating: number | null }[];
  topVehicles: { plate: string; count: number; gross: number; avgTicket: number; type: string | null }[];
}

/**
 * Rendimiento de la flota: reutiliza la agregación financiera y la enriquece con
 * el rating del conductor, el tipo de vehículo, el neto y el ticket promedio, en
 * forma de ranking descendente por facturación.
 */
export async function getFleetAnalytics(operatorId: string, fromISO?: string, toISO?: string): Promise<FleetAnalytics> {
  const fin = await getFleetFinance(operatorId, fromISO, toISO);

  const [drivers, vehicles] = await Promise.all([
    prisma.driver.findMany({ where: { operatorId }, select: { name: true, rating: true } }),
    prisma.vehicle.findMany({ where: { operatorId }, select: { plate: true, type: true } }),
  ]);
  const ratingByName = new Map(drivers.map((d) => [d.name, d.rating]));
  const typeByPlate = new Map(vehicles.map((v) => [v.plate, v.type as string]));

  const net = (gross: number) => gross - Math.round(gross * COMMISSION_RATE);

  const byService = Object.entries(fin.byService)
    .map(([service, v]) => ({ service, count: v.count, gross: v.gross, avg: v.count ? Math.round(v.gross / v.count) : 0 }))
    .sort((a, b) => b.gross - a.gross);

  const topDrivers = fin.byDriver.map((d) => ({
    name: d.name,
    count: d.count,
    gross: d.gross,
    net: net(d.gross),
    avgTicket: d.count ? Math.round(d.gross / d.count) : 0,
    rating: ratingByName.get(d.name) ?? null,
  }));

  const topVehicles = fin.byVehicle.map((v) => ({
    plate: v.plate,
    count: v.count,
    gross: v.gross,
    avgTicket: v.count ? Math.round(v.gross / v.count) : 0,
    type: typeByPlate.get(v.plate) ?? null,
  }));

  return {
    from: fin.from,
    to: fin.to,
    totalGross: fin.totalGross,
    totalNet: fin.totalNet,
    totalCommission: fin.totalCommission,
    totalServices: fin.totalServices,
    avgTicket: fin.totalServices ? Math.round(fin.totalGross / fin.totalServices) : 0,
    byService,
    topDrivers,
    topVehicles,
  };
}

// ─── Conductor: sus fletes asignados ──────────────────────────────────────────

/** Fletes asignados al conductor (la flota le asigna; él los ve en su app). */
export async function listDriverFreights(driverId: string): Promise<FreightDTO[]> {
  const rows = await prisma.freightRequest.findMany({
    where: { driverId, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return _toDTOsWithDriverPos(rows);
}

// ─── Conductor: tomar fletes disponibles desde su app (owner-operator) ────────

export interface DriverVehicleOption {
  id: string;
  plate: string;
  type: VehicleType;
  capacityKg: number | null;
}

/** Fletes abiertos que el conductor puede tomar con su flota + sus camiones. */
export async function listDriverAvailableFreights(
  driverId: string,
): Promise<{ freights: FreightDTO[]; vehicles: DriverVehicleOption[] }> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { operatorId: true },
  });
  if (!driver?.operatorId) return { freights: [], vehicles: [] };

  // Camiones de carga de SU flota que él conduce (para asignar al tomar).
  const vehicles = await prisma.vehicle.findMany({
    where: { driverId, operatorId: driver.operatorId, isActive: true, type: { in: CARGO_TYPES } },
    select: { id: true, plate: true, type: true, capacityKg: true },
  });
  if (vehicles.length === 0) return { freights: [], vehicles: [] };

  const types = [...new Set(vehicles.map((v) => v.type))];
  const rows = await prisma.freightRequest.findMany({
    where: { status: 'REQUESTED', vehicleType: { in: types } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return { freights: rows.map((r) => _toDTO(r)), vehicles };
}

/** El conductor toma un flete asignándose a sí mismo + su camión. */
export async function takeDriverFreight(
  driverId: string,
  freightId: string,
  vehicleId: string,
): Promise<FreightDTO> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { operatorId: true },
  });
  if (!driver?.operatorId) {
    throw new FreightError('No perteneces a ninguna flota de carga.');
  }
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, driverId },
    select: { id: true },
  });
  if (!vehicle) throw new FreightError('Ese vehículo no está a tu nombre.');
  return acceptFreight(driver.operatorId, freightId, driverId, vehicleId, false);
}

// ─── Trazabilidad en ruta: tanqueos, paradas y notas del conductor ───────────
// El conductor registra cada evento (dónde echó gasolina, dónde paró) y la
// empresa lo ve como línea de tiempo del flete — control total del trayecto.

export type { FreightEventType };

export interface FreightEventDTO {
  id: string;
  freightId: string;
  cargoTripId?: string;
  type: FreightEventType;
  lat?: number;
  lng?: number;
  address?: string;
  amountCop?: number;
  gallons?: number;
  odometerKm?: number;
  note?: string;
  photoUrl?: string;
  createdAt: string;
}

type DbFreightEvent = {
  id: string; freightId: string | null; cargoTripId?: string | null; type: string; lat: number | null; lng: number | null;
  address: string | null; amountCop: number | null; gallons: number | null;
  odometerKm: number | null; note: string | null; photoUrl: string | null; createdAt: Date;
};

export function _eventToDTO(e: DbFreightEvent): FreightEventDTO {
  return {
    id: e.id,
    freightId: e.freightId ?? '',
    cargoTripId: e.cargoTripId ?? undefined,
    type: e.type as FreightEventType,
    lat: e.lat ?? undefined,
    lng: e.lng ?? undefined,
    address: e.address ?? undefined,
    amountCop: e.amountCop ?? undefined,
    gallons: e.gallons ?? undefined,
    odometerKm: e.odometerKm ?? undefined,
    note: e.note ?? undefined,
    photoUrl: e.photoUrl ?? undefined,
    createdAt: e.createdAt.toISOString(),
  };
}

export interface AddFreightEventInput {
  type: string;
  lat?: number;
  lng?: number;
  address?: string;
  amountCop?: number;
  gallons?: number;
  odometerKm?: number;
  note?: string;
  photoUrl?: string;
}

/** El conductor asignado registra un evento del flete EN RUTA. */
export async function addFreightEvent(
  driverId: string,
  freightId: string,
  input: AddFreightEventInput,
): Promise<FreightEventDTO> {
  const type = String(input.type ?? '').toUpperCase();
  if (!isFreightEventType(type)) {
    throw new FreightError(
      `El tipo de evento debe ser uno de: ${FREIGHT_EVENT_TYPES.join(', ')}.`,
    );
  }
  const f = await prisma.freightRequest.findUnique({
    where: { id: freightId },
    select: { driverId: true, status: true },
  });
  if (!f || f.driverId !== driverId) {
    throw new FreightError('Este flete no está asignado a ti.');
  }
  if (f.status !== 'ACCEPTED' && f.status !== 'IN_PROGRESS') {
    throw new FreightError('Solo puedes registrar eventos con el flete aceptado o en ruta.');
  }
  // Un gasto sin monto haría cuadrar mal el margen sin que nadie lo note.
  if (requiresAmount(type) && !(typeof input.amountCop === 'number' && input.amountCop > 0)) {
    throw new FreightError(
      `Un ${EVENT_LABEL_ES[type].toLowerCase()} necesita el monto en pesos (amountCop).`,
    );
  }
  // La bitácora cuelga del viaje cuando el flete ya tiene uno (unificación);
  // los fletes anteriores siguen guardando contra el flete y se leen igual.
  const conViaje = await prisma.freightRequest.findUnique({
    where: { id: freightId }, select: { cargoTripId: true },
  });

  const created = await prisma.freightEvent.create({
    data: {
      freightId,
      cargoTripId: conViaje?.cargoTripId ?? null,
      driverId,
      type,
      lat: typeof input.lat === 'number' ? input.lat : null,
      lng: typeof input.lng === 'number' ? input.lng : null,
      address: input.address?.trim().slice(0, 160) || null,
      amountCop: typeof input.amountCop === 'number' ? input.amountCop : null,
      gallons: typeof input.gallons === 'number' ? input.gallons : null,
      odometerKm: typeof input.odometerKm === 'number' ? input.odometerKm : null,
      note: input.note?.trim().slice(0, 300) || null,
      photoUrl: input.photoUrl ?? null,
    },
  });
  return _eventToDTO(created);
}

/** Línea de tiempo del flete para su conductor asignado. */
export async function listFreightEventsForDriver(
  driverId: string,
  freightId: string,
): Promise<FreightEventDTO[]> {
  const f = await prisma.freightRequest.findUnique({
    where: { id: freightId },
    select: { driverId: true },
  });
  if (!f || f.driverId !== driverId) return [];
  const rows = await prisma.freightEvent.findMany({
    where: { freightId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(_eventToDTO);
}

/** Línea de tiempo + total de combustible para la EMPRESA dueña del flete. */
export async function listFreightEventsForOperator(
  operatorId: string,
  freightId: string,
): Promise<{ events: FreightEventDTO[]; fuelTotalCop: number; costs: CostBreakdown } | null> {
  const f = await prisma.freightRequest.findUnique({
    where: { id: freightId },
    select: { operatorId: true },
  });
  if (!f || f.operatorId !== operatorId) return null;
  const conViaje = await prisma.freightRequest.findUnique({
    where: { id: freightId }, select: { cargoTripId: true },
  });
  const rows = await prisma.freightEvent.findMany({
    where: conViaje?.cargoTripId
      ? { OR: [{ freightId }, { cargoTripId: conViaje.cargoTripId }] }
      : { freightId },
    orderBy: { createdAt: 'asc' },
  });
  const costs = costBreakdown(rows);
  // `fuelTotalCop` se mantiene por compatibilidad con el portal ya desplegado:
  // si solo se actualiza el backend, la bitácora vieja sigue mostrando el
  // combustible en vez de quedarse en blanco.
  return { events: rows.map(_eventToDTO), fuelTotalCop: costs.fuel, costs };
}

/**
 * Recorrido real del flete (rastro GPS) para el portal de la empresa. Devuelve
 * null si el flete no es de esa flota — misma regla que la bitácora.
 */
export async function getFreightTrackForOperator(
  operatorId: string,
  freightId: string,
): Promise<(ServiceTrack & { eta: FreightEta | null }) | null> {
  const f = await prisma.freightRequest.findUnique({
    where: { id: freightId },
    select: { operatorId: true, status: true, driverId: true, destLat: true, destLng: true },
  });
  if (!f || f.operatorId !== operatorId) return null;

  const track = await getServiceTrack('freight', freightId);
  return { ...track, eta: await _freightEta(f) };
}

export interface FreightEta {
  /** Minutos estimados hasta el destino según la ruta real por calles. */
  minutes: number;
  /** Kilómetros que faltan. */
  km: number;
  /** Hora estimada de llegada, ISO. */
  arrivesAt: string;
}

/**
 * Tiempo estimado de llegada del camión que va EN RUTA. Se calcula a demanda
 * (al abrir el recorrido de un flete), no para la lista entera: sería una
 * llamada a Google por cada fila.
 *
 * Sin `GOOGLE_MAPS_API_KEY` la llamada falla y se devuelve null — el portal
 * simplemente no muestra el ETA, igual que el resto de mapas degradan a OSM.
 */
async function _freightEta(f: {
  status: FreightStatus;
  driverId: string | null;
  destLat: number | null;
  destLng: number | null;
}): Promise<FreightEta | null> {
  if (f.status !== 'IN_PROGRESS' || !f.driverId || f.destLat == null || f.destLng == null) {
    return null;
  }
  const d = await prisma.driver.findUnique({
    where: { id: f.driverId },
    select: { lastLat: true, lastLng: true, lastSeenAt: true },
  });
  if (d?.lastLat == null || d.lastLng == null) return null;

  // Un ETA calculado desde una posición vieja se ve igual de convincente que
  // uno bueno, y es peor que no mostrar nada: si el teléfono del conductor
  // lleva horas sin reportar, el camión ya no está donde dice el último fix.
  // Sin dato fresco se omite el ETA (el recorrido sí se sigue mostrando).
  const edadS = d.lastSeenAt ? (Date.now() - d.lastSeenAt.getTime()) / 1000 : Infinity;
  if (edadS > ETA_MAX_FIX_AGE_S) return null;

  try {
    const route = await directions(d.lastLat, d.lastLng, f.destLat, f.destLng);
    return {
      minutes: route.durationMinutes,
      km: Math.round(route.distanceKm * 10) / 10,
      arrivesAt: new Date(Date.now() + route.durationMinutes * 60_000).toISOString(),
    };
  } catch {
    return null; // sin llave de Google o red caída: el portal omite el ETA
  }
}
