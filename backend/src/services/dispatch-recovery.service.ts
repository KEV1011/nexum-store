// ── Rescate del despacho tras un reinicio ────────────────────────────────────
//
// Los ciclos de oferta viven en `setTimeout`: en memoria, dentro del proceso.
// Cuando Render redespliega —o el proceso se reinicia por cualquier motivo— esos
// temporizadores se van con él y nadie los recupera. El servicio queda en la
// base pidiendo conductor, pero ya no hay nada que se lo ofrezca a nadie:
//
//   · el pasajero ve "buscando conductor" hasta que se cansa y cierra la app;
//   · el restaurante tiene la comida hecha esperando un repartidor que no viene;
//   · nadie se entera, porque tampoco hay un aviso de "esto lleva horas parado".
//
// Y pasa en CADA despliegue. Esto lo cierra por los dos lados: al arrancar se
// revisa qué quedó a medias, y un barrido periódico repite la comprobación por
// si un ciclo se pierde sin que el proceso muera (una excepción a destiempo).
//
// La regla al recuperar depende de la edad, porque no todo se arregla igual:
//
//   · reciente  → se reanuda la búsqueda; el cliente sigue esperando y todavía
//                 tiene sentido buscarle a alguien.
//   · viejo     → NO se le ofrece a nadie. Se cierra avisando, por el mismo
//                 camino que cuando se agotan los reintentos. Mandarle un
//                 conductor a quien pidió el viaje hace tres horas y ya se fue
//                 es peor que no hacer nada: el conductor se desplaza en balde.
//
// Nunca se inventa un estado: se reanuda lo que ya estaba buscando, o se cierra
// con el aviso que el propio despacho habría dado.

import { prisma } from '../lib/prisma';
import {
  startMatchingCycle,
  startErrandMatchingCycle,
  startOrderMatchingCycle,
  rendirBusqueda,
} from './matching.service';
import { startIntercityMatching, rendirBusquedaIntercity } from './intercity.service';
import { INTERCITY_CITY_COORDS } from '../config/constants';

const PAMPLONA = INTERCITY_CITY_COORDS.pamplona;

/**
 * A partir de esta edad, un servicio colgado se cierra en vez de reanudarse.
 * Por encima de media hora, quien lo pidió casi seguro que ya no está.
 */
const MAX_EDAD_MIN = Number(process.env['DISPATCH_RECOVERY_MAX_AGE_MIN'] ?? 30);

/** Cada cuánto se repite la comprobación con el proceso ya vivo. */
export const BARRIDO_MS = Number(process.env['DISPATCH_SWEEP_MS'] ?? 5 * 60 * 1000);

export interface ResumenRescate {
  reanudados: number;
  cerrados: number;
  porTipo: Record<string, { reanudados: number; cerrados: number }>;
}

function _vacio(): ResumenRescate {
  return { reanudados: 0, cerrados: 0, porTipo: {} };
}

function _anota(r: ResumenRescate, tipo: string, accion: 'reanudados' | 'cerrados'): void {
  r[accion]++;
  r.porTipo[tipo] ??= { reanudados: 0, cerrados: 0 };
  r.porTipo[tipo]![accion]++;
}

/** ¿Este servicio es demasiado viejo para seguir buscándole conductor? */
export function esDemasiadoViejo(creadoEn: Date, ahora: Date = new Date()): boolean {
  return ahora.getTime() - creadoEn.getTime() > MAX_EDAD_MIN * 60 * 1000;
}

/**
 * Revisa los servicios que quedaron buscando conductor y los desatasca.
 *
 * Es idempotente y seguro de repetir: si un ciclo sigue vivo en memoria, volver
 * a arrancarlo solo adelanta la siguiente ronda de ofertas; y el propio ciclo
 * comprueba en la base que el servicio siga sin conductor antes de ofrecer nada.
 */
export async function rescatarDespacho(): Promise<ResumenRescate> {
  const r = _vacio();
  const ahora = new Date();

  // Antes que nada, devolver al ruedo a quien se quedó marcado "en viaje": es
  // gente que no recibe una sola solicitud y no tiene forma de enterarse.
  await liberarConductoresColgados();

  // ── Viajes urbanos ─────────────────────────────────────────────────────────
  try {
    const viajes = await prisma.trip.findMany({
      where: { status: 'SEARCHING', driverId: null },
      select: { id: true, createdAt: true, originLat: true, originLng: true },
      take: 200,
    });
    for (const v of viajes) {
      if (esDemasiadoViejo(v.createdAt, ahora)) {
        rendirBusqueda('trip', v.id);
        _anota(r, 'viaje', 'cerrados');
      } else {
        void startMatchingCycle(v.id, v.originLat, v.originLng);
        _anota(r, 'viaje', 'reanudados');
      }
    }
  } catch (e) {
    console.warn('[Rescate] viajes:', (e as Error).message);
  }

  // ── Mandados ───────────────────────────────────────────────────────────────
  try {
    const mandados = await prisma.errand.findMany({
      where: { status: 'SEARCHING', driverId: null },
      select: { id: true, createdAt: true, pickupLat: true, pickupLng: true },
      take: 200,
    });
    for (const m of mandados) {
      if (esDemasiadoViejo(m.createdAt, ahora)) {
        rendirBusqueda('errand', m.id);
        _anota(r, 'mandado', 'cerrados');
      } else {
        // Los mandados creados antes de guardar el punto de recogida no lo
        // tienen: se ancla al centro, igual que hace la ruta cuando el cliente
        // no lo manda. Es peor que el punto real, pero mejor que no buscar.
        void startErrandMatchingCycle(
          m.id,
          m.pickupLat ?? PAMPLONA.lat,
          m.pickupLng ?? PAMPLONA.lng,
        );
        _anota(r, 'mandado', 'reanudados');
      }
    }
  } catch (e) {
    console.warn('[Rescate] mandados:', (e as Error).message);
  }

  // ── Pedidos ────────────────────────────────────────────────────────────────
  // El negocio ya aceptó y está cocinando: PREPARING sin repartidor es
  // exactamente el estado en el que se dispara la búsqueda.
  try {
    const pedidos = await prisma.order.findMany({
      where: { status: 'PREPARING', driverId: null },
      select: { id: true, createdAt: true },
      take: 200,
    });
    for (const p of pedidos) {
      if (esDemasiadoViejo(p.createdAt, ahora)) {
        rendirBusqueda('order', p.id);
        _anota(r, 'pedido', 'cerrados');
      } else {
        void startOrderMatchingCycle(p.id);
        _anota(r, 'pedido', 'reanudados');
      }
    }
  } catch (e) {
    console.warn('[Rescate] pedidos:', (e as Error).message);
  }

  // ── Intermunicipal ─────────────────────────────────────────────────────────
  try {
    const reservas = await prisma.intercityBooking.findMany({
      where: { status: 'SEARCHING', driverId: null },
      select: { id: true, createdAt: true },
      take: 200,
    });
    for (const b of reservas) {
      if (esDemasiadoViejo(b.createdAt, ahora)) {
        rendirBusquedaIntercity(b.id);
        _anota(r, 'intermunicipal', 'cerrados');
      } else {
        void startIntercityMatching(b.id);
        _anota(r, 'intermunicipal', 'reanudados');
      }
    }
  } catch (e) {
    console.warn('[Rescate] intermunicipal:', (e as Error).message);
  }

  if (r.reanudados || r.cerrados) {
    console.log(
      `[Rescate] ${r.reanudados} servicio(s) reanudado(s), ${r.cerrados} cerrado(s) por antigüedad ` +
        `· ${JSON.stringify(r.porTipo)}`,
    );
  }
  return r;
}

/**
 * Minutos sin latido tras los cuales un conductor "en viaje" ya no lo está.
 *
 * Generoso a propósito. Un túnel, un sótano o un rato con la pantalla apagada
 * cortan el latido sin que pase nada raro, y sacar a alguien de su viaje por
 * eso sería peor que el problema. Tres cuartos de hora sin una sola posición
 * no es un túnel: es un teléfono apagado o una app cerrada.
 */
const SIN_LATIDO_MIN = Number(process.env['STUCK_ON_TRIP_MIN'] ?? 45);

/**
 * Devuelve al ruedo a los conductores que quedaron marcados como "en viaje"
 * pero llevan una eternidad sin reportar.
 *
 * El agujero que tapa: cerrar un viaje libera al conductor (`ON_TRIP` →
 * `ONLINE`), y ese cierre viajaba en un mensaje de WebSocket que se descarta en
 * silencio si el socket está caído. Cuando se perdía, el conductor se quedaba
 * `ON_TRIP` PARA SIEMPRE — y `ON_TRIP` está fuera del filtro del despacho, así
 * que no volvía a recibir una sola solicitud. Reconectar tampoco lo arreglaba:
 * `noteDriverConnected` respeta el `ON_TRIP` a propósito (para no pisar un viaje
 * de verdad), de modo que la app se reabría y él seguía invisible sin saberlo.
 *
 * Se toca SOLO al conductor, nunca el viaje. Cerrarlo sería inventar que el
 * servicio acabó —y cerrar paga—; cancelarlo sería inventar que no acabó. Un
 * conductor sin latido tampoco es despachable (el filtro de frescura de 120 s ya
 * lo excluye), así que ponerlo OFFLINE no cambia nada hoy: cambia el día que
 * vuelve a abrir la app, porque entonces sí pasa a ONLINE y trabaja.
 *
 * El viaje huérfano queda contado en las métricas para que un humano decida con
 * `releaseDriver`, que es la vía que sí cancela cosas y por eso pide una mano.
 */
export async function liberarConductoresColgados(): Promise<number> {
  const corte = new Date(Date.now() - SIN_LATIDO_MIN * 60 * 1000);
  try {
    const r = await prisma.driver.updateMany({
      where: {
        status: 'ON_TRIP',
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: corte } }],
      },
      data: { status: 'OFFLINE' },
    });
    if (r.count > 0) {
      console.warn(
        `[Rescate] ${r.count} conductor(es) llevaban más de ${SIN_LATIDO_MIN} min ` +
        'marcados en viaje sin reportar; se liberan para que puedan trabajar.',
      );
    }
    return r.count;
  } catch (e) {
    console.warn('[Rescate] conductores colgados:', (e as Error).message);
    return 0;
  }
}

/**
 * Viajes que se quedaron a medias: en curso, con conductor, y sin noticias suyas
 * desde hace mucho. Es el rastro que deja un cierre perdido.
 */
export async function contarViajesColgados(): Promise<{ total: number; desdeMin: number }> {
  const corte = new Date(Date.now() - SIN_LATIDO_MIN * 60 * 1000);
  const total = await prisma.trip.count({
    where: {
      status: { in: ['ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'] },
      driverId: { not: null },
      updatedAt: { lt: corte },
      driver: { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: corte } }] },
    },
  });
  return { total, desdeMin: SIN_LATIDO_MIN };
}

/**
 * Cuántos servicios llevan demasiado tiempo pidiendo conductor. Lo enseña el
 * panel: la operación tiene que poder verlo sin que se lo cuente un cliente
 * enfadado.
 */
export async function contarDespachoAtascado(): Promise<{
  total: number;
  viaje: number;
  mandado: number;
  pedido: number;
  intermunicipal: number;
  desdeMin: number;
}> {
  const corte = new Date(Date.now() - MAX_EDAD_MIN * 60 * 1000);
  const [viaje, mandado, pedido, intermunicipal] = await Promise.all([
    prisma.trip.count({ where: { status: 'SEARCHING', driverId: null, createdAt: { lt: corte } } }),
    prisma.errand.count({ where: { status: 'SEARCHING', driverId: null, createdAt: { lt: corte } } }),
    prisma.order.count({ where: { status: 'PREPARING', driverId: null, createdAt: { lt: corte } } }),
    prisma.intercityBooking.count({
      where: { status: 'SEARCHING', driverId: null, createdAt: { lt: corte } },
    }),
  ]);
  return {
    total: viaje + mandado + pedido + intermunicipal,
    viaje, mandado, pedido, intermunicipal,
    desdeMin: MAX_EDAD_MIN,
  };
}
