import { prisma } from '../lib/prisma';
import {
  OperatorType,
  OperatorDocType,
  VehicleType,
} from '@prisma/client';
import { isValidColombianPhone, normalizeColombianPhone } from './auth.service';

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
}

export async function registerOperator(dto: RegisterOperatorDTO) {
  return prisma.operator.create({
    data: {
      legalName: dto.legalName,
      nit: dto.nit,
      tradeName: dto.tradeName ?? null,
      type: dto.type,
      contactName: dto.contactName ?? null,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail ?? null,
      city: dto.city ?? null,
      members: {
        create: {
          phone: dto.contactPhone,
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
    where: { phone: phone.trim(), active: true },
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
  capacity?: number;
  internalCode?: string;
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
      internalCode: dto.internalCode ?? null,
    },
  });
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
): Promise<OperatorTripsResult> {
  const [rows, intercityRows, completedAgg, intercityAgg, total, intercityTotal] = await Promise.all([
    prisma.trip.findMany({
      where: { operatorId },
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
      where: { operatorId },
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
    prisma.trip.aggregate({
      where: { operatorId, status: 'COMPLETED' },
      _sum: { finalFare: true },
      _count: true,
    }),
    prisma.intercityBooking.aggregate({
      where: { operatorId, status: 'COMPLETED' },
      _sum: { finalFare: true },
      _count: true,
    }),
    prisma.trip.count({ where: { operatorId } }),
    prisma.intercityBooking.count({ where: { operatorId } }),
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

  // Fusión urbano + intermunicipal, más recientes primero.
  const trips = [...urban, ...intercity]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return {
    trips,
    summary: {
      total: total + intercityTotal,
      completed: completedAgg._count + intercityAgg._count,
      grossFare: (completedAgg._sum.finalFare ?? 0) + (intercityAgg._sum.finalFare ?? 0),
    },
  };
}

/** Reporte de liquidación: viajes sellados (urbanos + intermunicipales) en CSV. */
export async function exportOperatorTripsCsv(operatorId: string): Promise<string> {
  const [rows, intercityRows] = await Promise.all([
    prisma.trip.findMany({
      where: { operatorId },
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
      where: { operatorId },
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
  ]);

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
      b.createdAt.toISOString(),
      b.completedAt?.toISOString() ?? '',
    ],
  }));

  const header = [
    'Referencia', 'Estado', 'Servicio', 'Origen', 'Destino',
    'Conductor', 'Distancia_km', 'Tarifa_COP', 'Creado', 'Completado',
  ];
  const lines = [...urban, ...intercity]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => r.cols);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...lines].map((cols) => cols.map((c) => escape(String(c))).join(',')).join('\r\n');
}

// ─── Rutas troncales (intermunicipal) ────────────────────────────────────────────
// La empresa declara las rutas que sirve; el admin las AUTORIZA (authorized=true)
// tras verificar la habilitación. El matching intermunicipal (Option B) solo
// despacha troncales a flotas con la ruta autorizada. Ver intercity.service.ts.

export const INTERCITY_CITY_CODES = [
  'PAMPLONA', 'CUCUTA', 'BUCARAMANGA', 'CHITAGA', 'MALAGA', 'OCANA', 'BOGOTA',
] as const;
const INTERCITY_CITY_SET = new Set<string>(INTERCITY_CITY_CODES);

export async function listOperatorRoutes(operatorId: string) {
  return prisma.operatorRoute.findMany({
    where: { operatorId },
    orderBy: [{ authorized: 'desc' }, { originCity: 'asc' }, { destCity: 'asc' }],
  });
}

export async function addOperatorRoute(operatorId: string, originCity: string, destCity: string) {
  const o = originCity.trim().toUpperCase();
  const d = destCity.trim().toUpperCase();
  if (!INTERCITY_CITY_SET.has(o) || !INTERCITY_CITY_SET.has(d)) {
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
