import { prisma } from '../lib/prisma';
import {
  OperatorType,
  OperatorDocType,
  VehicleType,
} from '@prisma/client';

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
 */
export async function affiliateDriver(operatorId: string, phone: string, name?: string) {
  const existing = await prisma.driver.findUnique({ where: { phone: phone.trim() } });
  if (existing) {
    if (existing.operatorId && existing.operatorId !== operatorId) {
      throw new Error('El conductor ya está afiliado a otra empresa.');
    }
    return prisma.driver.update({
      where: { id: existing.id },
      data: { operatorId, employmentType: 'AFFILIATED' },
      select: { id: true, name: true, phone: true, employmentType: true },
    });
  }
  return prisma.driver.create({
    data: {
      phone: phone.trim(),
      name: name?.trim() || 'Conductor',
      operatorId,
      employmentType: 'AFFILIATED',
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
  const [rows, completedAgg, total] = await Promise.all([
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
    prisma.trip.aggregate({
      where: { operatorId, status: 'COMPLETED' },
      _sum: { finalFare: true },
      _count: true,
    }),
    prisma.trip.count({ where: { operatorId } }),
  ]);

  return {
    trips: rows.map((t) => ({
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
    })),
    summary: {
      total,
      completed: completedAgg._count,
      grossFare: completedAgg._sum.finalFare ?? 0,
    },
  };
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
