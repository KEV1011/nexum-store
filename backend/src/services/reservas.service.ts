/**
 * Reservas que un conductor puede APARTAR con antelación.
 *
 * Hasta ahora un viaje programado se guardaba y salía a buscar conductor 15
 * minutos antes de la hora. Eso es lo que hace Uber y para una plataforma está
 * bien, pero NO es como trabaja una empresa de taxis ni es lo que necesita
 * quien reserva: el estudiante que entra a clase a las 6:00 no quiere que a
 * las 5:45 «se empiece a buscar», quiere dormirse sabiendo que tiene un taxi
 * apartado. Y el taxista quiere llegar a la noche con la mañana cuadrada.
 *
 * Por eso la reserva se publica como un tablero: el conductor la ve, la
 * aparta, y el pasajero pasa de «reservado» a «Juan te recoge a las 6:00».
 *
 * CUATRO REGLAS que sostienen esto, y ninguna es cosmética:
 *
 *  1. Apartar es ATÓMICO (`driverId: null` en el `where` de un `updateMany`).
 *     Dos taxistas tocando «Apartar» a la vez no pueden llevarse la misma
 *     reserva: el segundo recibe un no y el pasajero no termina con dos carros.
 *
 *  2. Un conductor no puede acaparar. Sin tope, quien aparta diez y cumple dos
 *     deja a ocho pasajeros tirados, y el daño no lo paga él.
 *
 *  3. Una reserva apartada QUE NO SE CUMPLE es peor que no tener reserva: el
 *     pasajero se confió y ya no le queda tiempo de buscar otra cosa. Por eso
 *     hay dos barridos —`activarReservas` a la hora de salir y
 *     `liberarReservasIncumplidas` pasada la hora acordada— y el segundo
 *     devuelve el viaje a la búsqueda normal en cuanto se ve que el conductor
 *     no apareció.
 *
 *  4. Tener una reserva para mañana NO ocupa al conductor hoy. Parece obvio y
 *     no lo es: el viaje queda en la tabla con su `driverId` puesto, y las
 *     consultas que preguntan «¿le queda algún servicio abierto?» lo contaban
 *     como trabajo en curso (ver `guardaNoOcupa` en `lib/estado-terminal`).
 */

import { TransportType, TripStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { tarifaDe } from '../lib/tarifa-categoria';
import { motivoParaNoConectar } from './driver-online-guard';
import { sendPushToClient, sendPushToDriver } from './push.service';
import { maskPhone } from './safe-contact.service';
import { startMatchingCycle, buildTripRequestDTO } from './matching.service';
import { notifyClientTripUpdateById } from './client.service';

/** Cuántas reservas puede tener apartadas un conductor a la vez. */
export const TOPE_RESERVAS_POR_CONDUCTOR = Number(
  process.env['RESERVAS_TOPE_CONDUCTOR'] ?? 6,
);

/** Hasta cuántos días adelante se le muestran reservas al conductor. */
const VENTANA_DIAS = 7;

/**
 * Cuánto se le espera al conductor que apartó, contado desde la hora acordada.
 *
 * Pasado eso la reserva vuelve a la búsqueda abierta. Corto a propósito: cada
 * minuto que se le espera es un minuto que el pasajero pierde, y ya va tarde.
 */
export const GRACIA_MIN = Number(process.env['RESERVA_GRACIA_MIN'] ?? 5);

/**
 * Sin latido reciente no hay conductor.
 *
 * Más generoso que los 120 s del despacho: aquí no se está eligiendo a quién
 * ofrecerle un viaje, se está decidiendo si quitarle uno que ya tenía apartado.
 */
const SIN_SENAL_MIN = Number(process.env['RESERVA_SIN_SENAL_MIN'] ?? 10);

export class ReservaError extends Error {}

export interface ReservaDTO {
  id: string;
  requestRef: string;
  serviceType: string;
  /** Cuándo tiene que estar en el punto de recogida. */
  scheduledFor: string;
  originAddress: string;
  destAddress: string;
  estimatedFare: number | null;
  distanceKm: number | null;
  /** Ya empezó la ventana de salida: el conductor debería ir saliendo. */
  enCurso: boolean;
  /** Solo en las que ya apartó: al pasajero no se le enseña a desconocidos. */
  passengerName?: string;
  /**
   * Enmascarado, como en todo el resto de la plataforma: el número real no se
   * cruza entre las partes. Sirve de referencia, no para marcar.
   */
  passengerPhone?: string;
  /**
   * La oferta con la MISMA forma que `trip_request`, solo en las reservas ya
   * activadas.
   *
   * Está aquí porque sin ella la función no serviría de nada: la app del
   * conductor construye su viaje activo a partir de la oferta que recibió por
   * el socket, y una reserva apartada hace días no tiene ninguna. Sin esto, al
   * dar las 6:00 se le avisaba de un viaje que no podía empezar.
   */
  oferta?: unknown;
}

const _CAMPOS = {
  id: true,
  requestRef: true,
  serviceType: true,
  status: true,
  scheduledFor: true,
  originAddress: true,
  destAddress: true,
  estimatedFare: true,
  distanceKm: true,
} as const;

interface _Fila {
  id: string;
  requestRef: string;
  serviceType: TransportType;
  status: TripStatus;
  scheduledFor: Date | null;
  originAddress: string;
  destAddress: string;
  estimatedFare: number | null;
  distanceKm: number | null;
}

function _aDTO(t: _Fila): ReservaDTO {
  return {
    id: t.id,
    requestRef: t.requestRef,
    serviceType: t.serviceType,
    scheduledFor: (t.scheduledFor ?? new Date()).toISOString(),
    originAddress: t.originAddress,
    destAddress: t.destAddress,
    estimatedFare: t.estimatedFare,
    distanceKm: t.distanceKm,
    // SCHEDULED = todavía falta; cualquier otro estado significa que el barrido
    // ya la activó y el conductor tiene que estar yendo.
    enCurso: t.status !== TripStatus.SCHEDULED,
  };
}

/** El conductor, con lo que hace falta para saber qué reservas le tocan. */
async function _conductor(driverId: string) {
  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      id: true,
      name: true,
      citySlug: true,
      vehicles: { where: { isActive: true }, take: 1, select: { type: true } },
    },
  });
  if (!d) throw new ReservaError('No encontramos tu perfil de conductor.');
  return d;
}

/**
 * Los tipos de servicio que puede atender el vehículo del conductor.
 *
 * Sale de `tarifaDe`, la MISMA fuente que usa el despacho para decidir a quién
 * le ofrece un viaje. Si aquí se listara por otro criterio, un taxista vería en
 * el tablero reservas que el despacho nunca le habría ofrecido, y al revés.
 */
export function serviciosQuePuedeTomar(tipoVehiculo: string | null): TransportType[] {
  if (!tipoVehiculo) return [];
  const programables: TransportType[] = [
    TransportType.TAXI,
    TransportType.PARTICULAR,
    TransportType.MOTO,
    TransportType.ENVIOS,
  ];
  return programables.filter((s) => {
    const tarifa = tarifaDe(s);
    // Sin categoría declarada (envíos) no hay nada que prometer: lo puede hacer
    // cualquier vehículo, igual que en el despacho.
    if (!tarifa) return true;
    return tarifa.tiposVehiculo.includes(tipoVehiculo);
  });
}

/** Reservas sin conductor que este conductor podría atender. */
export async function listarReservasLibres(driverId: string): Promise<ReservaDTO[]> {
  const d = await _conductor(driverId);
  const servicios = serviciosQuePuedeTomar(d.vehicles[0]?.type ?? null);
  if (servicios.length === 0) return [];

  const hasta = new Date(Date.now() + VENTANA_DIAS * 24 * 60 * 60 * 1000);
  const libres = await prisma.trip.findMany({
    where: {
      status: TripStatus.SCHEDULED,
      driverId: null,
      scheduledFor: { gt: new Date(), lte: hasta },
      serviceType: { in: servicios },
      // Mismo criterio de plaza que el resto de la operación. Sin ciudad en la
      // ficha del conductor no se filtra: es mejor enseñarle de más que dejarle
      // el tablero vacío por un dato que quizá nunca se le pidió.
      ...(d.citySlug ? { citySlug: d.citySlug } : {}),
    },
    orderBy: { scheduledFor: 'asc' },
    take: 50,
    select: _CAMPOS,
  });
  return libres.map(_aDTO);
}

/**
 * Las que ya apartó, con los datos del pasajero.
 *
 * Incluye las que el barrido ya activó (ACCEPTED): si al dar la hora la reserva
 * desapareciera de esta lista, el conductor perdería de vista justo la que
 * tiene que atender ahora.
 */
export async function listarMisReservas(driverId: string): Promise<ReservaDTO[]> {
  const mias = await prisma.trip.findMany({
    where: {
      driverId,
      status: { in: [TripStatus.SCHEDULED, TripStatus.ACCEPTED] },
      scheduledFor: { not: null },
    },
    orderBy: { scheduledFor: 'asc' },
    select: {
      ..._CAMPOS,
      passengerName: true,
      passenger: { select: { name: true, phone: true } },
    },
  });
  return Promise.all(
    mias.map(async (t) => ({
      ..._aDTO(t),
      passengerName: t.passenger?.name ?? t.passengerName ?? undefined,
      passengerPhone: maskPhone(t.passenger?.phone),
      // Solo para las que ya están en marcha: es el dato con el que la app
      // arranca el viaje, y pedirlo para las siete de la semana que viene
      // serían siete consultas por cada vez que se abre la pantalla.
      ...(t.status === TripStatus.ACCEPTED
        ? { oferta: (await buildTripRequestDTO(t.id)) ?? undefined }
        : {}),
    })),
  );
}

/**
 * Aparta una reserva para este conductor.
 *
 * Lanza `ReservaError` con el motivo en español si no se pudo: el conductor
 * tiene que saber POR QUÉ, o va a volver a tocar el botón.
 */
export async function apartarReserva(
  driverId: string,
  tripId: string,
): Promise<ReservaDTO> {
  // Las mismas condiciones que para ponerse en línea. Apartar es comprometerse
  // a prestar un servicio: quien no puede trabajar hoy por documentos vencidos
  // tampoco puede comprometerse para mañana.
  const motivo = await motivoParaNoConectar(driverId);
  if (motivo) throw new ReservaError(motivo.error);

  const d = await _conductor(driverId);
  const servicios = serviciosQuePuedeTomar(d.vehicles[0]?.type ?? null);

  const yaTiene = await prisma.trip.count({
    where: { driverId, status: TripStatus.SCHEDULED },
  });
  if (yaTiene >= TOPE_RESERVAS_POR_CONDUCTOR) {
    throw new ReservaError(
      `Ya tienes ${TOPE_RESERVAS_POR_CONDUCTOR} reservas apartadas. ` +
        'Cumple o suelta alguna antes de tomar otra.',
    );
  }

  const objetivo = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { serviceType: true, status: true, driverId: true, scheduledFor: true },
  });
  if (!objetivo) throw new ReservaError('Esa reserva ya no existe.');
  if (objetivo.status !== TripStatus.SCHEDULED || objetivo.driverId) {
    throw new ReservaError('Otro conductor tomó esa reserva primero.');
  }
  if (!servicios.includes(objetivo.serviceType)) {
    throw new ReservaError(
      'Tu vehículo no corresponde al servicio que pidió el pasajero.',
    );
  }

  // Toma ATÓMICA: el `driverId: null` del where es lo que impide que dos
  // conductores se lleven la misma. Las comprobaciones de arriba existen para
  // dar un mensaje útil; ESTA es la que decide.
  const tomada = await prisma.trip.updateMany({
    where: { id: tripId, status: TripStatus.SCHEDULED, driverId: null },
    data: { driverId },
  });
  if (tomada.count === 0) {
    throw new ReservaError('Otro conductor tomó esa reserva primero.');
  }

  const t = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    select: { ..._CAMPOS, passengerId: true },
  });

  // El pasajero se entera AHORA, que es el valor de todo esto: se acuesta
  // sabiendo que tiene taxi.
  if (t.passengerId) {
    void sendPushToClient(t.passengerId, {
      title: 'Ya tienes conductor apartado',
      body: `${d.name} te recoge ${cuandoEnTexto(t.scheduledFor)}.`,
      data: { type: 'trip_reservado', tripId },
    });
  }
  void notifyClientTripUpdateById(tripId);

  return _aDTO(t);
}

/** Suelta una reserva apartada: vuelve al tablero para otro conductor. */
export async function soltarReserva(driverId: string, tripId: string): Promise<void> {
  // Solo se puede soltar mientras siga SCHEDULED. Una vez activada el viaje ya
  // es un viaje normal y se cancela por el camino de siempre, que avisa al
  // pasajero como toca en vez de dejarlo colgado.
  const soltada = await prisma.trip.updateMany({
    where: { id: tripId, driverId, status: TripStatus.SCHEDULED },
    data: { driverId: null },
  });
  if (soltada.count === 0) {
    throw new ReservaError('Esa reserva ya no es tuya o ya salió a buscar.');
  }

  const t = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { passengerId: true, scheduledFor: true },
  });
  if (t?.passengerId) {
    // Se avisa SIEMPRE. Que el conductor suelte es legítimo; dejar al pasajero
    // creyendo que tiene carro, no. Todavía hay tiempo de que otro la tome, y
    // el barrido la sacará a buscar igual.
    void sendPushToClient(t.passengerId, {
      title: 'Tu reserva volvió a la búsqueda',
      body:
        'El conductor no podrá tomarla. Buscaremos otro para ' +
        `${cuandoEnTexto(t.scheduledFor)}.`,
      data: { type: 'trip_reserva_liberada', tripId },
    });
  }
  void notifyClientTripUpdateById(tripId);
}

// ── Canal al conductor ───────────────────────────────────────────────────────
//
// Mismo patrón de inyección que el resto: el servicio no importa sockets, es
// `ws.handler` quien le pasa el canal al arrancar. Así se evitan los ciclos de
// importación que ya obligaron a mover código de sitio antes.

let _sendToDriver: ((driverId: string, msg: Record<string, unknown>) => void) | null = null;

export function registerReservaSendToDriver(
  fn: (driverId: string, msg: Record<string, unknown>) => void,
): void {
  _sendToDriver = fn;
}

// ── Barrido 1: activar las reservas a las que les llegó la hora ──────────────

/**
 * Pasa a ACCEPTED las reservas apartadas cuya ventana de salida ya empezó.
 *
 * Es el gemelo de `despacharProgramados` para los viajes que YA tienen
 * conductor: aquel saca a buscar, este avisa al que se comprometió. Corre en el
 * mismo minuto y por el mismo motivo —consultar la base en vez de guardar un
 * temporizador— porque un `setTimeout` puesto al apartar se pierde en el
 * siguiente despliegue, y en Render los hay a diario.
 *
 * Devuelve cuántas activó.
 */
export async function activarReservas(): Promise<number> {
  const pendientes = await prisma.trip.findMany({
    where: {
      status: TripStatus.SCHEDULED,
      driverId: { not: null },
      searchFrom: { lte: new Date() },
    },
    select: { ..._CAMPOS, driverId: true, passengerId: true },
    take: 100,
  });

  let activadas = 0;
  for (const t of pendientes) {
    if (!t.driverId) continue;

    // Documentos vencidos o identidad bloqueada: no puede prestar el servicio,
    // así que la reserva sale a buscar como cualquier otro viaje. Vale la pena
    // comprobarlo aquí y no solo al apartar, porque entre una cosa y otra pudo
    // pasar una semana y vencerse un SOAT.
    const motivo = await motivoParaNoConectar(t.driverId);
    if (motivo) {
      await _devolverALaBusqueda(
        t,
        'Tu conductor no pudo tomar el viaje. Estamos buscándote otro.',
      );
      continue;
    }

    const activada = await prisma.trip.updateMany({
      where: { id: t.id, status: TripStatus.SCHEDULED, driverId: t.driverId },
      data: { status: TripStatus.ACCEPTED, acceptedAt: new Date() },
    });
    if (activada.count === 0) continue;

    // El conductor NO se marca ON_TRIP aquí. Todavía no ha recogido a nadie y
    // puede estar terminando otro servicio; marcarlo lo sacaría del despacho
    // por adelantado. Pasa a ON_TRIP por el camino normal, cuando arranca.
    _sendToDriver?.(t.driverId, {
      type: 'reserva_activa',
      tripId: t.id,
      scheduledFor: t.scheduledFor?.toISOString() ?? null,
      originAddress: t.originAddress,
      destAddress: t.destAddress,
    });
    void sendPushToDriver(t.driverId, {
      title: 'Tu reserva empieza ahora',
      body: `Recogida en ${t.originAddress}.`,
      data: { type: 'reserva_activa', tripId: t.id },
    });
    if (t.passengerId) {
      void sendPushToClient(t.passengerId, {
        title: 'Tu conductor va en camino',
        body: 'El conductor que apartaste ya salió hacia el punto de recogida.',
        data: { type: 'trip_accepted', tripId: t.id },
      });
    }
    void notifyClientTripUpdateById(t.id);
    activadas++;
  }
  return activadas;
}

// ── Barrido 2: la reserva que no se cumplió ──────────────────────────────────

/**
 * Devuelve a la búsqueda abierta las reservas cuyo conductor no apareció.
 *
 * El criterio es la SEÑAL, no el reloj del conductor: se le quita la reserva a
 * quien, pasada la hora acordada más la gracia, sigue sin haber avanzado el
 * viaje Y lleva `SIN_SENAL_MIN` minutos sin reportar posición. Si está en línea
 * y moviéndose se le respeta aunque no haya tocado «voy en camino»: puede ir
 * conduciendo, y quitarle el viaje en ese momento sería el peor error posible.
 *
 * Devuelve cuántas liberó.
 */
export async function liberarReservasIncumplidas(): Promise<number> {
  const ahora = Date.now();
  const corteHora = new Date(ahora - GRACIA_MIN * 60 * 1000);
  const corteSenal = new Date(ahora - SIN_SENAL_MIN * 60 * 1000);

  const incumplidas = await prisma.trip.findMany({
    where: {
      status: TripStatus.ACCEPTED,
      driverId: { not: null },
      scheduledFor: { not: null, lte: corteHora },
      driver: {
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: corteSenal } }],
      },
    },
    select: { ..._CAMPOS, driverId: true, passengerId: true },
    take: 100,
  });

  let liberadas = 0;
  for (const t of incumplidas) {
    const ok = await _devolverALaBusqueda(
      t,
      'Tu conductor no dio señales. Estamos buscándote otro ahora mismo.',
    );
    if (ok) liberadas++;
  }
  if (liberadas > 0) {
    console.warn(
      `[Reservas] ${liberadas} reserva(s) liberada(s): el conductor no apareció.`,
    );
  }
  return liberadas;
}

/**
 * Quita el conductor y saca el viaje a buscar como uno normal.
 *
 * La transición es atómica sobre el estado en el que se leyó la fila: si el
 * conductor tocó «voy en camino» justo ahora, el `updateMany` no encuentra nada
 * y no se le quita nada.
 */
async function _devolverALaBusqueda(
  t: _Fila & { driverId: string | null; passengerId: string | null },
  aviso: string,
): Promise<boolean> {
  const liberada = await prisma.trip.updateMany({
    where: { id: t.id, status: t.status, driverId: t.driverId },
    data: { status: TripStatus.SEARCHING, driverId: null, acceptedAt: null },
  });
  if (liberada.count === 0) return false;

  const origen = await prisma.trip.findUnique({
    where: { id: t.id },
    select: { originLat: true, originLng: true },
  });
  if (origen) void startMatchingCycle(t.id, origen.originLat, origen.originLng);

  if (t.driverId) {
    _sendToDriver?.(t.driverId, { type: 'reserva_liberada', tripId: t.id });
  }
  if (t.passengerId) {
    void sendPushToClient(t.passengerId, {
      title: 'Buscando otro conductor',
      body: aviso,
      data: { type: 'trip_searching', tripId: t.id },
    });
  }
  void notifyClientTripUpdateById(t.id);
  return true;
}

/** «lunes, 06:00», en hora de Colombia. */
export function cuandoEnTexto(fecha: Date | null): string {
  if (!fecha) return 'a la hora acordada';
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}
