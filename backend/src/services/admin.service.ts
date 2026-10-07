import { OperatorStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { maskPhone } from './safe-contact.service';
import { docKillSwitchEnforced } from './document-expiry.service';
import { estadoPiloto, kycEnforced } from './kyc.service';
import { contarDespachoAtascado, contarViajesColgados } from './dispatch-recovery.service';
import {
  MOTIVO_ATASCADO, avisoDeCancelacion, minParaAtascado, type TipoAtascado,
} from '../lib/servicio-atascado';
import { ESTADOS_DESPACHABLES } from '../lib/estado-pedido';
import { sendPushToClient } from './push.service';
import { cancelClientOrder, cancelClientTrip } from './client.service';
import { cancelClientErrand } from './errand.service';
import { cancelIntercityBooking } from './intercity.service';
import {
  serieDeDias,
  emparejamiento,
  retencion,
  type Emparejamiento,
  type Retencion,
} from '../lib/metricas-negocio';
import { armarMetricasReservas, type MetricasReservas } from '../lib/metricas-reservas';
import { saneaTasa } from '../lib/comision';
import { motivoParaNoConectar } from './driver-online-guard';
import { cancelOrderByAdmin } from './client.service';
import { cancelErrandByAdmin } from './errand.service';
import { HORAS_UTC_COLOMBIA } from '../lib/horario-tienda';

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

// El desfase de Colombia se importa de `lib/horario-tienda`, que es donde vive
// desde que lo necesitó el horario de los comercios. Tenerlo escrito dos veces
// no es un riesgo de que cambie —Colombia no tiene horario de verano— sino de
// que dos tableros acaben cortando el día en momentos distintos al tocar uno
// solo de los dos.

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
  rating: number | null;
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
  /**
   * Por qué NO puede conectarse, o null si puede. Es la pregunta que el admin
   * se hace de verdad: «isVerified true + KYC PENDING» obliga a cruzar dos
   * columnas mentalmente, y con los gates encendidos eso es justo lo que
   * decide si esa persona trabaja hoy.
   */
  motivoBloqueo: string | null;
  // Antecedentes (env-gated): UNCHECKED / PENDING / CLEAR / HIT.
  backgroundStatus: string;
  /** Plaza donde se le vio por última vez, o null si nunca dio un latido. */
  citySlug: string | null;
  /**
   * Reservas que apartó y NO cumplió, y por qué.
   *
   * Es la cifra que antes no existía: el barrido que libera la reserva borraba
   * el `driverId`, así que un conductor podía apartar seis, faltar a las seis y
   * amanecer con los seis cupos limpios sin que nadie pudiera saber que fue él.
   *
   * **No bloquea nada por su cuenta** — mismo criterio que los antecedentes:
   * marca para que un humano decida si le baja el tope o lo suspende. Un
   * automático aquí castigaría al que se le dañó el carro igual que al que
   * nunca pensó ir.
   */
  noShows: number;
  /** Cuántos de esos fueron por no aparecer (el resto, papeles vencidos). */
  noShowsSinSenal: number;
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
  const filas: AdminDriverRow[] = drivers.map((d) => {
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
      motivoBloqueo: null, // se rellena justo debajo
      citySlug: d.citySlug,
      noShows: 0, // se rellena justo debajo
      noShowsSinSenal: 0,
    };
  });

  // Los incumplimientos, en DOS consultas agrupadas para toda la tabla en vez
  // de una por conductor. Se cuentan las filas, no un contador guardado: un
  // contador y unas filas acaban discrepando y nadie sabe cuál miente.
  if (filas.length > 0) {
    const ids = filas.map((f) => f.id);
    const [todos, sinSenal] = await Promise.all([
      prisma.trip.groupBy({
        by: ['noShowDriverId'],
        where: { noShowDriverId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.trip.groupBy({
        by: ['noShowDriverId'],
        where: { noShowDriverId: { in: ids }, noShowReason: 'sin_senal' },
        _count: { _all: true },
      }),
    ]);
    const porId = new Map(todos.map((r) => [r.noShowDriverId, r._count._all]));
    const porIdSinSenal = new Map(sinSenal.map((r) => [r.noShowDriverId, r._count._all]));
    for (const f of filas) {
      f.noShows = porId.get(f.id) ?? 0;
      f.noShowsSinSenal = porIdSinSenal.get(f.id) ?? 0;
    }
  }

  // El motivo, uno a uno. Son consultas por conductor, así que solo se hacen
  // cuando hay algún gate encendido: con los dos apagados nadie está bloqueado
  // y sería gastar N consultas para escribir N nulos.
  if (kycEnforced() || docKillSwitchEnforced()) {
    await Promise.all(
      filas.map(async (f) => {
        f.motivoBloqueo = (await motivoParaNoConectar(f.id))?.error ?? null;
      }),
    );
  }
  return filas;
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
  /** `false` = ficha abierta por nosotros desde una foto de su carta. */
  claimed: boolean;
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
    // Si el local es nuestro cliente o si la ficha la abrimos nosotros desde
    // una foto de su carta. El admin tiene que distinguirlas: en las no
    // reclamadas los pedidos salen como mandados de compra, no al portal.
    claimed: b.claimed,
    createdAt: b.createdAt.toISOString(),
  }));
}

/**
 * Abre la ficha de un comercio con el que todavía no se ha hablado.
 *
 * Nace `claimed: false`, que es lo que hace que sus precios se enseñen como
 * referencia y que sus pedidos salgan como mandados de compra. Devuelve el
 * token del portal: con él se le carga la carta desde una foto en
 * `/negocio/<token>/catalogo`, y es el mismo enlace que se le entrega el día
 * que el dueño diga que sí.
 *
 * La geocodificación es best-effort: sin punto, el despacho del mandado se
 * ancla al centro de la plaza, que es peor pero no bloquea nada.
 */
export async function abrirFichaDeComercio(dto: {
  name: string;
  address: string;
  category: string;
  phone?: string;
  city?: string;
}): Promise<{ id: string; token: string; portalPath: string }> {
  const nombre = dto.name?.trim();
  const direccion = dto.address?.trim();
  if (!nombre || nombre.length < 2) throw new Error('Falta el nombre del comercio.');
  if (!direccion) throw new Error('Falta la dirección: sin ella nadie puede ir a comprar.');

  const { categoriaDesdeEspanol } = await import('./business.service');
  const categoria = categoriaDesdeEspanol(dto.category);
  if (!categoria) throw new Error(`Categoría desconocida: ${dto.category}`);

  const { geocodeAddress } = await import('./geo.service');
  const punto = await geocodeAddress(direccion, dto.city).catch(() => null);

  const { plazaDeCoordenadas } = await import('./municipality.service');
  const plaza = punto ? await plazaDeCoordenadas(punto.lat, punto.lng) : null;

  const b = await prisma.business.create({
    data: {
      name: nombre,
      address: direccion,
      category: categoria,
      ...(dto.phone?.trim() ? { phone: dto.phone.trim() } : {}),
      ...(punto ? { lat: punto.lat, lng: punto.lng } : {}),
      ...(plaza ? { citySlug: plaza } : {}),
      claimed: false,
      // No se le promete ningún tiempo de entrega: lo dice el repartidor
      // cuando llega al local y ve la fila (`declararEtaDeMandado`).
      acceptingOrders: true,
    },
    select: { id: true, token: true },
  });
  return { id: b.id, token: b.token, portalPath: `/negocio/${b.token}` };
}

/**
 * El dueño se queda con la ficha: a partir de aquí es su local.
 *
 * Sus precios pasan a ser firmes y sus pedidos van a su portal, que es
 * exactamente el momento que esta estrategia persigue. No se toca su
 * catálogo: lo que cargamos de su carta es su punto de partida.
 */
export async function entregarFichaAlDueno(id: string): Promise<void> {
  await prisma.business.update({
    where: { id },
    data: { claimed: true, claimedAt: new Date() },
  });
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

/**
 * Archivos que apuntan al disco EFÍMERO de Render, no a R2.
 *
 * Todo lo que se subió antes de configurar S3/R2 quedó con una URL
 * `/uploads/...` y el fichero vivía en el disco del contenedor: cada redeploy
 * lo borra. Las filas siguen ahí, así que el enlace existe y da 404 — el admin
 * hace clic, no ve nada, y concluye que el sistema está roto.
 *
 * Contarlos es la diferencia entre «esto no funciona» y «estos 12 documentos
 * hay que volver a pedirlos».
 */
export async function contarArchivosHuerfanos(): Promise<{
  total: number;
  detalle: string;
}> {
  const local = { startsWith: '/uploads/' };
  const [docs, avatarsCond, selfies, avatarsCli, pruebas] = await Promise.all([
    prisma.driverDocument.count({ where: { fileUrl: local } }),
    prisma.driver.count({ where: { avatarUrl: local } }),
    prisma.driver.count({ where: { selfieUrl: local } }),
    prisma.user.count({ where: { avatarUrl: local } }),
    prisma.trip.count({
      where: { OR: [{ pickupPhotoUrl: local }, { deliveryPhotoUrl: local }] },
    }),
  ]);

  const partes: string[] = [];
  if (docs) partes.push(`${docs} documento(s) de conductor`);
  if (avatarsCond) partes.push(`${avatarsCond} foto(s) de perfil de conductor`);
  if (selfies) partes.push(`${selfies} selfie(s) de verificación`);
  if (avatarsCli) partes.push(`${avatarsCli} foto(s) de perfil de cliente`);
  if (pruebas) partes.push(`${pruebas} prueba(s) de entrega`);

  const total = docs + avatarsCond + selfies + avatarsCli + pruebas;
  return {
    total,
    detalle: total === 0
      ? 'Ningún archivo apunta al disco efímero.'
      : `${partes.join(', ')}. Subidos antes de configurar R2: el enlace existe pero el archivo ya no. `
        + 'Hay que volver a pedirlos.',
  };
}

// ─── Cifras del tablero de reservas ───────────────────────────────────────────
//
// `admin.service` no mencionaba `SCHEDULED` en ninguna parte: no se sabía
// cuántas reservas se piden, cuántas se apartan ni cuántas se caen. Para una
// empresa de taxis esa es la cifra que decide si la función sirve, y hay que
// verla antes de que un pasajero se quede tirado a las seis de la mañana.

/**
 * Las cifras del tablero de reservas de los últimos `dias`.
 *
 * `ciudad` filtra por la plaza SELLADA en el viaje, con el mismo criterio que
 * el resto del panel: un viaje sin plaza resuelta no pertenece a ninguna
 * ciudad y por eso no se cuenta en ninguna — contarlo en todas inflaría cada
 * número.
 */
export async function getMetricasReservas(
  dias: number,
  ciudad?: string | null,
): Promise<MetricasReservas> {
  const ventana = Math.max(1, Math.min(180, Math.round(dias || 30)));
  const desde = new Date(Date.now() - ventana * 24 * 60 * 60 * 1000);
  const base = {
    scheduledFor: { not: null },
    createdAt: { gte: desde },
    ...(ciudad ? { citySlug: ciudad } : {}),
  } as const;

  const [creadas, canceladas, cumplidas, sinSenal, documentos, apartadasFilas] =
    await Promise.all([
      prisma.trip.count({ where: base }),
      prisma.trip.count({ where: { ...base, status: 'CANCELLED' } }),
      prisma.trip.count({ where: { ...base, status: 'COMPLETED' } }),
      prisma.trip.count({ where: { ...base, noShowReason: 'sin_senal' } }),
      prisma.trip.count({ where: { ...base, noShowReason: 'documentos' } }),
      // «Apartada» es toda la que en algún momento tuvo conductor: la que lo
      // tiene ahora, y la que lo tuvo y se le quitó. Mirar solo `driverId`
      // dejaría fuera justo las que se cayeron, que es lo que se quiere medir.
      prisma.trip.findMany({
        where: {
          ...base,
          OR: [{ driverId: { not: null } }, { noShowDriverId: { not: null } }],
        },
        select: { createdAt: true, acceptedAt: true, noShowAt: true },
        take: 5000,
      }),
    ]);

  // Cuánto tardó en apartarse cada una. `acceptedAt` lo sella el barrido al
  // activarla, así que para las que todavía no han llegado a su hora se usa el
  // momento en que se le quitó al conductor cuando lo hubo. Sin ninguna de las
  // dos marcas no se estima nada: un tiempo inventado aquí es peor que un hueco.
  const minutosHastaApartar: number[] = [];
  for (const t of apartadasFilas) {
    const marca = t.acceptedAt ?? t.noShowAt;
    if (!marca) continue;
    const min = (marca.getTime() - t.createdAt.getTime()) / 60_000;
    if (min >= 0) minutosHastaApartar.push(min);
  }

  return armarMetricasReservas({
    creadas,
    apartadas: apartadasFilas.length,
    cumplidas,
    incumplidasSinSenal: sinSenal,
    incumplidasDocumentos: documentos,
    canceladas,
    minutosHastaApartar,
  });
}

// ─── Servicios colgados sin conductor ────────────────────────────────────────

export interface ServicioAtascado {
  tipo: TipoAtascado;
  id: string;
  ref: string;
  /** Quién lo está esperando. */
  cliente: string;
  telefono: string;
  minutos: number;
  detalle: string;
}

/**
 * Los servicios que llevan demasiado tiempo esperando conductor.
 *
 * El panel ya los CONTABA; esto los enumera para poder actuar sobre uno
 * concreto. El conteo y esta lista comparten el umbral (`minParaAtascado`),
 * que es lo que impide que el aviso diga «hay 3» y la lista traiga otra cosa.
 */
export async function listarServiciosAtascados(): Promise<ServicioAtascado[]> {
  const corte = new Date(Date.now() - minParaAtascado() * 60_000);
  const desde = (d: Date): number => Math.round((Date.now() - d.getTime()) / 60_000);

  const [viajes, mandados, pedidos, intercity] = await Promise.all([
    // `Trip.passengerId` no tiene relación declarada en el esquema, así que el
    // pasajero se busca aparte y en lote.
    prisma.trip.findMany({
      where: { status: 'SEARCHING', driverId: null, createdAt: { lt: corte } },
      select: {
        id: true, createdAt: true, originAddress: true, destAddress: true,
        passengerId: true,
      },
      orderBy: { createdAt: 'asc' }, take: 50,
    }),
    prisma.errand.findMany({
      where: { status: 'SEARCHING', driverId: null, createdAt: { lt: corte } },
      select: {
        id: true, createdAt: true, requestRef: true, description: true,
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' }, take: 50,
    }),
    prisma.order.findMany({
      where: { status: { in: ESTADOS_DESPACHABLES }, driverId: null, createdAt: { lt: corte } },
      select: {
        id: true, createdAt: true, orderRef: true, deliveryAddress: true,
        business: { select: { name: true } },
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' }, take: 50,
    }),
    prisma.intercityBooking.findMany({
      where: { status: 'SEARCHING', driverId: null, createdAt: { lt: corte } },
      select: {
        id: true, createdAt: true, origin: true, destination: true,
        user: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' }, take: 50,
    }),
  ]);

  const sinNombre = 'Pasajero';
  const idsPasajeros = viajes.map((t) => t.passengerId).filter((v): v is string => !!v);
  const pasajeros = idsPasajeros.length
    ? await prisma.user.findMany({
        where: { id: { in: idsPasajeros } },
        select: { id: true, name: true, phone: true },
      })
    : [];
  const porId = new Map(pasajeros.map((u) => [u.id, u]));

  const filas: ServicioAtascado[] = [
    ...viajes.map((t) => ({
      tipo: 'viaje' as const, id: t.id, ref: t.id.slice(-6).toUpperCase(),
      cliente: porId.get(t.passengerId ?? '')?.name ?? sinNombre,
      telefono: porId.get(t.passengerId ?? '')?.phone ?? '',
      minutos: desde(t.createdAt),
      detalle: `${t.originAddress} → ${t.destAddress}`,
    })),
    ...mandados.map((e) => ({
      tipo: 'mandado' as const, id: e.id, ref: e.requestRef,
      cliente: e.user?.name ?? sinNombre, telefono: e.user?.phone ?? '',
      minutos: desde(e.createdAt), detalle: e.description,
    })),
    ...pedidos.map((o) => ({
      tipo: 'pedido' as const, id: o.id, ref: o.orderRef,
      cliente: o.user?.name ?? sinNombre, telefono: o.user?.phone ?? '',
      minutos: desde(o.createdAt),
      detalle: `${o.business?.name ?? 'Negocio'} → ${o.deliveryAddress}`,
    })),
    ...intercity.map((b) => ({
      tipo: 'intermunicipal' as const, id: b.id, ref: b.id.slice(-6).toUpperCase(),
      cliente: b.user?.name ?? sinNombre, telefono: b.user?.phone ?? '',
      minutos: desde(b.createdAt), detalle: `${b.origin} → ${b.destination}`,
    })),
  ];
  // El que lleva más esperando, primero: es a quien hay que atender antes.
  return filas.sort((a, b) => b.minutos - a.minutos);
}

/**
 * Cancela un servicio colgado y libera a quien lo esperaba.
 *
 * REUTILIZA EL CAMINO DE CANCELACIÓN DEL CLIENTE en vez de escribir el estado
 * a mano. Un `updateMany` directo dejaría sin hacer todo lo que cuelga de una
 * cancelación —devolver el inventario del pedido, parar los reintentos de
 * búsqueda, apagar los temporizadores, avisar al negocio— y esas omisiones no
 * fallan: se notan semanas después, cuando el stock no cuadra. Por eso se
 * busca el dueño y se llama a la misma función que llamaría él.
 *
 * Y se le AVISA. Una cancelación de la que el usuario no se entera no lo
 * libera: su teléfono le sigue diciendo que hay un servicio en curso.
 */
export async function cancelarServicioAtascado(
  tipo: TipoAtascado,
  id: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const avisar = (userId: string | null | undefined): void => {
    if (!userId) return;
    const aviso = avisoDeCancelacion(tipo);
    void sendPushToClient(userId, {
      title: aviso.title,
      body: aviso.body,
      data: { type: 'servicio_cancelado', servicioId: id },
    });
  };

  if (tipo === 'viaje') {
    const t = await prisma.trip.findUnique({ where: { id }, select: { passengerId: true } });
    if (!t?.passengerId) return { ok: false, motivo: 'El viaje no existe' };
    const ok = await cancelClientTrip(t.passengerId, id);
    if (!ok) return { ok: false, motivo: 'El viaje ya no se puede cancelar' };
    await prisma.trip.update({ where: { id }, data: { cancelReason: MOTIVO_ATASCADO } });
    avisar(t.passengerId);
    return { ok: true };
  }

  if (tipo === 'mandado') {
    const e = await prisma.errand.findUnique({ where: { id }, select: { userId: true } });
    if (!e?.userId) return { ok: false, motivo: 'El mandado no existe' };
    const ok = await cancelClientErrand(e.userId, id);
    if (!ok) return { ok: false, motivo: 'El mandado ya no se puede cancelar' };
    avisar(e.userId);
    return { ok: true };
  }

  if (tipo === 'pedido') {
    const o = await prisma.order.findUnique({ where: { id }, select: { userId: true } });
    if (!o?.userId) return { ok: false, motivo: 'El pedido no existe' };
    const ok = await cancelClientOrder(o.userId, id);
    if (!ok) return { ok: false, motivo: 'El pedido ya no se puede cancelar' };
    avisar(o.userId);
    return { ok: true };
  }

  const b = await prisma.intercityBooking.findUnique({ where: { id }, select: { userId: true } });
  if (!b?.userId) return { ok: false, motivo: 'La reserva no existe' };
  const ok = await cancelIntercityBooking(b.userId, id);
  if (!ok) return { ok: false, motivo: 'La reserva ya no se puede cancelar' };
  avisar(b.userId);
  return { ok: true };
}
