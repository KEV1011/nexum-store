import { OperatorStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { docKillSwitchEnforced } from './document-expiry.service';
import { estadoPiloto } from './kyc.service';
import { contarDespachoAtascado, contarViajesColgados } from './dispatch-recovery.service';
import {
  serieDeDias,
  emparejamiento,
  retencion,
  type Emparejamiento,
  type Retencion,
} from '../lib/metricas-negocio';
import { saneaTasa } from '../lib/comision';
import { cancelOrderByAdmin } from './client.service';
import { cancelErrandByAdmin } from './errand.service';

// ─────────────────────────────────────────────────────────────────────────────
// Admin service — métricas operativas y listados para el panel /admin.
// Solo lecturas agregadas; las acciones (aprobar documentos, crear promos)
// viven en sus servicios propios.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminMetrics {
  /**
   * Plaza sobre la que están calculadas, o null = toda la plataforma.
   *
   * Lo que no se puede atribuir a una ciudad viaja en `null`, nunca en cero: un
   * cero afirma que ahí no pasó nada, y lo cierto es que ese dato todavía no
   * sabe de plazas.
   */
  ciudad: string | null;
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
    /** null al filtrar por plaza: un pago no siempre cuelga de un viaje. */
    paymentsApprovedToday: number | null;
  };
  drivers: {
    total: number;
    verified: number;
    onlineNow: number;
    pendingDocuments: number;
    /**
     * Conductores conectados AHORA sin verificar. Fuera del piloto es siempre 0
     * (el matching los excluye); con el piloto encendido es el número exacto de
     * personas transportando pasajeros sin que nadie revisara sus papeles —
     * el dato que convierte "el interruptor está en true" en una decisión.
     */
    unverifiedOperatingNow: number;
  };
  /**
   * Servicios que llevan demasiado tiempo pidiendo conductor sin encontrarlo.
   * Lo normal es 0: el despacho insiste diez minutos y luego avisa. Un número
   * aquí significa que alguien está esperando y nadie se ha enterado.
   */
  stuck: {
    total: number;
    viaje: number;
    /** null al filtrar por plaza: estos tres no llevan ciudad sellada. */
    mandado: number | null;
    pedido: number | null;
    intermunicipal: number | null;
    desdeMin: number;
  };
  /**
   * Viajes que se quedaron EN CURSO sin noticias del conductor.
   *
   * Es distinto de `stuck`: allí nadie ha aceptado todavía; aquí sí hay
   * conductor y el servicio arrancó, pero su cierre nunca llegó. El barrido ya
   * liberó al conductor para que pueda seguir trabajando; el viaje en sí lo
   * resuelve un humano, porque darlo por terminado paga una tarifa y darlo por
   * cancelado niega un servicio que a lo mejor sí se prestó.
   */
  orphaned: {
    total: number;
    desdeMin: number;
  };
  /** Estado del piloto sin verificación, para el aviso del panel. */
  pilot: {
    active: boolean;
    expired: boolean;
    until: string | null;
    daysLeft: number | null;
  };
  users: {
    total: number;
    newToday: number;
    /**
     * true cuando se filtró por plaza: entonces no son «los registrados» sino
     * «los que han pedido aquí», que es otra cosa y el panel lo dice.
     */
    porViajes: boolean;
  };
  safety: {
    /** null al filtrar por plaza: el SOS guarda coordenadas, no ciudad. */
    sosLast24h: number | null;
  };
}

function _startOfToday(): Date {
  // Colombia es UTC-5 sin DST: el "día operativo" se corta a medianoche local.
  const now = new Date();
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  bogota.setUTCHours(0, 0, 0, 0);
  return new Date(bogota.getTime() + 5 * 60 * 60 * 1000);
}

/**
 * Métricas de operación, opcionalmente de UNA plaza.
 *
 * Con `ciudad`, todo lo que lleva plaza sellada (viajes y conductores) se
 * filtra por ella; lo que no se puede atribuir a una ciudad se devuelve en
 * `null` para que el panel escriba «—» en vez de un cero que mentiría.
 */
export async function getAdminMetrics(ciudad?: string | null): Promise<AdminMetrics> {
  const today = _startOfToday();
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const plaza = ciudad ?? null;
  const deViaje = plaza ? { citySlug: plaza } : {};
  // Un conductor «de la plaza» es aquel cuyo último latido cayó ahí. No es su
  // domicilio: es dónde está trabajando hoy, que es lo que importa para saber
  // si esta ciudad tiene oferta suficiente.
  const deConductor = plaza ? { citySlug: plaza } : {};

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
    unverifiedOperatingNow,
  ] = await Promise.all([
    prisma.trip.count({ where: { createdAt: { gte: today }, ...deViaje } }),
    prisma.trip.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: today }, ...deViaje },
      _count: { _all: true },
      _sum: { finalFare: true, commission: true },
    }),
    prisma.trip.count({ where: { status: 'CANCELLED', updatedAt: { gte: today }, ...deViaje } }),
    prisma.trip.count({ where: { status: 'COMPLETED', completedAt: { gte: last7d }, ...deViaje } }),
    prisma.trip.count({
      where: {
        status: { in: ['ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'] },
        ...deViaje,
      },
    }),
    // Un pago puede no colgar de ningún viaje (un pedido, por ejemplo), así que
    // filtrarlo por plaza dejaría fuera una parte sin decirlo. Se omite.
    plaza
      ? Promise.resolve(null)
      : prisma.payment.aggregate({
          where: { status: 'approved', updatedAt: { gte: today } },
          _sum: { amount: true },
        }),
    prisma.driver.count({ where: deConductor }),
    prisma.driver.count({ where: { isVerified: true, ...deConductor } }),
    prisma.driver.count({ where: { status: 'ONLINE', ...deConductor } }),
    prisma.driverDocument.count({
      where: { status: 'PENDING', ...(plaza ? { driver: { citySlug: plaza } } : {}) },
    }),
    // Con plaza, «usuarios» pasa a ser «pasajeros que han pedido aquí»: una
    // persona no vive en una ciudad para la plataforma, sus viajes sí.
    plaza
      ? prisma.user.count({ where: { trips: { some: { citySlug: plaza } } } })
      : prisma.user.count(),
    plaza
      ? prisma.user.count({
          where: { createdAt: { gte: today }, trips: { some: { citySlug: plaza } } },
        })
      : prisma.user.count({ where: { createdAt: { gte: today } } }),
    // El SOS guarda coordenadas, no plaza: no se puede filtrar sin inventarse
    // el criterio, así que con ciudad se devuelve «no se sabe».
    plaza
      ? Promise.resolve(null)
      : prisma.emergencyEvent.count({ where: { createdAt: { gte: last24h } } }),
    prisma.driver.count({
      where: { isVerified: false, status: { in: ['ONLINE', 'ON_TRIP'] }, ...deConductor },
    }),
  ]);

  const piloto = estadoPiloto();
  const atascado = await contarDespachoAtascado(plaza);
  // Viajes que se quedaron en curso sin noticias del conductor: el rastro de un
  // cierre que se perdió. El barrido ya liberó al conductor; el viaje lo
  // resuelve un humano con `releaseDriver`, porque cerrarlo paga y cancelarlo
  // niega un servicio que quizá sí se prestó.
  const colgados = await contarViajesColgados(plaza);

  return {
    ciudad: plaza,
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
      paymentsApprovedToday: paymentsToday ? Math.round(paymentsToday._sum.amount ?? 0) : null,
    },
    drivers: {
      total: driversTotal,
      verified: driversVerified,
      onlineNow: driversOnline,
      pendingDocuments: pendingDocs,
      unverifiedOperatingNow,
    },
    users: { total: usersTotal, newToday: usersToday, porViajes: plaza !== null },
    safety: { sosLast24h },
    stuck: atascado,
    orphaned: colgados,
    pilot: {
      active: piloto.activo,
      expired: piloto.vencido,
      until: piloto.hasta,
      daysLeft: piloto.diasRestantes,
    },
  };
}

// ─── Métricas de NEGOCIO ──────────────────────────────────────────────────────
//
// Las de arriba son de operación: sirven para vigilar el día. Éstas son otra
// cosa — son con las que se decide si el negocio existe. Van en su propia
// consulta y su propia ruta porque son más pesadas (series y cohortes) y no
// deben retrasar los números que el administrador mira de un vistazo.

/** Desfase horario de Colombia, sin horario de verano. Mismo criterio que `_startOfToday`. */
const HORAS_UTC_COLOMBIA = -5;

export interface MetricasNegocio {
  desde: string;
  hasta: string;
  /** Viajes solicitados y completados por día, con los días vacíos en cero. */
  serie: Array<{ dia: string; solicitados: number; completados: number }>;
  /** Salud del despacho en el período: cuánto de lo pedido encontró conductor. */
  emparejamiento: Emparejamiento;
  /** ¿Vuelven los pasajeros? Semana pasada contra ésta. */
  retencion: Retencion;
  /** Pasajeros distintos que pidieron algo en el período. */
  pasajerosActivos: number;
}

/**
 * Las tres cifras del piloto, para un rango de días hacia atrás.
 *
 * El corte del día es la medianoche de Colombia, igual que el resto del panel:
 * un viaje de las 11 de la noche pertenece a ese día y no al siguiente.
 */
export async function getMetricasNegocio(
  dias = 30,
  ciudad?: string | null,
): Promise<MetricasNegocio> {
  const rango = Math.min(Math.max(Math.trunc(dias) || 30, 1), 90);
  const finMs = Date.now();
  const desdeMs = finMs - (rango - 1) * 24 * 60 * 60 * 1000;
  const desdeCorte = new Date(desdeMs);
  desdeCorte.setUTCHours(0, 0, 0, 0);
  // La medianoche local es la medianoche UTC desplazada.
  const desde = new Date(desdeCorte.getTime() - HORAS_UTC_COLOMBIA * 60 * 60 * 1000);

  const diaLocal = (d: Date): string =>
    new Date(d.getTime() + HORAS_UTC_COLOMBIA * 60 * 60 * 1000).toISOString().slice(0, 10);

  const semana = 7 * 24 * 60 * 60 * 1000;
  const iniSemanaActual = new Date(finMs - semana);
  const iniSemanaPrevia = new Date(finMs - 2 * semana);

  // Todas las cifras del piloto son de viajes, y el viaje lleva su plaza
  // sellada: aquí el filtro por ciudad es exacto, sin huecos que explicar.
  const plaza = ciudad ?? null;
  const deViaje = plaza ? { citySlug: plaza } : {};
  const sqlPlaza = plaza ? Prisma.sql` AND "citySlug" = ${plaza}` : Prisma.empty;

  const [creados, completados, conConductor, sinConductor, activos, cohorte] =
    await Promise.all([
      prisma.trip.findMany({
        where: { createdAt: { gte: desde }, ...deViaje },
        select: { createdAt: true },
      }),
      prisma.trip.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: desde }, ...deViaje },
        select: { completedAt: true },
      }),
      prisma.trip.count({ where: { createdAt: { gte: desde }, driverId: { not: null }, ...deViaje } }),
      prisma.trip.count({
        where: { createdAt: { gte: desde }, cancelReason: 'NO_DRIVERS_AVAILABLE', ...deViaje },
      }),
      prisma.trip.groupBy({
        by: ['passengerId'],
        where: { createdAt: { gte: desde }, passengerId: { not: null }, ...deViaje },
      }),
      // Retención: de quienes pidieron la semana PASADA, cuántos volvieron esta.
      // Una sola consulta con auto-unión — con `in` sobre la cohorte, una base
      // de usuarios grande generaría una lista enorme en el SQL.
      prisma.$queryRaw<Array<{ base: bigint; volvieron: bigint }>>`
        SELECT COUNT(DISTINCT prev."passengerId")::bigint AS base,
               COUNT(DISTINCT cur."passengerId")::bigint AS volvieron
        FROM (
          SELECT DISTINCT "passengerId" FROM "trips"
          WHERE "passengerId" IS NOT NULL
            AND "createdAt" >= ${iniSemanaPrevia} AND "createdAt" < ${iniSemanaActual}${sqlPlaza}
        ) prev
        LEFT JOIN (
          SELECT DISTINCT "passengerId" FROM "trips"
          WHERE "passengerId" IS NOT NULL AND "createdAt" >= ${iniSemanaActual}${sqlPlaza}
        ) cur ON cur."passengerId" = prev."passengerId"`,
    ]);

  const porDiaSolicitados = new Map<string, number>();
  for (const t of creados) {
    const d = diaLocal(t.createdAt);
    porDiaSolicitados.set(d, (porDiaSolicitados.get(d) ?? 0) + 1);
  }
  const porDiaCompletados = new Map<string, number>();
  for (const t of completados) {
    if (!t.completedAt) continue;
    const d = diaLocal(t.completedAt);
    porDiaCompletados.set(d, (porDiaCompletados.get(d) ?? 0) + 1);
  }

  const desdeDia = diaLocal(desde);
  const hastaDia = diaLocal(new Date(finMs));
  const serieSolicitados = serieDeDias(desdeDia, hastaDia, porDiaSolicitados);
  const serieCompletados = serieDeDias(desdeDia, hastaDia, porDiaCompletados);

  const fila = cohorte[0];
  return {
    desde: desdeDia,
    hasta: hastaDia,
    serie: serieSolicitados.map((s, i) => ({
      dia: s.dia,
      solicitados: s.valor,
      completados: serieCompletados[i]?.valor ?? 0,
    })),
    emparejamiento: emparejamiento(creados.length, conConductor, sinConductor),
    retencion: retencion(Number(fila?.base ?? 0), Number(fila?.volvieron ?? 0)),
    pasajerosActivos: activos.length,
  };
}

/**
 * Fija (o quita) la comisión negociada con una flota.
 *
 * Solo afecta a lo que se liquide DESPUÉS: los servicios ya cerrados guardan su
 * comisión y su neto, y no se recalculan. Renegociar no puede reescribir lo que
 * ya se le pagó a un conductor.
 */
export async function setOperatorCommission(
  id: string,
  valor: unknown,
): Promise<number | null> {
  const tasa = saneaTasa(valor);
  const op = await prisma.operator.findUnique({ where: { id }, select: { id: true } });
  if (!op) throw new Error('Empresa no encontrada');
  await prisma.operator.update({ where: { id }, data: { commissionRate: tasa } });
  return tasa;
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
  /** Plaza donde se le vio por última vez, o null si nunca dio un latido. */
  citySlug: string | null;
}

export async function listDriversForAdmin(ciudad?: string | null): Promise<AdminDriverRow[]> {
  const drivers = await prisma.driver.findMany({
    // Con plaza: los que dieron su último latido ahí. Un conductor que aún no
    // se ha conectado nunca no tiene plaza y por eso no sale — decir que está
    // en una ciudad sin que lo hayamos visto ahí sería inventarlo.
    ...(ciudad ? { where: { citySlug: ciudad } } : {}),
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
      citySlug: d.citySlug,
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
export interface ResumenLiberacion {
  ok: boolean;
  /** Se mantiene por compatibilidad con quien ya leía este campo. */
  cancelledTrips: number;
  cancelados: { viajes: number; mandados: number; pedidos: number; intercity: number; fletes: number };
}

/**
 * Des-atasca a un conductor: cancela TODO lo que lleva encima y lo devuelve a
 * ONLINE.
 *
 * Antes solo cancelaba `Trip`. Un conductor con un mandado y dos pedidos —el
 * caso que se vio en producción, con el conductor sin señal 23 horas— quedaba
 * "liberado" en ONLINE mientras sus tres servicios seguían abiertos para
 * siempre: el cliente viendo "en camino", el negocio creyendo que el pedido iba
 * de salida, y la alerta de conductor desaparecido repitiéndose cada minuto sin
 * que nada la cerrara. El botón decía que desatascaba y desatascaba un quinto.
 *
 * Pedidos y mandados se cierran por `cancelOrderByAdmin`/`cancelErrandByAdmin`,
 * que avisan al cliente, al negocio y al conductor y cortan los temporizadores
 * de búsqueda. No sirve el camino del cliente: ése se niega en cuanto el
 * servicio avanzó (no puedes cancelar un mandado ya comprado), que es correcto
 * para el cliente y justo lo contrario de lo que necesita el admin — el
 * servicio está muerto PORQUE nadie va a entregarlo.
 */
export async function releaseDriver(driverId: string): Promise<ResumenLiberacion> {
  const vacio = { viajes: 0, mandados: 0, pedidos: 0, intercity: 0, fletes: 0 };
  const d = await prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
  if (!d) return { ok: false, cancelledTrips: 0, cancelados: vacio };

  const motivo = 'Liberado por el administrador';

  const viajes = await prisma.trip.updateMany({
    where: { driverId, status: { in: ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'] } },
    data: { status: 'CANCELLED', cancelReason: motivo, completedAt: new Date() },
  });

  // Pedidos y mandados: por el camino del cliente (stock, avisos, timers).
  const pedidos = await prisma.order.findMany({
    where: {
      driverId,
      status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'DRIVER_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT'] },
    },
    select: { id: true },
  });
  let pedidosCancelados = 0;
  for (const o of pedidos) {
    if (await cancelOrderByAdmin(o.id).catch(() => false)) pedidosCancelados++;
  }

  const mandados = await prisma.errand.findMany({
    where: { driverId, status: { in: ['SEARCHING', 'ACCEPTED', 'SHOPPING', 'ON_THE_WAY'] } },
    select: { id: true },
  });
  let mandadosCancelados = 0;
  for (const e of mandados) {
    if (await cancelErrandByAdmin(e.id).catch(() => false)) mandadosCancelados++;
  }

  const intercity = await prisma.intercityBooking.updateMany({
    where: { driverId, status: { in: ['DRIVER_FOUND', 'CONFIRMED', 'IN_PROGRESS'] } },
    data: { status: 'CANCELLED' },
  });

  // El flete vuelve al tablero en vez de morir: la carga sigue existiendo y otra
  // flota puede tomarla. Cancelarlo obligaría al cliente a publicarlo otra vez
  // sin que nadie se lo haya dicho.
  const fletes = await prisma.freightRequest.updateMany({
    where: { driverId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
    data: { status: 'REQUESTED', driverId: null, vehicleId: null },
  });

  // Al final: cancelar pedidos y mandados ya lo deja ONLINE, pero un viaje o un
  // flete no, y hay que dejarlo utilizable en cualquier caso.
  await prisma.driver.update({ where: { id: driverId }, data: { status: 'ONLINE' } });

  const cancelados = {
    viajes: viajes.count,
    mandados: mandadosCancelados,
    pedidos: pedidosCancelados,
    intercity: intercity.count,
    fletes: fletes.count,
  };
  const total = Object.values(cancelados).reduce((a, b) => a + b, 0);
  console.log(`[Admin] Conductor ${driverId} liberado · ${total} servicio(s):`, cancelados);
  return { ok: true, cancelledTrips: viajes.count, cancelados };
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
  /** Comisión negociada con esta flota (0–1), o null si paga la de su ciudad. */
  commissionRate: number | null;
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
    commissionRate: o.commissionRate,
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
