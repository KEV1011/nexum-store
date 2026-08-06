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
