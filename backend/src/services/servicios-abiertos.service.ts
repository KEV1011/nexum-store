// ── Retomar o soltar el servicio que quedó abierto ───────────────────────────
//
// Ver `lib/servicio-abierto.ts` para el porqué. Aquí la ejecución:
//
//   · `listarServiciosAbiertos`: lo que el conductor tiene asignado y sin
//     cerrar, con la MISMA forma que la oferta que le llegó (`trip_request`,
//     `order_request`, `errand_request`). Así la app lo convierte con los
//     mapeadores que ya usa para las ofertas y entra a la pantalla de siempre,
//     sin un segundo camino.
//   · `soltarServicio`: lo devuelve a la búsqueda, avisa al cliente (y al
//     negocio en un pedido), vuelve a buscar —sin ofrecérselo a él— y lo pone
//     en línea si no le queda nada más.

import type { ErrandStatus, OrderStatus, TripStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { guardaNoOcupa } from '../lib/estado-terminal';
import { liberarConductorSiNoTieneMas } from '../lib/liberar-conductor';
import {
  ESTADOS_SOLTABLES,
  faseDe,
  motivoParaNoSoltar,
  type FaseServicio,
  type TipoServicio,
} from '../lib/servicio-abierto';
import { INTERCITY_CITY_COORDS } from '../config/constants';
import {
  buildTripRequestDTO,
  marcarSoltadoPor,
  startErrandMatchingCycle,
  startMatchingCycle,
  startOrderMatchingCycle,
} from './matching.service';
import { getOrderOfferInfo } from './order-offer.service';
import { avisarEstadoMandado, getErrandOfferInfo } from './errand.service';
import { avisarCambioDePedido, notifyClientTripUpdateById } from './client.service';
import { registrarEventoPedido } from './pedido-eventos.service';
import { sendPushToClient } from './push.service';

export interface ServicioAbiertoDTO {
  tipo: TipoServicio;
  id: string;
  ref: string;
  /** El estado en la base (ACCEPTED, AT_PICKUP…). */
  estado: string;
  /** En qué punto va, con las palabras de la pantalla del conductor. */
  fase: FaseServicio;
  puedeSoltar: boolean;
  /** Por qué no se puede soltar, si no se puede. */
  motivoNoSoltar?: string;
  /** Desde cuándo lo tiene (ISO). */
  desde: string;
  /** El servicio con la forma de su oferta, para entrar a la pantalla de siempre. */
  oferta: Record<string, unknown>;
}

export class ServicioAbiertoError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

/** Lo que el conductor tiene asignado y sin cerrar. Las reservas para otro día no cuentan. */
export async function listarServiciosAbiertos(driverId: string): Promise<ServicioAbiertoDTO[]> {
  const [viajes, pedidos, mandados] = await Promise.all([
    prisma.trip.findMany({
      where: { driverId, status: guardaNoOcupa('trip') as { notIn: TripStatus[] } },
      select: { id: true, requestRef: true, status: true, acceptedAt: true, updatedAt: true },
    }),
    prisma.order.findMany({
      where: { driverId, status: guardaNoOcupa('order') as { notIn: OrderStatus[] } },
      select: { id: true, orderRef: true, status: true, updatedAt: true },
    }),
    prisma.errand.findMany({
      where: { driverId, status: guardaNoOcupa('errand') as { notIn: ErrandStatus[] } },
      select: { id: true, requestRef: true, status: true, acceptedAt: true, updatedAt: true },
    }),
  ]);

  const salida: ServicioAbiertoDTO[] = [];
  const armar = (
    tipo: TipoServicio, id: string, ref: string, estado: string, desde: Date,
    oferta: object | null | undefined,
  ) => {
    const fase = faseDe(tipo, estado);
    // Sin fase (un estado raro) o sin oferta no hay pantalla a la que volver.
    if (!fase || !oferta) return;
    const motivo = motivoParaNoSoltar(tipo, estado);
    salida.push({
      tipo, id, ref, estado, fase,
      puedeSoltar: motivo === null,
      ...(motivo ? { motivoNoSoltar: motivo } : {}),
      desde: desde.toISOString(),
      oferta: oferta as Record<string, unknown>,
    });
  };

  for (const v of viajes) {
    armar('trip', v.id, v.requestRef, v.status, v.acceptedAt ?? v.updatedAt, await buildTripRequestDTO(v.id));
  }
  for (const p of pedidos) {
    armar('order', p.id, p.orderRef, p.status, p.updatedAt, (await getOrderOfferInfo(p.id))?.dto);
  }
  for (const m of mandados) {
    armar('errand', m.id, m.requestRef, m.status, m.acceptedAt ?? m.updatedAt, (await getErrandOfferInfo(m.id))?.dto);
  }
  // El más viejo primero: es el que lleva más tiempo con alguien esperando.
  return salida.sort((a, b) => a.desde.localeCompare(b.desde));
}

/**
 * Devuelve el servicio a la búsqueda. La guarda vive en el `where`: solo si
 * sigue siendo de ESTE conductor y en un estado que se puede soltar. Así, si
 * el cliente canceló o el conductor ya lo avanzó desde otro teléfono entre que
 * vio el botón y lo tocó, no se pisa nada.
 */
export async function soltarServicio(driverId: string, tipo: TipoServicio, id: string): Promise<void> {
  const buscarOtro = tipo === 'trip'
    ? await _soltarViaje(driverId, id)
    : tipo === 'order'
      ? await _soltarPedido(driverId, id)
      : await _soltarMandado(driverId, id);
  // EL ORDEN IMPORTA. Primero se marca quién lo soltó y se le deja en línea;
  // DESPUÉS se busca. Al revés, la búsqueda corría contra el conductor todavía
  // «en viaje» y la exclusión no hacía nada — pero en el reintento de 30 s ya
  // estaba en línea, era el más cercano, y le volvía a llegar lo que soltó.
  marcarSoltadoPor(tipo, id, driverId);
  await liberarConductorSiNoTieneMas(driverId);
  buscarOtro();
}

async function _motivoDeRechazo(
  tipo: TipoServicio,
  actual: { driverId: string | null; status: string } | null,
  driverId: string,
): Promise<ServicioAbiertoError> {
  if (!actual || actual.driverId !== driverId) {
    return new ServicioAbiertoError('Ese servicio ya no está asignado a ti.', 404);
  }
  return new ServicioAbiertoError(
    motivoParaNoSoltar(tipo, actual.status) ?? 'No se pudo soltar el servicio.',
    409,
  );
}

async function _soltarViaje(driverId: string, id: string): Promise<() => void> {
  const r = await prisma.trip.updateMany({
    where: { id, driverId, status: { in: ESTADOS_SOLTABLES.trip as TripStatus[] } },
    data: {
      status: 'SEARCHING', driverId: null, vehicleId: null, operatorId: null,
      acceptedAt: null, arrivedAt: null,
    },
  });
  if (r.count === 0) {
    throw await _motivoDeRechazo('trip', await prisma.trip.findUnique({
      where: { id }, select: { driverId: true, status: true },
    }), driverId);
  }
  const t = await prisma.trip.findUnique({
    where: { id }, select: { passengerId: true, originLat: true, originLng: true },
  });
  void notifyClientTripUpdateById(id);
  if (t?.passengerId) {
    void sendPushToClient(t.passengerId, {
      title: 'Buscando otro conductor',
      body: 'Tu conductor no pudo llegar. Ya estamos buscando otro, no tienes que hacer nada.',
      data: { type: 'trip_reassigning', tripId: id },
    });
  }
  return () => { if (t) void startMatchingCycle(id, t.originLat, t.originLng); };
}

async function _soltarPedido(driverId: string, id: string): Promise<() => void> {
  const previo = await prisma.order.findUnique({
    where: { id }, select: { driverId: true, status: true, hubAt: true, userId: true },
  });
  // La caja que está en la taquilla de destino vuelve a esperar ahí; la que
  // está en el comercio vuelve a «en preparación», que es desde donde se
  // despacha (el negocio ya la marcó lista: `readyAt` no se toca).
  const vuelveA: OrderStatus = previo?.hubAt ? 'AT_DESTINATION_HUB' : 'PREPARING';
  const r = await prisma.order.updateMany({
    where: { id, driverId, status: { in: ESTADOS_SOLTABLES.order as OrderStatus[] } },
    data: {
      status: vuelveA, driverId: null, driverName: null, driverPhone: null, operatorId: null,
      // El aviso de «no encontramos repartidor» puede tener que salir otra vez.
      noDriverNotifiedAt: null,
    },
  });
  if (r.count === 0) throw await _motivoDeRechazo('order', previo, driverId);
  await registrarEventoPedido(id, vuelveA, {
    actor: 'conductor', note: 'El repartidor no pudo seguir: se busca otro.',
  });
  void avisarCambioDePedido(id);
  if (previo?.userId) {
    void sendPushToClient(previo.userId, {
      title: 'Buscando otro repartidor',
      body: 'Tu repartidor no pudo seguir. Ya estamos buscando otro para tu pedido.',
      data: { type: 'order_reassigning', orderId: id },
    });
  }
  return () => { void startOrderMatchingCycle(id); };
}

async function _soltarMandado(driverId: string, id: string): Promise<() => void> {
  const r = await prisma.errand.updateMany({
    where: { id, driverId, status: { in: ESTADOS_SOLTABLES.errand as ErrandStatus[] } },
    data: {
      status: 'SEARCHING', driverId: null, driverName: null, driverPhone: null, operatorId: null,
      acceptedAt: null, etaMinutes: null, etaSetAt: null, noDriverNotifiedAt: null,
    },
  });
  if (r.count === 0) {
    throw await _motivoDeRechazo('errand', await prisma.errand.findUnique({
      where: { id }, select: { driverId: true, status: true },
    }), driverId);
  }
  const e = await prisma.errand.findUnique({
    where: { id },
    select: { userId: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true },
  });
  void avisarEstadoMandado(id);
  if (e?.userId) {
    void sendPushToClient(e.userId, {
      title: 'Buscando otro mandadero',
      body: 'Tu mandadero no pudo seguir. Ya estamos buscando otro.',
      data: { type: 'errand_reassigning', errandId: id },
    });
  }
  // Mismo orden que el rescate: la recogida, si no la entrega del cliente.
  return () => {
    void startErrandMatchingCycle(
      id,
      e?.pickupLat ?? e?.dropoffLat ?? INTERCITY_CITY_COORDS.pamplona.lat,
      e?.pickupLng ?? e?.dropoffLng ?? INTERCITY_CITY_COORDS.pamplona.lng,
    );
  };
}
