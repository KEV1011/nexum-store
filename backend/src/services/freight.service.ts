// ── Fletes de carga (cliente ↔ empresa/dueño de camiones) ─────────────────────
//
// Modelo marketplace: el cliente publica el flete (peso, tipo de camión, precio
// ofrecido, fecha opcional) y las flotas de carga verificadas lo ven en su
// portal y lo toman asignando conductor + vehículo. Al completar, la plataforma
// liquida descontando su comisión (mismo COMMISSION_RATE de los viajes) y las
// ganancias alimentan el wallet del conductor vía recordCompletedTrip.

import { FreightStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { COMMISSION_RATE, INTERCITY_CITY_COORDS } from '../config/constants';
import { recordCompletedTrip } from './earnings.service';
import { sendPushToDriver, sendPushToClient } from './push.service';
import { docKillSwitchEnforced } from './document-expiry.service';

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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes
  const coords = (INTERCITY_CITY_COORDS as Record<string, { lat: number; lng: number }>)[key];
  return coords ?? _PAMPLONA;
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
}

function _toDTO(f: {
  id: string; clientId: string; clientName: string | null; clientPhone: string | null;
  originAddress: string; destAddress: string; originCity: string | null; destCity: string | null;
  cargoDescription: string; weightKg: number; vehicleType: VehicleType; offeredPrice: number;
  scheduledFor: Date | null; status: FreightStatus; operatorId: string | null;
  driverId: string | null; vehicleId: string | null; finalPrice: number | null;
  commission: number | null; netEarning: number | null; createdAt: Date;
  acceptedAt: Date | null; completedAt: Date | null;
  originLat?: number | null; originLng?: number | null;
  destLat?: number | null; destLng?: number | null;
}) {
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
    completedAt: f.completedAt?.toISOString(),
  };
}
export type FreightDTO = ReturnType<typeof _toDTO>;

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
      originLat: oc.lat,
      originLng: oc.lng,
      destLat: dc.lat,
      destLng: dc.lng,
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

export async function listClientFreights(clientId: string): Promise<FreightDTO[]> {
  const rows = await prisma.freightRequest.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(_toDTO);
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
  return rows.map(_toDTO);
}

export async function listOperatorFreights(operatorId: string): Promise<FreightDTO[]> {
  const rows = await prisma.freightRequest.findMany({
    where: { operatorId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(_toDTO);
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
): Promise<FreightDTO> {
  const f = await prisma.freightRequest.findUnique({ where: { id: freightId } });
  if (!f || f.driverId !== driverId) throw new FreightError('El flete no existe o no está asignado a ti.');
  return _applyFreightStatus(f, status);
}

async function _applyFreightStatus(
  f: NonNullable<Awaited<ReturnType<typeof prisma.freightRequest.findUnique>>>,
  status: 'in_progress' | 'completed' | 'cancelled',
): Promise<FreightDTO> {
  const freightId = f.id;

  // Todas las transiciones usan updateMany con guard de status: dos llamadas
  // concurrentes (portal + app del conductor) no pueden aplicar la misma
  // transición dos veces — clave en 'completed', que liquida ganancias.
  if (status === 'in_progress') {
    const res = await prisma.freightRequest.updateMany({
      where: { id: freightId, status: 'ACCEPTED' },
      data: { status: 'IN_PROGRESS' },
    });
    if (res.count === 0) throw new FreightError('Solo un flete aceptado puede iniciar ruta.');
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
      data: { status: 'REQUESTED', operatorId: null, driverId: null, vehicleId: null, acceptedAt: null },
    });
    if (res.count === 0) throw new FreightError('El flete ya fue completado o cancelado.');
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
    data: { status: 'COMPLETED', finalPrice, commission, netEarning, completedAt: new Date() },
  });
  if (res.count === 0) throw new FreightError('El flete no está en ruta.');
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
  totalNet: number;
  totalServices: number;
  byService: Record<string, { count: number; gross: number }>;
  byDriver: { name: string; count: number; gross: number }[];
  byVehicle: { plate: string; count: number; gross: number }[];
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
      where: { operatorId, status: 'COMPLETED', completedAt: range },
      select: {
        finalPrice: true, commission: true, netEarning: true,
        driverId: true, vehicleId: true,
      },
    }),
  ]);

  // Nombres de conductor/placa para los fletes (guardan ids, no nombres).
  const drvIds = [...new Set(freights.map((x) => x.driverId).filter((v): v is string => !!v))];
  const vehIds = [...new Set(freights.map((x) => x.vehicleId).filter((v): v is string => !!v))];
  const [drvRows, vehRows] = await Promise.all([
    drvIds.length ? prisma.driver.findMany({ where: { id: { in: drvIds } }, select: { id: true, name: true } }) : [],
    vehIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehIds } }, select: { id: true, plate: true } }) : [],
  ]);
  const drvName = new Map(drvRows.map((d) => [d.id, d.name]));
  const vehPlate = new Map(vehRows.map((v) => [v.id, v.plate]));

  const byService: Record<string, { count: number; gross: number }> = {};
  const byDriverMap = new Map<string, { count: number; gross: number }>();
  const byVehicleMap = new Map<string, { count: number; gross: number }>();
  let totalGross = 0;
  let totalCommission = 0;

  const add = (service: string, gross: number, commission: number, driverName?: string | null, plate?: string | null) => {
    totalGross += gross;
    totalCommission += commission;
    byService[service] = {
      count: (byService[service]?.count ?? 0) + 1,
      gross: (byService[service]?.gross ?? 0) + gross,
    };
    if (driverName) {
      const cur = byDriverMap.get(driverName) ?? { count: 0, gross: 0 };
      byDriverMap.set(driverName, { count: cur.count + 1, gross: cur.gross + gross });
    }
    if (plate) {
      const cur = byVehicleMap.get(plate) ?? { count: 0, gross: 0 };
      byVehicleMap.set(plate, { count: cur.count + 1, gross: cur.gross + gross });
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
    );
  }

  const byDriver = [...byDriverMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.gross - a.gross);
  const byVehicle = [...byVehicleMap.entries()]
    .map(([plate, v]) => ({ plate, ...v }))
    .sort((a, b) => b.gross - a.gross);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalGross,
    totalCommission,
    totalNet: totalGross - totalCommission,
    totalServices: Object.values(byService).reduce((s, x) => s + x.count, 0),
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
  return rows.map(_toDTO);
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
  return { freights: rows.map(_toDTO), vehicles };
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
