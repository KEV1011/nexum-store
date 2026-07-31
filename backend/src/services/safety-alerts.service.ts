// ── Seguridad operativa: geofencing de destino + anomalías de ruta ────────────
//
// Se alimenta del heartbeat GPS del conductor (updateDriverGeo → onDriverHeartbeat,
// fire-and-forget). Para cada conductor con un servicio EN CURSO evalúa:
//
//  1. GEOFENCE — al entrar al radio del destino avisa al cliente por push
//     ("tu conductor está llegando") y registra el evento en la Torre de Control.
//  2. DETENCIÓN prolongada — sin moverse > STALL_MIN minutos con servicio activo.
//  3. DESVÍO — distancia al corredor recto origen→destino mayor al umbral.
//
// Todo es BEST-EFFORT y pasivo: jamás bloquea el viaje ni el fix GPS. Las
// alertas viven en memoria (anillo de 200) y se consultan desde el panel admin
// y el portal /empresa (filtradas por flota). Umbrales configurables por env.
// El lookup del servicio activo se cachea por conductor (TTL 30 s) para no
// consultar la BD en cada heartbeat de 4 s.

import { prisma } from '../lib/prisma';
import { sendPushToDriver } from './push.service';
import { sendPushToClient } from './push.service';
import { INTERCITY_CITY_COORDS } from '../config/constants';

// ── Umbrales (env con defaults razonables) ────────────────────────────────────

const GEOFENCE_URBAN_M = Number(process.env['GEOFENCE_URBAN_M'] ?? 400);
const GEOFENCE_LONG_M = Number(process.env['GEOFENCE_LONG_M'] ?? 2500);
const STALL_MIN = Number(process.env['SAFETY_STALL_MIN'] ?? 10);
const STALL_MOVE_M = 150; // moverse menos que esto = "quieto"
const DEVIATION_BUFFER_M = Number(process.env['SAFETY_DEVIATION_BUFFER_M'] ?? 2000);
const DEVIATION_FACTOR = Number(process.env['SAFETY_DEVIATION_FACTOR'] ?? 0.35);
const LOOKUP_TTL_MS = 30_000;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type SafetyAlertKind =
  | 'geofence'
  | 'stall'
  | 'deviation'
  /** Conductor sin señal mientras lleva un servicio en curso (posible robo). */
  | 'offline';

export interface SafetyAlert {
  id: number;
  at: string;
  kind: SafetyAlertKind;
  driverId: string;
  driverName: string;
  operatorId: string | null;
  /** 'trip' | 'intercity' | 'freight' */
  serviceKind: string;
  serviceId: string;
  detail: string;
}

interface ActiveService {
  kind: 'trip' | 'intercity' | 'freight';
  id: string;
  clientId: string | null;
  operatorId: string | null;
  driverName: string;
  originLat: number | null;
  originLng: number | null;
  destLat: number | null;
  destLng: number | null;
  destLabel: string;
  /** radio de la geocerca del destino según el tipo de servicio */
  geofenceM: number;
}

// ── Estado en memoria ─────────────────────────────────────────────────────────

const _alerts: SafetyAlert[] = [];
let _alertSeq = 1;

// driverId → lookup cacheado del servicio activo
const _serviceCache = new Map<string, { at: number; svc: ActiveService | null }>();
// serviceId → flags de "ya avisado" (una alerta por tipo por servicio)
const _notified = new Map<string, Set<SafetyAlertKind>>();
// driverId → última posición con movimiento real (para detectar detenciones)
const _lastMove = new Map<string, { lat: number; lng: number; at: number }>();

function _pushAlert(a: Omit<SafetyAlert, 'id' | 'at'>): void {
  _alerts.unshift({ ...a, id: _alertSeq++, at: new Date().toISOString() });
  if (_alerts.length > 200) _alerts.length = 200;
  console.log(`[Seguridad] ${a.kind} · ${a.serviceKind}=${a.serviceId} · driver=${a.driverId}: ${a.detail}`);
}

/** Alertas para la Torre de Control. Sin operatorId = todas (admin). */
export function listSafetyAlerts(operatorId?: string): SafetyAlert[] {
  return operatorId ? _alerts.filter((a) => a.operatorId === operatorId) : [..._alerts];
}

// ── Geometría ─────────────────────────────────────────────────────────────────

function _haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distancia (m) de un punto al SEGMENTO origen→destino (aprox. equirectangular). */
function _distToSegmentM(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): number {
  // Proyección local en metros alrededor del origen.
  const kx = 111_320 * Math.cos((aLat * Math.PI) / 180);
  const ky = 110_574;
  const px = (pLng - aLng) * kx, py = (pLat - aLat) * ky;
  const bx = (bLng - aLng) * kx, by = (bLat - aLat) * ky;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

// ── Lookup del servicio activo (cacheado) ─────────────────────────────────────

async function _activeServiceFor(driverId: string): Promise<ActiveService | null> {
  const cached = _serviceCache.get(driverId);
  if (cached && Date.now() - cached.at < LOOKUP_TTL_MS) return cached.svc;

  let svc: ActiveService | null = null;

  const trip = await prisma.trip.findFirst({
    where: { driverId, status: 'IN_PROGRESS' },
    select: {
      id: true, passengerId: true, operatorId: true,
      originLat: true, originLng: true, destLat: true, destLng: true,
      destAddress: true, driver: { select: { name: true } },
    },
  });
  if (trip) {
    svc = {
      kind: 'trip', id: trip.id, clientId: trip.passengerId, operatorId: trip.operatorId,
      driverName: trip.driver?.name ?? 'Conductor',
      originLat: trip.originLat, originLng: trip.originLng,
      destLat: trip.destLat, destLng: trip.destLng,
      destLabel: trip.destAddress, geofenceM: GEOFENCE_URBAN_M,
    };
  }

  if (!svc) {
    const b = await prisma.intercityBooking.findFirst({
      where: { driverId, status: 'IN_PROGRESS' },
      select: { id: true, userId: true, operatorId: true, origin: true, destination: true },
    });
    if (b) {
      const o = INTERCITY_CITY_COORDS[b.origin.toLowerCase() as keyof typeof INTERCITY_CITY_COORDS];
      const d = INTERCITY_CITY_COORDS[b.destination.toLowerCase() as keyof typeof INTERCITY_CITY_COORDS];
      const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { name: true } });
      svc = {
        kind: 'intercity', id: b.id, clientId: b.userId, operatorId: b.operatorId,
        driverName: driver?.name ?? 'Conductor',
        originLat: o?.lat ?? null, originLng: o?.lng ?? null,
        destLat: d?.lat ?? null, destLng: d?.lng ?? null,
        destLabel: b.destination, geofenceM: GEOFENCE_LONG_M,
      };
    }
  }

  if (!svc) {
    const f = await prisma.freightRequest.findFirst({
      where: { driverId, status: 'IN_PROGRESS' },
      select: {
        id: true, clientId: true, operatorId: true,
        originLat: true, originLng: true, destLat: true, destLng: true, destAddress: true,
      },
    });
    if (f) {
      const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { name: true } });
      svc = {
        kind: 'freight', id: f.id, clientId: f.clientId, operatorId: f.operatorId,
        driverName: driver?.name ?? 'Conductor',
        originLat: f.originLat, originLng: f.originLng,
        destLat: f.destLat, destLng: f.destLng,
        destLabel: f.destAddress, geofenceM: GEOFENCE_LONG_M,
      };
    }
  }

  _serviceCache.set(driverId, { at: Date.now(), svc });
  return svc;
}

function _once(serviceId: string, kind: SafetyAlertKind): boolean {
  const set = _notified.get(serviceId) ?? new Set<SafetyAlertKind>();
  if (set.has(kind)) return false;
  set.add(kind);
  _notified.set(serviceId, set);
  return true;
}

// ── Punto de entrada (desde el heartbeat) ─────────────────────────────────────

/**
 * Evalúa geocerca de destino, detención y desvío para el conductor. Best-effort:
 * cualquier error se traga (nunca afecta el fix GPS ni el servicio).
 */
export async function onDriverHeartbeat(driverId: string, lat: number, lng: number): Promise<void> {
  try {
    // Detección de movimiento (siempre, sirve para el stall cuando haya servicio).
    const lm = _lastMove.get(driverId);
    if (!lm || _haversineM(lm.lat, lm.lng, lat, lng) >= STALL_MOVE_M) {
      _lastMove.set(driverId, { lat, lng, at: Date.now() });
    }

    const svc = await _activeServiceFor(driverId);
    if (!svc) return;

    // 1) Geofence del destino → aviso al cliente + Torre.
    if (svc.destLat != null && svc.destLng != null) {
      const toDest = _haversineM(lat, lng, svc.destLat, svc.destLng);
      if (toDest <= svc.geofenceM && _once(svc.id, 'geofence')) {
        _pushAlert({
          kind: 'geofence', driverId, driverName: svc.driverName,
          operatorId: svc.operatorId, serviceKind: svc.kind, serviceId: svc.id,
          detail: `Llegando al destino (${Math.round(toDest)} m de ${svc.destLabel})`,
        });
        if (svc.clientId) {
          void sendPushToClient(svc.clientId, {
            title: 'Tu conductor está llegando',
            body: `Está entrando a la zona de destino (${svc.destLabel}).`,
            data: { type: `${svc.kind}_near_destination`, id: svc.id },
          });
        }
      }
    }

    // 2) Detención prolongada.
    const still = _lastMove.get(driverId);
    if (still && Date.now() - still.at > STALL_MIN * 60_000 && _once(svc.id, 'stall')) {
      _pushAlert({
        kind: 'stall', driverId, driverName: svc.driverName,
        operatorId: svc.operatorId, serviceKind: svc.kind, serviceId: svc.id,
        detail: `Sin movimiento por más de ${STALL_MIN} min con servicio en curso`,
      });
    }

    // 3) Desvío del corredor origen→destino.
    if (
      svc.originLat != null && svc.originLng != null &&
      svc.destLat != null && svc.destLng != null
    ) {
      const routeLen = _haversineM(svc.originLat, svc.originLng, svc.destLat, svc.destLng);
      const off = _distToSegmentM(lat, lng, svc.originLat, svc.originLng, svc.destLat, svc.destLng);
      const limit = Math.max(DEVIATION_BUFFER_M, routeLen * DEVIATION_FACTOR);
      if (off > limit && _once(svc.id, 'deviation')) {
        _pushAlert({
          kind: 'deviation', driverId, driverName: svc.driverName,
          operatorId: svc.operatorId, serviceKind: svc.kind, serviceId: svc.id,
          detail: `A ${(off / 1000).toFixed(1)} km del corredor de la ruta (límite ${(limit / 1000).toFixed(1)} km)`,
        });
      }
    }
  } catch {
    // pasivo: jamás romper el heartbeat
  }
}

/** Purga cachés viejos (llamar en un timer junto a pruneRateLimits). */
export function pruneSafetyState(): void {
  const now = Date.now();
  for (const [k, v] of _serviceCache) {
    if (now - v.at > 10 * 60_000) _serviceCache.delete(k);
  }
  for (const [k, v] of _lastMove) {
    if (now - v.at > 60 * 60_000) _lastMove.delete(k);
  }
}

// ── Vigilante: conductor desaparecido con mercancía ──────────────────────────
//
// El robo típico del reparto: el conductor recoge el paquete y en el camino
// cierra la app o apaga los datos. Todas las alertas anteriores dependen del
// heartbeat, así que justo en ese escenario NINGUNA se dispara: el problema no
// es un evento raro, es la AUSENCIA de eventos.
//
// Por eso hace falta un barrido: cada minuto busca servicios en curso cuyo
// conductor lleva demasiado tiempo sin dar señal. Es la única alerta que no
// puede nacer del heartbeat.

/** Minutos sin señal con un servicio en curso antes de levantar la alerta. */
const OFFLINE_ALERT_MIN = Number(process.env['SAFETY_OFFLINE_MIN'] ?? 6);

/** Servicios que llevan mercancía ajena: es donde el silencio importa. */
async function _serviciosEnCursoConConductor(): Promise<
  Array<{
    serviceKind: string;
    serviceId: string;
    driverId: string;
    driverName: string;
    operatorId: string | null;
    lastSeenAt: Date | null;
    detalle: string;
  }>
> {
  // Solo `Trip` tiene relación con el conductor; mandado, pedido y flete lo
  // guardan denormalizado. Así que se leen los servicios en curso y luego se
  // consultan los conductores en una sola query, cruzando en memoria.
  const [trips, errands, orders, freights] = await Promise.all([
    prisma.trip.findMany({
      where: { status: 'IN_PROGRESS', driverId: { not: null } },
      select: { id: true, driverId: true, operatorId: true, serviceType: true, destAddress: true },
      take: 100,
    }),
    prisma.errand.findMany({
      where: { status: { in: ['SHOPPING', 'ON_THE_WAY'] }, driverId: { not: null } },
      select: { id: true, driverId: true, operatorId: true, dropoffAddress: true },
      take: 100,
    }),
    prisma.order.findMany({
      where: { status: { in: ['AT_PICKUP', 'IN_TRANSIT'] }, driverId: { not: null } },
      select: { id: true, driverId: true, operatorId: true, deliveryAddress: true },
      take: 100,
    }),
    prisma.freightRequest.findMany({
      where: { status: 'IN_PROGRESS', driverId: { not: null } },
      select: { id: true, driverId: true, operatorId: true, destAddress: true },
      take: 100,
    }),
  ]);

  type Fila = { id: string; driverId: string | null; operatorId: string | null };
  const filas: Array<{ kind: string; r: Fila; detalle: string }> = [
    ...trips.map((t) => ({
      kind: 'trip',
      r: t as Fila,
      detalle: `${t.serviceType === 'ENVIOS' ? 'Envío' : 'Viaje'} hacia ${t.destAddress}`,
    })),
    ...errands.map((e) => ({ kind: 'errand', r: e as Fila, detalle: `Mandado hacia ${e.dropoffAddress}` })),
    ...orders.map((o) => ({ kind: 'order', r: o as Fila, detalle: `Pedido hacia ${o.deliveryAddress}` })),
    ...freights.map((f) => ({ kind: 'freight', r: f as Fila, detalle: `Flete hacia ${f.destAddress}` })),
  ];
  if (filas.length === 0) return [];

  const corte = new Date(Date.now() - OFFLINE_ALERT_MIN * 60_000);
  const ids = [...new Set(filas.map((f) => f.r.driverId!).filter(Boolean))];
  const mudos = await prisma.driver.findMany({
    where: {
      id: { in: ids },
      // `null` = nunca dio señal; también cuenta como desaparecido.
      OR: [{ lastSeenAt: { lt: corte } }, { lastSeenAt: null }],
    },
    select: { id: true, name: true, lastSeenAt: true },
  });
  const porId = new Map(mudos.map((d) => [d.id, d]));

  return filas
    .filter((f) => porId.has(f.r.driverId!))
    .map((f) => {
      const d = porId.get(f.r.driverId!)!;
      return {
        serviceKind: f.kind,
        serviceId: f.r.id,
        driverId: d.id,
        driverName: d.name,
        operatorId: f.r.operatorId,
        lastSeenAt: d.lastSeenAt,
        detalle: f.detalle,
      };
    });
}

/**
 * Un barrido. Devuelve cuántas alertas nuevas levantó (útil para pruebas).
 * Best-effort: cualquier fallo se traga, esto no puede tumbar el servidor.
 */
export async function sweepOfflineDrivers(): Promise<number> {
  let nuevas = 0;
  try {
    for (const s of await _serviciosEnCursoConConductor()) {
      if (!_once(s.serviceId, 'offline')) continue;
      const minutos = s.lastSeenAt
        ? Math.round((Date.now() - s.lastSeenAt.getTime()) / 60_000)
        : OFFLINE_ALERT_MIN;
      _pushAlert({
        kind: 'offline',
        driverId: s.driverId,
        driverName: s.driverName,
        operatorId: s.operatorId,
        serviceKind: s.serviceKind,
        serviceId: s.serviceId,
        detail: `Sin señal hace ${minutos} min con un servicio en curso · ${s.detalle}`,
      });
      nuevas++;
      // Al conductor: la mayoría de las veces es batería o cobertura, no robo.
      // Un aviso a tiempo resuelve el caso honesto y presiona al deshonesto.
      void sendPushToDriver(s.driverId, {
        title: 'Reconéctate: tienes un servicio en curso',
        body: 'Perdimos tu señal. Abre ZIPA para que el cliente pueda seguir su entrega.',
        data: { type: 'offline_with_service', serviceId: s.serviceId },
      });
    }
  } catch {
    // Silencio deliberado: es un barrido de fondo.
  }
  return nuevas;
}
