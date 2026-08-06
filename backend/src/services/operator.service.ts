import { prisma } from '../lib/prisma';
import {
  OperatorType,
  OperatorDocType,
  OperatorRole,
  VehicleType,
} from '@prisma/client';
import { isValidColombianPhone, normalizeColombianPhone } from './auth.service';
import { rangoFechas } from '../lib/date-range';
import { requiresAmount } from '../lib/freight-costs';
import { getMunicipality } from './municipality.service';

// ─────────────────────────────────────────────────────────────────────────────
// Empresas de transporte (operadores): registro, perfil, flota, conductores,
// posiciones en vivo y documentos legales. Ver docs/ESTRUCTURA_EMPRESAS_FLOTAS.md
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterOperatorDTO {
  legalName: string;
  nit: string;
  type: OperatorType;
  contactPhone: string;
  contactName?: string;
  contactEmail?: string;
  city?: string;
  tradeName?: string;
  // EMPRESA (jurídica) | PERSONA (dueño natural de vehículos: nombre + cédula).
  kind?: 'EMPRESA' | 'PERSONA';
}

export async function registerOperator(dto: RegisterOperatorDTO) {
  // E.164 canónico desde el registro: el login del portal busca por match
  // exacto, y la afiliación de conductores ya normaliza igual.
  const phone = normalizeColombianPhone(dto.contactPhone);
  return prisma.operator.create({
    data: {
      legalName: dto.legalName,
      nit: dto.nit,
      tradeName: dto.tradeName ?? null,
      kind: dto.kind ?? 'EMPRESA',
      type: dto.type,
      contactName: dto.contactName ?? null,
      contactPhone: phone,
      contactEmail: dto.contactEmail ?? null,
      city: dto.city ?? null,
      members: {
        create: {
          phone,
          name: dto.contactName ?? null,
          role: 'OWNER',
        },
      },
    },
    include: { members: true },
  });
}

/** Para el login del portal: encuentra un miembro activo por teléfono. */
export async function findOperatorMemberByPhone(phone: string) {
  return prisma.operatorMember.findFirst({
    where: { phone: normalizeColombianPhone(phone), active: true },
    include: { operator: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getOperatorProfile(operatorId: string) {
  return prisma.operator.findUnique({
    where: { id: operatorId },
    include: {
      documents: { orderBy: { uploadedAt: 'desc' } },
      _count: { select: { vehicles: true, drivers: true } },
    },
  });
}

// ─── Flota: vehículos ──────────────────────────────────────────────────────────

export async function listOperatorVehicles(operatorId: string) {
  return prisma.vehicle.findMany({
    where: { operatorId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface CreateVehicleDTO {
  driverId: string; // conductor afiliado responsable del vehículo
  type: VehicleType;
  brand: string;
  model: string;
  year: number;
  plate: string;
  color: string;
  operationCardNo?: string;
  capacity?: number;      // # de pasajeros
  capacityKg?: number;    // capacidad de carga en kg (turbo/camión/mula)
  internalCode?: string;
  soatExpiry?: string;
  rtmExpiry?: string;
  operationCardExpiry?: string;
}

export async function createOperatorVehicle(operatorId: string, dto: CreateVehicleDTO) {
  // El conductor responsable debe estar afiliado a la empresa.
  const driver = await prisma.driver.findFirst({
    where: { id: dto.driverId, operatorId },
    select: { id: true },
  });
  if (!driver) {
    throw new Error('El conductor indicado no está afiliado a la empresa.');
  }
  return prisma.vehicle.create({
    data: {
      driverId: dto.driverId,
      operatorId,
      type: dto.type,
      brand: dto.brand,
      model: dto.model,
      year: dto.year,
      plate: dto.plate.toUpperCase(),
      color: dto.color,
      operationCardNo: dto.operationCardNo ?? null,
      capacity: dto.capacity ?? null,
      capacityKg: dto.capacityKg ?? null,
      internalCode: dto.internalCode ?? null,
      soatExpiry: _toDateOrNull(dto.soatExpiry) ?? null,
      rtmExpiry: _toDateOrNull(dto.rtmExpiry) ?? null,
      operationCardExpiry: _toDateOrNull(dto.operationCardExpiry) ?? null,
    },
  });
}

export interface UpdateVehicleDTO {
  driverId?: string;
  type?: VehicleType;
  brand?: string;
  model?: string;
  year?: number;
  plate?: string;
  color?: string;
  operationCardNo?: string | null;
  capacityKg?: number | null;
  internalCode?: string | null;
  isActive?: boolean;
  // Documentos / cumplimiento (fechas ISO 'YYYY-MM-DD' o null para limpiar).
  soatExpiry?: string | null;
  rtmExpiry?: string | null;
  operationCardExpiry?: string | null;
}

// Convierte una fecha ISO ('YYYY-MM-DD') a Date, o null si viene vacía/inválida.
function _toDateOrNull(iso: string | null | undefined): Date | null | undefined {
  if (iso === undefined) return undefined;
  if (iso === null || iso === '') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Actualiza un vehículo de la flota (verifica pertenencia a la empresa). */
export async function updateOperatorVehicle(
  operatorId: string,
  vehicleId: string,
  dto: UpdateVehicleDTO,
) {
  const existing = await prisma.vehicle.findFirst({
    where: { id: vehicleId, operatorId },
    select: { id: true },
  });
  if (!existing) throw new Error('Vehículo no encontrado.');

  // Si se reasigna el conductor, debe estar afiliado a la empresa.
  if (dto.driverId !== undefined) {
    const driver = await prisma.driver.findFirst({
      where: { id: dto.driverId, operatorId },
      select: { id: true },
    });
    if (!driver) throw new Error('El conductor indicado no está afiliado a la empresa.');
  }

  return prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...(dto.driverId !== undefined && { driverId: dto.driverId }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.brand !== undefined && { brand: dto.brand.trim() }),
      ...(dto.model !== undefined && { model: dto.model.trim() }),
      ...(dto.year !== undefined && { year: dto.year }),
      ...(dto.plate !== undefined && { plate: dto.plate.trim().toUpperCase() }),
      ...(dto.color !== undefined && { color: dto.color.trim() }),
      ...(dto.operationCardNo !== undefined && { operationCardNo: dto.operationCardNo || null }),
      ...(dto.capacityKg !== undefined && { capacityKg: dto.capacityKg }),
      ...(dto.internalCode !== undefined && { internalCode: dto.internalCode || null }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(_toDateOrNull(dto.soatExpiry) !== undefined && { soatExpiry: _toDateOrNull(dto.soatExpiry) }),
      ...(_toDateOrNull(dto.rtmExpiry) !== undefined && { rtmExpiry: _toDateOrNull(dto.rtmExpiry) }),
      ...(_toDateOrNull(dto.operationCardExpiry) !== undefined && { operationCardExpiry: _toDateOrNull(dto.operationCardExpiry) }),
    },
  });
}

/** Guarda la URL de la foto del vehículo (verifica pertenencia a la empresa). */
export async function setOperatorVehiclePhoto(
  operatorId: string,
  vehicleId: string,
  photoUrl: string,
) {
  const existing = await prisma.vehicle.findFirst({
    where: { id: vehicleId, operatorId },
    select: { id: true },
  });
  if (!existing) throw new Error('Vehículo no encontrado.');
  return prisma.vehicle.update({ where: { id: vehicleId }, data: { photoUrl } });
}

/** Elimina un vehículo de la flota (verifica pertenencia a la empresa). */
export async function deleteOperatorVehicle(operatorId: string, vehicleId: string): Promise<boolean> {
  const res = await prisma.vehicle.deleteMany({ where: { id: vehicleId, operatorId } });
  return res.count > 0;
}

// ─── Flota: conductores ─────────────────────────────────────────────────────────

export async function listOperatorDrivers(operatorId: string) {
  return prisma.driver.findMany({
    where: { operatorId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      isVerified: true,
      rating: true,
      totalTrips: true,
      employmentType: true,
      // Por qué un conductor no recibe servicios. Sin estos tres campos la
      // empresa veía "verificado, en línea" y ninguna pista: con los documentos
      // vencidos el kill-switch lo saca del matching sin que el portal lo diga,
      // y sin intermunicipal habilitado no le llega ninguna troncal.
      complianceStatus: true,
      blockedReason: true,
      intercityEnabled: true,
    },
  });
}

/**
 * Afilia un conductor a la empresa por teléfono. Si ya existe (independiente o
 * por registrar), lo vincula; si no existe, crea una ficha mínima que el
 * conductor completará al loguearse en la app. Rechaza robar conductores de
 * otra empresa.
 *
 * El teléfono se normaliza a E.164 canónico (+57 + 10 dígitos) para que case
 * EXACTO con el login por OTP; y si la empresa es INTERCITY/MIXTA se habilita
 * intermunicipal automáticamente (si no, el matching troncal lo descartaría).
 */
export async function affiliateDriver(operatorId: string, phone: string, name?: string) {
  const normalized = normalizeColombianPhone(phone);
  if (!isValidColombianPhone(normalized)) {
    throw new Error('El teléfono no es un celular colombiano válido.');
  }

  const operator = await prisma.operator.findUnique({ where: { id: operatorId }, select: { type: true } });
  const enableIntercity = operator?.type === 'INTERCITY' || operator?.type === 'MIXED';

  const existing = await prisma.driver.findUnique({ where: { phone: normalized } });
  if (existing) {
    if (existing.operatorId && existing.operatorId !== operatorId) {
      throw new Error('El conductor ya está afiliado a otra empresa.');
    }
    return prisma.driver.update({
      where: { id: existing.id },
      data: { operatorId, employmentType: 'AFFILIATED', ...(enableIntercity ? { intercityEnabled: true } : {}) },
      select: { id: true, name: true, phone: true, employmentType: true },
    });
  }
  return prisma.driver.create({
    data: {
      phone: normalized,
      name: name?.trim() || 'Conductor',
      operatorId,
      employmentType: 'AFFILIATED',
      ...(enableIntercity ? { intercityEnabled: true } : {}),
    },
    select: { id: true, name: true, phone: true, employmentType: true },
  });
}

/**
 * Desafilia un conductor de la empresa: lo desvincula (operatorId=null), quita
 * su tipo de empleo e intermunicipal, y desactiva sus vehículos en la flota
 * (quedan registrados pero inactivos). Verifica que pertenezca a la empresa.
 */
export async function unaffiliateDriver(operatorId: string, driverId: string): Promise<boolean> {
  const driver = await prisma.driver.findFirst({
    where: { id: driverId, operatorId },
    select: { id: true },
  });
  if (!driver) return false;

  await prisma.$transaction([
    prisma.vehicle.updateMany({
      where: { driverId, operatorId },
      data: { isActive: false },
    }),
    prisma.driver.update({
      where: { id: driverId },
      data: { operatorId: null, employmentType: null, intercityEnabled: false },
    }),
  ]);
  return true;
}

// ─── Rastreo de flota en vivo ───────────────────────────────────────────────────

export interface FleetVehiclePositionDTO {
  driverId: string;
  driverName: string;
  status: string; // OFFLINE | ONLINE | ON_TRIP
  online: boolean; // visto en los últimos 2 min
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  vehiclePlate: string | null;
  internalCode: string | null;
}

const FRESHNESS_MS = 120_000;

export async function getFleetPositions(operatorId: string): Promise<FleetVehiclePositionDTO[]> {
  const drivers = await prisma.driver.findMany({
    where: { operatorId },
    select: {
      id: true,
      name: true,
      status: true,
      lastLat: true,
      lastLng: true,
      lastSeenAt: true,
      vehicles: {
        where: { isActive: true },
        take: 1,
        select: { plate: true, internalCode: true },
      },
    },
  });
  const now = Date.now();
  return drivers.map((d) => ({
    driverId: d.id,
    driverName: d.name,
    status: d.status,
    online: d.lastSeenAt ? now - d.lastSeenAt.getTime() < FRESHNESS_MS : false,
    lat: d.lastLat,
    lng: d.lastLng,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    vehiclePlate: d.vehicles[0]?.plate ?? null,
    internalCode: d.vehicles[0]?.internalCode ?? null,
  }));
}

// ─── Viajes de la flota (trazabilidad + liquidación) ─────────────────────────────
// Lee los viajes SELLADOS con esta empresa (operatorId), que se fija cuando un
// conductor afiliado acepta una carrera (despacho de pool abierto).

export interface OperatorTripDTO {
  id: string;
  status: string;
  serviceType: string;
  originAddress: string;
  destAddress: string;
  fare: number; // finalFare ?? estimatedFare
  distanceKm: number | null;
  driverId: string | null;
  driverName: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface OperatorTripsResult {
  trips: OperatorTripDTO[];
  summary: { total: number; completed: number; grossFare: number };
}

export async function listOperatorTrips(
  operatorId: string,
  limit = 50,
  from?: string,
  to?: string,
): Promise<OperatorTripsResult> {
  const rango = rangoFechas(from, to);
  const [rows, intercityRows, errandRows, orderRows, freightRows, completedAgg, intercityAgg, errandAgg, orderAgg, freightAgg, total, intercityTotal, errandTotal, orderTotal, freightTotal] = await Promise.all([
    prisma.trip.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        serviceType: true,
        originAddress: true,
        destAddress: true,
        estimatedFare: true,
        finalFare: true,
        distanceKm: true,
        createdAt: true,
        completedAt: true,
        driver: { select: { id: true, name: true } },
      },
    }),
    prisma.intercityBooking.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        origin: true,
        destination: true,
        pickupAddress: true,
        dropoffAddress: true,
        offeredFare: true,
        counterFare: true,
        finalFare: true,
        driverId: true,
        driverName: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.errand.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        pickupAddress: true,
        dropoffAddress: true,
        serviceFee: true,
        driverId: true,
        driverName: true,
        createdAt: true,
        deliveredAt: true,
      },
    }),
    prisma.order.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        deliveryAddress: true,
        deliveryFee: true,
        driverId: true,
        driverName: true,
        createdAt: true,
        deliveredAt: true,
        business: { select: { name: true } },
      },
    }),
    // Fletes de carga: para una empresa de carga es SU negocio, y quedaba
    // fuera del reporte con el que cierra el mes.
    prisma.freightRequest.findMany({
      // Un flete con viaje se lista COMO VIAJE: aparecería dos veces si no.
      where: { operatorId, ...rango, cargoTripId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        originAddress: true,
        destAddress: true,
        offeredPrice: true,
        finalPrice: true,
        driverId: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.trip.aggregate({
      where: { operatorId, ...rango, status: 'COMPLETED' },
      _sum: { finalFare: true },
      _count: true,
    }),
    prisma.intercityBooking.aggregate({
      where: { operatorId, ...rango, status: 'COMPLETED' },
      _sum: { finalFare: true },
      _count: true,
    }),
    prisma.errand.aggregate({
      where: { operatorId, ...rango, status: 'DELIVERED' },
      _sum: { serviceFee: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { operatorId, ...rango, status: 'DELIVERED' },
      _sum: { deliveryFee: true },
      _count: true,
    }),
    prisma.freightRequest.aggregate({
      where: { operatorId, ...rango, status: 'COMPLETED', cargoTripId: null },
      _sum: { finalPrice: true },
      _count: true,
    }),
    prisma.trip.count({ where: { operatorId, ...rango } }),
    prisma.intercityBooking.count({ where: { operatorId, ...rango } }),
    prisma.errand.count({ where: { operatorId, ...rango } }),
    prisma.order.count({ where: { operatorId, ...rango } }),
    prisma.freightRequest.count({ where: { operatorId, ...rango, cargoTripId: null } }),
  ]);

  // Viajes de carga: desde la unificación son la unidad de trabajo de una
  // empresa de carga, y el que se crea a mano en el portal (el flujo del
  // documento en papel) no nace de ningún flete. Sin esto, una flota cerraba
  // el mes con su negocio entero fuera del reporte y del CSV.
  const [cargoRows, cargoAgg, cargoTotal] = await Promise.all([
    prisma.cargoTrip.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, number: true, status: true, isUrban: true,
        originCity: true, originPlace: true, destCity: true,
        freightAmount: true, driverId: true, driverName: true,
        createdAt: true, completedAt: true,
        manifests: { where: { status: { not: 'CANCELLED' } }, select: { clientCity: true }, take: 1 },
      },
    }),
    prisma.cargoTrip.aggregate({
      where: { operatorId, ...rango, status: 'COMPLETED' },
      _sum: { freightAmount: true },
      _count: true,
    }),
    prisma.cargoTrip.count({ where: { operatorId, ...rango } }),
  ]);

  const urban: OperatorTripDTO[] = rows.map((t) => ({
    id: t.id,
    status: t.status,
    serviceType: t.serviceType,
    originAddress: t.originAddress,
    destAddress: t.destAddress,
    fare: t.finalFare ?? t.estimatedFare,
    distanceKm: t.distanceKm,
    driverId: t.driver?.id ?? null,
    driverName: t.driver?.name ?? null,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
  }));

  const intercity: OperatorTripDTO[] = intercityRows.map((b) => ({
    id: b.id,
    status: b.status,
    serviceType: 'INTERCITY',
    originAddress: b.pickupAddress || b.origin,
    destAddress: b.dropoffAddress || b.destination,
    fare: b.finalFare ?? b.counterFare ?? b.offeredFare,
    distanceKm: null,
    driverId: b.driverId,
    driverName: b.driverName,
    createdAt: b.createdAt.toISOString(),
    completedAt: b.completedAt?.toISOString() ?? null,
  }));

  // Mandados: estados propios normalizados al vocabulario de viajes para que
  // el portal los pinte con los mismos badges (DELIVERED→COMPLETED, etc.).
  const errands: OperatorTripDTO[] = errandRows.map((e) => ({
    id: e.id,
    status: _errandStatusForPortal(e.status),
    serviceType: 'MANDADO',
    originAddress: e.pickupAddress,
    destAddress: e.dropoffAddress,
    fare: e.serviceFee,
    distanceKm: null,
    driverId: e.driverId,
    driverName: e.driverName,
    createdAt: e.createdAt.toISOString(),
    completedAt: e.deliveredAt?.toISOString() ?? null,
  }));

  // Pedidos: el domicilio (deliveryFee) es lo que gana la flota por la entrega.
  const orders: OperatorTripDTO[] = orderRows.map((o) => ({
    id: o.id,
    status: _orderStatusForPortal(o.status),
    serviceType: 'PEDIDO',
    originAddress: o.business?.name ?? 'Negocio',
    destAddress: o.deliveryAddress,
    fare: o.deliveryFee,
    distanceKm: null,
    driverId: o.driverId,
    driverName: o.driverName,
    createdAt: o.createdAt.toISOString(),
    completedAt: o.deliveredAt?.toISOString() ?? null,
  }));

  // Fletes: el conductor se guarda por id, así que el nombre se resuelve
  // aparte (una sola consulta para todo el lote).
  const freightDriverIds = [...new Set(freightRows.map((f) => f.driverId).filter((v): v is string => !!v))];
  const freightDriverName = new Map<string, string>();
  if (freightDriverIds.length > 0) {
    const ds = await prisma.driver.findMany({
      where: { id: { in: freightDriverIds } },
      select: { id: true, name: true },
    });
    for (const d of ds) freightDriverName.set(d.id, d.name);
  }

  const freights: OperatorTripDTO[] = freightRows.map((f) => ({
    id: f.id,
    // FreightStatus ya usa el mismo vocabulario del portal (REQUESTED,
    // ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED): no hay que normalizarlo.
    status: f.status,
    serviceType: 'FLETE',
    originAddress: f.originAddress,
    destAddress: f.destAddress,
    fare: f.finalPrice ?? f.offeredPrice,
    distanceKm: null,
    driverId: f.driverId,
    driverName: f.driverId ? freightDriverName.get(f.driverId) ?? null : null,
    createdAt: f.createdAt.toISOString(),
    completedAt: f.completedAt?.toISOString() ?? null,
  }));

  const cargo: OperatorTripDTO[] = cargoRows.map((t) => ({
    id: t.id,
    status: t.status,
    serviceType: 'CARGA',
    originAddress: [t.originCity, t.originPlace].filter(Boolean).join(' · '),
    // El destino del viaje: el declarado manda y, si no lo hay, la ciudad de la
    // primera línea de mercancía — que es a donde va el camión.
    destAddress: t.destCity ?? t.manifests[0]?.clientCity ?? (t.isUrban ? 'Acarreo urbano' : ''),
    fare: t.freightAmount ?? 0,
    distanceKm: null,
    driverId: t.driverId,
    driverName: t.driverName,
    createdAt: t.createdAt.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
  }));

  // Fusión urbano + intermunicipal + mandados + pedidos + fletes + carga,
  // recientes primero.
  const trips = [...urban, ...intercity, ...errands, ...orders, ...freights, ...cargo]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return {
    trips,
    summary: {
      total: total + intercityTotal + errandTotal + orderTotal + freightTotal + cargoTotal,
      completed:
        completedAgg._count + intercityAgg._count + errandAgg._count + orderAgg._count +
        freightAgg._count + cargoAgg._count,
      grossFare:
        (completedAgg._sum.finalFare ?? 0) +
        (intercityAgg._sum.finalFare ?? 0) +
        (errandAgg._sum.serviceFee ?? 0) +
        (orderAgg._sum.deliveryFee ?? 0) +
        (freightAgg._sum.finalPrice ?? 0) +
        (cargoAgg._sum.freightAmount ?? 0),
    },
  };
}

/** Estados de pedido → vocabulario de viajes del portal. */
function _orderStatusForPortal(status: string): string {
  switch (status) {
    case 'DELIVERED': return 'COMPLETED';
    case 'DRIVER_TO_PICKUP':
    case 'AT_PICKUP':
    case 'IN_TRANSIT': return 'IN_PROGRESS';
    case 'PENDING':
    case 'PREPARING':
    case 'CONFIRMED': return 'SEARCHING';
    default: return status; // CANCELLED
  }
}

/** Estados de mandado → vocabulario de viajes del portal. */
function _errandStatusForPortal(status: string): string {
  switch (status) {
    case 'DELIVERED': return 'COMPLETED';
    case 'SHOPPING':
    case 'ON_THE_WAY': return 'IN_PROGRESS';
    default: return status; // SEARCHING | ACCEPTED | CANCELLED
  }
}

/** Reporte de liquidación: viajes sellados (urbanos + intermunicipales + mandados) en CSV. */
export async function exportOperatorTripsCsv(
  operatorId: string,
  from?: string,
  to?: string,
): Promise<string> {
  const rango = rangoFechas(from, to);
  const [rows, intercityRows, errandRows, orderRows, freightRows, cargoRows] = await Promise.all([
    prisma.trip.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        requestRef: true,
        status: true,
        serviceType: true,
        originAddress: true,
        destAddress: true,
        estimatedFare: true,
        finalFare: true,
        distanceKm: true,
        createdAt: true,
        completedAt: true,
        driver: { select: { name: true } },
      },
    }),
    prisma.intercityBooking.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        requestRef: true,
        status: true,
        origin: true,
        destination: true,
        pickupAddress: true,
        dropoffAddress: true,
        offeredFare: true,
        counterFare: true,
        finalFare: true,
        driverName: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.errand.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        requestRef: true,
        status: true,
        pickupAddress: true,
        dropoffAddress: true,
        serviceFee: true,
        driverName: true,
        createdAt: true,
        deliveredAt: true,
      },
    }),
    prisma.order.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        orderRef: true,
        status: true,
        deliveryAddress: true,
        deliveryFee: true,
        driverName: true,
        createdAt: true,
        deliveredAt: true,
        business: { select: { name: true } },
      },
    }),
    // Fletes de carga: sin ellos el CSV con el que se cierra el mes deja fuera
    // el negocio entero de una empresa de carga. Los que ya tienen viaje se
    // exportan COMO VIAJE (abajo): contarlos aquí también duplicaría la plata.
    prisma.freightRequest.findMany({
      where: { operatorId, ...rango, cargoTripId: null },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        status: true,
        originAddress: true,
        destAddress: true,
        offeredPrice: true,
        finalPrice: true,
        driverId: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    // Viajes de carga (los del portal, que no nacen de ningún flete).
    prisma.cargoTrip.findMany({
      where: { operatorId, ...rango },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true, number: true, status: true, isUrban: true,
        originCity: true, originPlace: true, destCity: true,
        freightAmount: true, driverName: true,
        createdAt: true, completedAt: true,
        manifests: { where: { status: { not: 'CANCELLED' } }, select: { clientCity: true }, take: 1 },
      },
    }),
  ]);

  // Nombre del conductor y gastos de ruta de esos fletes (una consulta por lote).
  const fDriverIds = [...new Set(freightRows.map((f) => f.driverId).filter((v): v is string => !!v))];
  const fIds = freightRows.map((f) => f.id);
  const cIds = cargoRows.map((t) => t.id);
  const [fDrivers, fEvents] = await Promise.all([
    fDriverIds.length
      ? prisma.driver.findMany({ where: { id: { in: fDriverIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
    fIds.length || cIds.length
      ? prisma.freightEvent.findMany({
          where: { OR: [{ freightId: { in: fIds } }, { cargoTripId: { in: cIds } }] },
          select: { freightId: true, cargoTripId: true, type: true, amountCop: true },
        })
      : Promise.resolve(
          [] as {
            freightId: string | null; cargoTripId: string | null;
            type: string; amountCop: number | null;
          }[],
        ),
  ]);
  const fDriverName = new Map(fDrivers.map((d) => [d.id, d.name]));
  // Un gasto cuelga del viaje o del flete: se indexa por el que traiga, y el
  // viaje manda cuando trae los dos (es la unidad desde la unificación).
  const fCost = new Map<string, number>();
  for (const e of fEvents) {
    const monto = e.amountCop ?? 0;
    const clave = e.cargoTripId ?? e.freightId;
    if (!(monto > 0) || !requiresAmount(e.type) || !clave) continue;
    fCost.set(clave, (fCost.get(clave) ?? 0) + monto);
  }

  type CsvRow = { createdAt: Date; cols: string[] };
  const urban: CsvRow[] = rows.map((t) => ({
    createdAt: t.createdAt,
    cols: [
      t.requestRef,
      t.status,
      t.serviceType,
      t.originAddress,
      t.destAddress,
      t.driver?.name ?? '',
      t.distanceKm != null ? t.distanceKm.toFixed(2) : '',
      String(Math.round(t.finalFare ?? t.estimatedFare)),
      '',
      t.createdAt.toISOString(),
      t.completedAt?.toISOString() ?? '',
    ],
  }));
  const intercity: CsvRow[] = intercityRows.map((b) => ({
    createdAt: b.createdAt,
    cols: [
      b.requestRef,
      b.status,
      'INTERCITY',
      b.pickupAddress || b.origin,
      b.dropoffAddress || b.destination,
      b.driverName ?? '',
      '',
      String(Math.round(b.finalFare ?? b.counterFare ?? b.offeredFare)),
      '',
      b.createdAt.toISOString(),
      b.completedAt?.toISOString() ?? '',
    ],
  }));

  const errands: CsvRow[] = errandRows.map((e) => ({
    createdAt: e.createdAt,
    cols: [
      e.requestRef,
      _errandStatusForPortal(e.status),
      'MANDADO',
      e.pickupAddress,
      e.dropoffAddress,
      e.driverName ?? '',
      '',
      String(Math.round(e.serviceFee)),
      '',
      e.createdAt.toISOString(),
      e.deliveredAt?.toISOString() ?? '',
    ],
  }));

  const orders: CsvRow[] = orderRows.map((o) => ({
    createdAt: o.createdAt,
    cols: [
      o.orderRef,
      _orderStatusForPortal(o.status),
      'PEDIDO',
      o.business?.name ?? 'Negocio',
      o.deliveryAddress,
      o.driverName ?? '',
      '',
      String(Math.round(o.deliveryFee)),
      '',
      o.createdAt.toISOString(),
      o.deliveredAt?.toISOString() ?? '',
    ],
  }));

  const freights: CsvRow[] = freightRows.map((f) => ({
    createdAt: f.createdAt,
    cols: [
      // FreightRequest no tiene requestRef; el id es su referencia.
      f.id,
      f.status,
      'FLETE',
      f.originAddress,
      f.destAddress,
      f.driverId ? fDriverName.get(f.driverId) ?? '' : '',
      '',
      String(Math.round(f.finalPrice ?? f.offeredPrice)),
      String(Math.round(fCost.get(f.id) ?? 0)),
      f.createdAt.toISOString(),
      f.completedAt?.toISOString() ?? '',
    ],
  }));

  const cargo: CsvRow[] = cargoRows.map((t) => ({
    createdAt: t.createdAt,
    cols: [
      // La referencia del viaje es su consecutivo, como en el papel.
      `Viaje ${t.number}`,
      t.status,
      'CARGA',
      [t.originCity, t.originPlace].filter(Boolean).join(' · '),
      t.destCity ?? t.manifests[0]?.clientCity ?? (t.isUrban ? 'Acarreo urbano' : ''),
      t.driverName ?? '',
      '',
      String(Math.round(t.freightAmount ?? 0)),
      String(Math.round(fCost.get(t.id) ?? 0)),
      t.createdAt.toISOString(),
      t.completedAt?.toISOString() ?? '',
    ],
  }));

  const header = [
    'Referencia', 'Estado', 'Servicio', 'Origen', 'Destino',
    'Conductor', 'Distancia_km', 'Tarifa_COP', 'Gastos_COP', 'Creado', 'Completado',
  ];
  const lines = [...urban, ...intercity, ...errands, ...orders, ...freights, ...cargo]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => r.cols);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...lines].map((cols) => cols.map((c) => escape(String(c))).join(',')).join('\r\n');
}

// ─── Rutas troncales (intermunicipal) ────────────────────────────────────────────
// La empresa declara las rutas que sirve; el admin las AUTORIZA (authorized=true)
// tras verificar la habilitación. El matching intermunicipal (Option B) solo
// despacha troncales a flotas con la ruta autorizada. Ver intercity.service.ts.

export async function listOperatorRoutes(operatorId: string) {
  return prisma.operatorRoute.findMany({
    where: { operatorId },
    orderBy: [{ authorized: 'desc' }, { originCity: 'asc' }, { destCity: 'asc' }],
  });
}

export async function addOperatorRoute(operatorId: string, originCity: string, destCity: string) {
  // Slug del municipio, igual que en las reservas. Antes se guardaba en
  // MAYÚSCULAS mientras el matching comparaba el slug en minúsculas: con
  // INTERCITY_DUAL_MODEL activo NINGUNA ruta habría casado nunca.
  const o = originCity.trim().toLowerCase();
  const d = destCity.trim().toLowerCase();
  if (!(await getMunicipality(o)) || !(await getMunicipality(d))) {
    throw new Error('Ciudad de origen o destino no válida.');
  }
  if (o === d) throw new Error('El origen y el destino deben ser diferentes.');

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { type: true },
  });
  if (!operator || (operator.type !== 'INTERCITY' && operator.type !== 'MIXED')) {
    throw new Error('Solo las empresas intermunicipales o mixtas pueden declarar rutas troncales.');
  }

  const existing = await prisma.operatorRoute.findUnique({
    where: { operatorId_originCity_destCity: { operatorId, originCity: o, destCity: d } },
  });
  if (existing) throw new Error('Esa ruta ya está registrada.');

  return prisma.operatorRoute.create({
    data: { operatorId, originCity: o, destCity: d, authorized: false },
  });
}

/** Borra una ruta del operador dueño (deleteMany acota al operador, sin tocar otras). */
export async function removeOperatorRoute(operatorId: string, routeId: string): Promise<boolean> {
  const res = await prisma.operatorRoute.deleteMany({ where: { id: routeId, operatorId } });
  return res.count > 0;
}

// ─── Documentos legales de la empresa ────────────────────────────────────────────

export async function listOperatorDocuments(operatorId: string) {
  return prisma.operatorDocument.findMany({
    where: { operatorId },
    orderBy: { uploadedAt: 'desc' },
  });
}

export async function uploadOperatorDocument(
  operatorId: string,
  type: OperatorDocType,
  fileUrl: string,
  expiresAt?: string,
) {
  return prisma.operatorDocument.create({
    data: {
      operatorId,
      type,
      fileUrl,
      status: 'PENDING',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
}

// ─── Miembros del portal ──────────────────────────────────────────────────────
// `OperatorMember` y sus roles existían y `requireOperatorRole` los exigía, pero
// ninguna ruta creaba miembros: una flota solo podía tener el usuario del
// registro. Un despachador no tenía forma de entrar.

export interface OperatorMemberDTO {
  id: string;
  phone: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export async function listOperatorMembers(operatorId: string): Promise<OperatorMemberDTO[]> {
  const rows = await prisma.operatorMember.findMany({
    where: { operatorId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((m) => ({
    id: m.id,
    phone: m.phone,
    name: m.name,
    role: String(m.role),
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function addOperatorMember(
  operatorId: string,
  rawPhone: string,
  name: string | undefined,
  role: OperatorRole,
): Promise<OperatorMemberDTO> {
  // E.164 obligatorio: el login del portal casa por teléfono exacto, así que un
  // "300 111 2233" guardado con espacios sería un acceso que nunca funciona.
  const phone = normalizeColombianPhone(rawPhone);
  const yaExiste = await prisma.operatorMember.findFirst({ where: { operatorId, phone } });
  if (yaExiste) throw new Error('Ese teléfono ya tiene acceso a esta empresa.');

  const enOtra = await prisma.operatorMember.findFirst({ where: { phone } });
  if (enOtra) throw new Error('Ese teléfono ya pertenece a otra empresa.');

  const m = await prisma.operatorMember.create({
    data: { operatorId, phone, name: name?.trim() || null, role },
  });
  return {
    id: m.id,
    phone: m.phone,
    name: m.name,
    role: String(m.role),
    createdAt: m.createdAt.toISOString(),
  };
}

export async function removeOperatorMember(operatorId: string, memberId: string): Promise<void> {
  const miembro = await prisma.operatorMember.findFirst({ where: { id: memberId, operatorId } });
  if (!miembro) throw new Error('Ese acceso no existe.');

  // Sin dueños, la empresa queda sin nadie que pueda administrarla — y no hay
  // forma de recuperarla desde el portal.
  if (miembro.role === 'OWNER') {
    const dueños = await prisma.operatorMember.count({ where: { operatorId, role: 'OWNER' } });
    if (dueños <= 1) {
      throw new Error('No puedes quitar al último administrador: la empresa quedaría sin acceso.');
    }
  }
  await prisma.operatorMember.delete({ where: { id: memberId } });
}

// ─── Perfil de la empresa ─────────────────────────────────────────────────────

export interface UpdateOperatorProfileDTO {
  tradeName?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  city?: string;
}

/**
 * Datos de contacto de la empresa. `legalName`, `nit` y `type` NO se tocan
 * aquí: son la identidad legal sobre la que el admin verificó la habilitación,
 * y cambiarlos por autoservicio dejaría la verificación apuntando a otra cosa.
 */
export async function updateOperatorProfile(
  operatorId: string,
  dto: UpdateOperatorProfileDTO,
) {
  const data: Record<string, string | null> = {};
  const texto = (v: string | undefined) => (v == null ? undefined : v.trim() || null);

  if (dto.tradeName !== undefined) data['tradeName'] = texto(dto.tradeName) as string | null;
  if (dto.contactName !== undefined) data['contactName'] = texto(dto.contactName) as string | null;
  if (dto.contactEmail !== undefined) data['contactEmail'] = texto(dto.contactEmail) as string | null;
  if (dto.city !== undefined) data['city'] = texto(dto.city) as string | null;
  if (dto.contactPhone !== undefined) {
    const p = texto(dto.contactPhone);
    data['contactPhone'] = p ? normalizeColombianPhone(p) : null;
  }

  if (Object.keys(data).length === 0) throw new Error('No hay nada que actualizar.');
  return prisma.operator.update({ where: { id: operatorId }, data });
}
