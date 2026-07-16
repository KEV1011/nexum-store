import { OperatorStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';

// ─────────────────────────────────────────────────────────────────────────────
// Admin service — métricas operativas y listados para el panel /admin.
// Solo lecturas agregadas; las acciones (aprobar documentos, crear promos)
// viven en sus servicios propios.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminMetrics {
  trips: {
    todayRequested: number;
    todayCompleted: number;
    todayCancelled: number;
    last7dCompleted: number;
    activeNow: number; // ACCEPTED/ARRIVING/ARRIVED/IN_PROGRESS
  };
  money: {
    todayGmv: number;        // suma de finalFare de viajes completados hoy
    todayCommission: number; // ingreso plataforma hoy
    paymentsApprovedToday: number;
  };
  drivers: {
    total: number;
    verified: number;
    onlineNow: number;
    pendingDocuments: number;
  };
  users: {
    total: number;
    newToday: number;
  };
  safety: {
    sosLast24h: number;
  };
}

function _startOfToday(): Date {
  // Colombia es UTC-5 sin DST: el "día operativo" se corta a medianoche local.
  const now = new Date();
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  bogota.setUTCHours(0, 0, 0, 0);
  return new Date(bogota.getTime() + 5 * 60 * 60 * 1000);
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const today = _startOfToday();
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    todayRequested,
    todayCompletedAgg,
    todayCancelled,
    last7dCompleted,
    activeNow,
    paymentsToday,
    driversTotal,
    driversVerified,
    driversOnline,
    pendingDocs,
    usersTotal,
    usersToday,
    sosLast24h,
  ] = await Promise.all([
    prisma.trip.count({ where: { createdAt: { gte: today } } }),
    prisma.trip.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: today } },
      _count: { _all: true },
      _sum: { finalFare: true, commission: true },
    }),
    prisma.trip.count({ where: { status: 'CANCELLED', updatedAt: { gte: today } } }),
    prisma.trip.count({ where: { status: 'COMPLETED', completedAt: { gte: last7d } } }),
    prisma.trip.count({ where: { status: { in: ['ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'] } } }),
    prisma.payment.aggregate({
      where: { status: 'approved', updatedAt: { gte: today } },
      _sum: { amount: true },
    }),
    prisma.driver.count(),
    prisma.driver.count({ where: { isVerified: true } }),
    prisma.driver.count({ where: { status: 'ONLINE' } }),
    prisma.driverDocument.count({ where: { status: 'PENDING' } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.emergencyEvent.count({ where: { createdAt: { gte: last24h } } }),
  ]);

  return {
    trips: {
      todayRequested,
      todayCompleted: todayCompletedAgg._count._all,
      todayCancelled,
      last7dCompleted,
      activeNow,
    },
    money: {
      todayGmv: Math.round(todayCompletedAgg._sum.finalFare ?? 0),
      todayCommission: Math.round(todayCompletedAgg._sum.commission ?? 0),
      paymentsApprovedToday: Math.round(paymentsToday._sum.amount ?? 0),
    },
    drivers: {
      total: driversTotal,
      verified: driversVerified,
      onlineNow: driversOnline,
      pendingDocuments: pendingDocs,
    },
    users: { total: usersTotal, newToday: usersToday },
    safety: { sosLast24h },
  };
}

// ─── Conductores ──────────────────────────────────────────────────────────────

export interface AdminDriverRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  isVerified: boolean;
  intercityEnabled: boolean;
  rating: number;
  totalTrips: number;
  vehicle: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  kycStatus: string;
  hasSelfie: boolean;
  selfieUrl: string | null;
  fraudFlags: number;
}

export async function listDriversForAdmin(): Promise<AdminDriverRow[]> {
  const drivers = await prisma.driver.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { vehicles: { where: { isActive: true }, take: 1 } },
  });
  return drivers.map((d) => {
    const v = d.vehicles[0];
    return {
      id: d.id,
      name: d.name,
      phone: d.phone,
      status: d.status,
      isVerified: d.isVerified,
      intercityEnabled: d.intercityEnabled,
      rating: d.rating,
      totalTrips: d.totalTrips,
      vehicle: v ? `${v.brand} ${v.model} · ${v.plate}` : null,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      kycStatus: d.kycStatus,
      hasSelfie: !!d.selfieUrl,
      selfieUrl: d.selfieUrl,
      fraudFlags: d.fraudFlags,
    };
  });
}

// ─── Diagnóstico de despacho ──────────────────────────────────────────────────
// "Las apps no interactúan" casi siempre es UNO de los cuatro filtros del
// matching fallando en silencio. Esta radiografía evalúa cada filtro por
// conductor contra un punto de recogida dado — el panel la muestra como tabla.

export interface MatchingDiagRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  isVerified: boolean;
  intercityEnabled: boolean;
  /** Segundos desde el último heartbeat GPS; null si nunca reportó. */
  geoAgeSeconds: number | null;
  /** Distancia al punto consultado en metros; null sin posición. */
  distanceMeters: number | null;
  online: boolean;
  fresh: boolean;
  inRadius: boolean;
  /** Pasa TODOS los filtros del matching urbano: recibiría la oferta. */
  dispatchable: boolean;
}

const URBAN_RADIUS_M = 5000;
const URBAN_FRESHNESS_S = 120;

export async function diagnoseMatching(lat: number, lng: number): Promise<MatchingDiagRow[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    isVerified: boolean;
    intercityEnabled: boolean;
    geo_age_s: number | null;
    distance_m: number | null;
  }>>`
    SELECT d."id", d."name", d."phone", d."status", d."isVerified", d."intercityEnabled",
           CASE WHEN d."lastSeenAt" IS NULL THEN NULL
                ELSE EXTRACT(EPOCH FROM (now() - d."lastSeenAt")) END AS geo_age_s,
           CASE WHEN d."geo" IS NULL THEN NULL
                ELSE ST_Distance(
                       d."geo",
                       ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
                     ) END AS distance_m
    FROM "drivers" d
    ORDER BY distance_m ASC NULLS LAST
    LIMIT 100`;

  return rows.map((r) => {
    const geoAge = r.geo_age_s === null ? null : Math.round(Number(r.geo_age_s));
    const dist = r.distance_m === null ? null : Math.round(Number(r.distance_m));
    const online = r.status === 'ONLINE';
    const fresh = geoAge !== null && geoAge <= URBAN_FRESHNESS_S;
    const inRadius = dist !== null && dist <= URBAN_RADIUS_M;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      status: r.status,
      isVerified: r.isVerified,
      intercityEnabled: r.intercityEnabled,
      geoAgeSeconds: geoAge,
      distanceMeters: dist,
      online,
      fresh,
      inRadius,
      dispatchable: online && r.isVerified && fresh && inRadius,
    };
  });
}

/**
 * Marca/desmarca un conductor como verificado directamente (atajo de piloto para
 * habilitarlo en el matching sin pasar por la aprobación documento a documento).
 */
export async function setDriverVerified(driverId: string, verified: boolean): Promise<boolean> {
  const d = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
  if (!d) return false;
  await prisma.driver.update({ where: { id: driverId }, data: { isVerified: verified } });
  return true;
}

// ─── Eventos SOS ──────────────────────────────────────────────────────────────

export interface AdminSosRow {
  id: string;
  type: string;
  actorRole: 'cliente' | 'conductor' | 'desconocido';
  actorName: string;
  actorPhoneMasked: string;
  tripId: string | null;
  lat: number;
  lng: number;
  mapLink: string;
  createdAt: string;
}

export async function listSosForAdmin(): Promise<AdminSosRow[]> {
  const events = await prisma.emergencyEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { name: true, phone: true } },
      driver: { select: { name: true, phone: true } },
    },
  });
  return events.map((e) => {
    const actor = e.user ?? e.driver;
    return {
      id: e.id,
      type: e.type,
      actorRole: e.user ? 'cliente' : e.driver ? 'conductor' : 'desconocido',
      actorName: actor?.name ?? '—',
      actorPhoneMasked: (actor && maskPhone(actor.phone)) ?? '—',
      tripId: e.tripId,
      lat: e.lat,
      lng: e.lng,
      mapLink: `https://maps.google.com/?q=${e.lat},${e.lng}`,
      createdAt: e.createdAt.toISOString(),
    };
  });
}

// ─── Empresas de transporte (operadores) ──────────────────────────────────────

export interface AdminOperatorRow {
  id: string;
  legalName: string;
  nit: string;
  type: string;
  status: string;
  isVerified: boolean;
  city: string | null;
  contactPhone: string | null;
  vehicles: number;
  drivers: number;
  pendingDocs: number;
  createdAt: string;
}

export async function listOperatorsForAdmin(status?: OperatorStatus): Promise<AdminOperatorRow[]> {
  const ops = await prisma.operator.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      _count: { select: { vehicles: true, drivers: true } },
      documents: { where: { status: 'PENDING' }, select: { id: true } },
    },
  });
  return ops.map((o) => ({
    id: o.id,
    legalName: o.legalName,
    nit: o.nit,
    type: o.type,
    status: o.status,
    isVerified: o.isVerified,
    city: o.city,
    contactPhone: o.contactPhone,
    vehicles: o._count.vehicles,
    drivers: o._count.drivers,
    pendingDocs: o.documents.length,
    createdAt: o.createdAt.toISOString(),
  }));
}

/** Verifica (ACTIVE) o suspende (SUSPENDED) una empresa. isVerified sigue a ACTIVE. */
export async function setOperatorStatus(id: string, status: OperatorStatus): Promise<boolean> {
  const op = await prisma.operator.findUnique({ where: { id }, select: { id: true } });
  if (!op) return false;
  await prisma.operator.update({
    where: { id },
    data: { status, isVerified: status === 'ACTIVE' },
  });
  return true;
}

// ─── Rutas troncales de una empresa (autorización del admin) ─────────────────────

export interface AdminOperatorRouteRow {
  id: string;
  originCity: string;
  destCity: string;
  authorized: boolean;
  createdAt: string;
}

export async function listOperatorRoutesForAdmin(operatorId: string): Promise<AdminOperatorRouteRow[]> {
  const routes = await prisma.operatorRoute.findMany({
    where: { operatorId },
    orderBy: [{ authorized: 'asc' }, { originCity: 'asc' }, { destCity: 'asc' }],
  });
  return routes.map((r) => ({
    id: r.id,
    originCity: r.originCity,
    destCity: r.destCity,
    authorized: r.authorized,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Autoriza o revoca una ruta troncal declarada por la empresa. */
export async function setOperatorRouteAuthorized(routeId: string, authorized: boolean): Promise<boolean> {
  const route = await prisma.operatorRoute.findUnique({ where: { id: routeId }, select: { id: true } });
  if (!route) return false;
  await prisma.operatorRoute.update({ where: { id: routeId }, data: { authorized } });
  return true;
}
