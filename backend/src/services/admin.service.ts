import { OperatorStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { docKillSwitchEnforced } from './document-expiry.service';

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
  // Kill-switch documental: CLEAR / EXPIRING / BLOCKED (+ motivo del bloqueo).
  complianceStatus: string;
  blockedReason: string | null;
  // Antecedentes (env-gated): UNCHECKED / PENDING / CLEAR / HIT.
  backgroundStatus: string;
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
      complianceStatus: d.complianceStatus,
      blockedReason: d.blockedReason,
      backgroundStatus: d.backgroundStatus,
    };
  });
}

// ─── Verificación de identidad de clientes (KYC pasajero) ─────────────────────

export interface AdminClientKycRow {
  id: string;
  name: string | null;
  phone: string;
  kycStatus: string;
  hasSelfie: boolean;
  selfieUrl: string | null;
  createdAt: string;
}

/** Clientes que iniciaron verificación (tienen selfie o estado no-PENDING). */
export async function listClientsForKyc(): Promise<AdminClientKycRow[]> {
  const users = await prisma.user.findMany({
    where: { OR: [{ selfieUrl: { not: null } }, { kycStatus: { not: 'PENDING' } }] },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    select: { id: true, name: true, phone: true, kycStatus: true, selfieUrl: true, createdAt: true },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    kycStatus: u.kycStatus,
    hasSelfie: !!u.selfieUrl,
    selfieUrl: u.selfieUrl,
    createdAt: u.createdAt.toISOString(),
  }));
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
  /** Kill-switch documental: CLEAR / EXPIRING / BLOCKED. */
  complianceStatus: string;
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
    complianceStatus: string;
    geo_age_s: number | null;
    distance_m: number | null;
  }>>`
    SELECT d."id", d."name", d."phone", d."status", d."isVerified", d."intercityEnabled",
           d."complianceStatus"::text AS "complianceStatus",
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
      complianceStatus: r.complianceStatus,
      // El filtro de cumplimiento solo aplica con DOC_KILL_SWITCH_ENFORCE=true.
      dispatchable:
        online && r.isVerified && fresh && inRadius &&
        !(docKillSwitchEnforced() && r.complianceStatus === 'BLOCKED'),
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

/**
 * Des-atasca a un conductor: cancela cualquier viaje activo suyo (liberando al
 * cliente, que así puede volver a pedir) y lo devuelve a ONLINE. Herramienta de
 * operación para cuando un viaje queda "colgado" (p. ej. la app se cerró a mitad
 * de camino y el conductor quedó ON_TRIP sin poder recibir ni completar).
 */
export async function releaseDriver(
  driverId: string,
): Promise<{ ok: boolean; cancelledTrips: number }> {
  const d = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
  if (!d) return { ok: false, cancelledTrips: 0 };

  const active = await prisma.trip.updateMany({
    where: {
      driverId,
      status: { in: ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'] },
    },
    data: { status: 'CANCELLED', cancelReason: 'Liberado por el administrador', completedAt: new Date() },
  });

  await prisma.driver.update({ where: { id: driverId }, data: { status: 'ONLINE' } });
  return { ok: true, cancelledTrips: active.count };
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
  /** Habilitación aprobada y vigente: lo que legalmente sostiene el intermunicipal. */
  habilitacionOk: boolean;
  createdAt: string;
}

export async function listOperatorsForAdmin(status?: OperatorStatus): Promise<AdminOperatorRow[]> {
  const ops = await prisma.operator.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      _count: { select: { vehicles: true, drivers: true } },
      documents: { select: { id: true, type: true, status: true, expiresAt: true } },
    },
  });
  const ahora = Date.now();
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
    pendingDocs: o.documents.filter((d) => d.status === 'PENDING').length,
    habilitacionOk: o.documents.some(
      (d) =>
        d.type === 'HABILITACION' &&
        d.status === 'APPROVED' &&
        (d.expiresAt == null || d.expiresAt.getTime() > ahora),
    ),
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

// ─── Negocios (comercios) ─────────────────────────────────────────────────────
// El registro de negocios es autoservicio y su portal es un enlace mágico. Sin
// esta vista el admin no tenía forma de ver quién se registró, ni de ayudar a
// un dueño que perdió su enlace, ni de dar de baja un negocio.

export interface AdminBusinessRow {
  id: string;
  name: string;
  ownerName: string | null;
  category: string;
  address: string;
  phone: string | null;
  isOpen: boolean;
  acceptingOrders: boolean;
  products: number;
  orders: number;
  portalPath: string;
  createdAt: string;
}

export async function listBusinessesForAdmin(query?: string): Promise<AdminBusinessRow[]> {
  const q = query?.trim();
  const rows = await prisma.business.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { ownerName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { address: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { _count: { select: { products: true, orders: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    ownerName: b.ownerName,
    category: String(b.category),
    address: b.address,
    phone: b.phone,
    isOpen: b.isOpen,
    acceptingOrders: b.acceptingOrders,
    products: b._count.products,
    orders: b._count.orders,
    // Ruta relativa: el panel la abre contra el portal configurado. Es lo que
    // el admin le reenvía al dueño que perdió su enlace.
    portalPath: `/negocio/${b.token}`,
    createdAt: b.createdAt.toISOString(),
  }));
}

/** Activa o desactiva la cuenta del negocio (isOpen = gate de acceso al portal). */
export async function setBusinessActive(id: string, active: boolean): Promise<void> {
  await prisma.business.update({ where: { id }, data: { isOpen: active } });
}

// ─── Documentos de habilitación de empresas ───────────────────────────────────
// El backend ya recibía los documentos (POST /operator/documents), pero nadie
// podía revisarlos: el admin verificaba la empresa a ciegas. Para el
// intermunicipal eso es justo el requisito legal que el modelo asume.

export interface AdminOperatorDocRow {
  id: string;
  type: string;
  fileUrl: string;
  status: string;
  expiresAt: string | null;
  rejectionReason: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  /** true si tiene vencimiento y ya pasó: aprobado pero inservible. */
  expired: boolean;
}

export async function listOperatorDocumentsForAdmin(
  operatorId: string,
): Promise<AdminOperatorDocRow[]> {
  const docs = await prisma.operatorDocument.findMany({
    where: { operatorId },
    orderBy: { uploadedAt: 'desc' },
  });
  const ahora = Date.now();
  return docs.map((d) => ({
    id: d.id,
    type: String(d.type),
    fileUrl: d.fileUrl,
    status: String(d.status),
    expiresAt: d.expiresAt?.toISOString() ?? null,
    rejectionReason: d.rejectionReason,
    uploadedAt: d.uploadedAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    expired: d.expiresAt != null && d.expiresAt.getTime() < ahora,
  }));
}

/** Aprueba o rechaza un documento. Al rechazar, el motivo llega a la empresa. */
export async function reviewOperatorDocument(
  docId: string,
  approved: boolean,
  rejectionReason?: string,
  reviewedBy?: string,
): Promise<boolean> {
  const res = await prisma.operatorDocument.updateMany({
    where: { id: docId },
    data: {
      status: approved ? 'APPROVED' : 'REJECTED',
      rejectionReason: approved ? null : (rejectionReason ?? 'Documento ilegible o incorrecto'),
      reviewedBy: reviewedBy ?? null,
      reviewedAt: new Date(),
    },
  });
  return res.count > 0;
}

/**
 * ¿La empresa tiene su habilitación aprobada y vigente?
 *
 * No bloquea la verificación —el admin puede haber visto los papeles en
 * físico— pero el panel lo advierte antes de aprobar, que es la diferencia
 * entre decidir con información y decidir a ciegas.
 */
export async function hasApprovedHabilitacion(operatorId: string): Promise<boolean> {
  const doc = await prisma.operatorDocument.findFirst({
    where: {
      operatorId,
      type: 'HABILITACION',
      status: 'APPROVED',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return doc != null;
}
