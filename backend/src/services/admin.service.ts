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
  rating: number;
  totalTrips: number;
  vehicle: string | null;
  lastSeenAt: string | null;
  createdAt: string;
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
      rating: d.rating,
      totalTrips: d.totalTrips,
      vehicle: v ? `${v.brand} ${v.model} · ${v.plate}` : null,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
    };
  });
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
