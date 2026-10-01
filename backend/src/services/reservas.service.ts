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

import { TransportType, TripStatus, VehicleType } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { tarifaDe } from '../lib/tarifa-categoria';
import { motivoParaNoConectar } from './driver-online-guard';
import { sendPushToClient, sendPushToDriver } from './push.service';
import { maskPhone } from './safe-contact.service';
import { startMatchingCycle, buildTripRequestDTO } from './matching.service';
import { stopsFromDb } from '../lib/trip-stops';
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

/**
 * Por qué se le quitó una reserva a un conductor.
 *
 * Son dos conversaciones distintas con él, y por eso no se guarda un booleano:
 * seis por papeles vencidos es un trámite, seis por no aparecer es dejar tirada
 * a seis personas.
 */
export type MotivoIncumplimiento = 'sin_senal' | 'documentos';

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
  /**
   * Por dónde pasa, en orden. Solo los nombres: en el tablero se LEE, no se
   * dibuja.
   *
   * Hace falta antes de apartar y no después: tres paradas cambian lo que dura
   * la carrera, y un taxista que apartó creyendo que era un trayecto directo
   * puede no poder cumplirla — que es exactamente lo que esta función existe
   * para evitar.
   */
  stops?: string[];
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
  stops: true,
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
  stops?: unknown;
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
    ...(() => {
      const p = (stopsFromDb(t.stops) ?? []).map((x) => x.name).filter(Boolean);
      return p.length > 0 ? { stops: p } : {};
    })(),
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
  return SERVICIOS_PROGRAMABLES.filter((s) => {
    const tarifa = tarifaDe(s);
    // Sin categoría declarada (envíos) no hay nada que prometer: lo puede hacer
    // cualquier vehículo, igual que en el despacho.
    if (!tarifa) return true;
    return tarifa.tiposVehiculo.includes(tipoVehiculo);
  });
}

/** Los servicios que se pueden programar con antelación. */
export const SERVICIOS_PROGRAMABLES: readonly TransportType[] = [
  TransportType.TAXI,
  TransportType.PARTICULAR,
  TransportType.MOTO,
  TransportType.ENVIOS,
] as const;

/**
 * Todos los tipos de vehículo de la flota. Se listan aquí porque un servicio
 * sin categoría declarada (envíos) lo puede hacer cualquiera, y para consultar
 * la base hace falta la lista explícita.
 */
const TODOS_LOS_TIPOS: readonly string[] = [
  'TAXI', 'PARTICULAR', 'MOTO', 'TURBO', 'CAMION', 'MULA', 'VAN', 'BUSETA',
] as const;

/**
 * La INVERSA de `serviciosQuePuedeTomar`: qué vehículos atienden un servicio.
 *
 * Existe porque el tablero pregunta «dado este conductor, qué reservas ve» y el
 * aviso pregunta «dada esta reserva, a quién se le dice». Son la misma regla
 * leída en dos direcciones, y si cada una tuviera su propia tabla acabarían
 * discrepando: a alguien se le avisaría de una reserva que su tablero no le
 * muestra, o al contrario. `reservas-coherencia.test.ts` comprueba las dos.
 */
export function tiposVehiculoParaServicio(servicio: TransportType): readonly string[] {
  return tarifaDe(servicio)?.tiposVehiculo ?? TODOS_LOS_TIPOS;
}

/**
 * Reservas sin conductor que este conductor podría atender.
 *
 * Devuelve también un `aviso` cuando la lista está vacía POR UN MOTIVO y no
 * porque no haya trabajo. Sin esto, un conductor sin vehículo activo veía «no
 * hay reservas libres ahora mismo» para siempre, revisaba cada mañana, y nunca
 * se enteraba de que el tablero no le iba a enseñar nada hasta registrar su
 * carro. Un estado vacío que esconde su causa es el mismo error que ya se
 * corrigió en media plataforma.
 */
export async function listarReservasLibres(
  driverId: string,
): Promise<{ reservas: ReservaDTO[]; aviso?: string }> {
  const d = await _conductor(driverId);
  const servicios = serviciosQuePuedeTomar(d.vehicles[0]?.type ?? null);
  if (servicios.length === 0) {
    return {
      reservas: [],
      aviso: d.vehicles.length === 0
        ? 'Registra tu vehículo para poder apartar reservas.'
        : 'Tu tipo de vehículo no atiende ninguno de los servicios que se reservan.',
    };
  }

  const hasta = new Date(Date.now() + VENTANA_DIAS * 24 * 60 * 60 * 1000);
  const libres = await prisma.trip.findMany({
    where: {
      status: TripStatus.SCHEDULED,
      driverId: null,
      scheduledFor: { gt: new Date(), lte: hasta },
      serviceType: { in: servicios },
      // Plaza: se excluye lo que es de OTRA ciudad, nunca lo que no tiene
      // ciudad.
      //
      // La asimetría es el defecto que dejaba el tablero vacío: el conductor
      // recibe `citySlug` en CADA latido, pero el viaje solo lo tiene si
      // `plazaDeCoordenadas` resolvió al crearlo (fuera de rango, lista de
      // municipios aún sin cargar, o viajes anteriores a esa columna). Con
      // una igualdad estricta, esos viajes desaparecían para todo el mundo y
      // sin un solo mensaje — comprobado contra PostgreSQL real: reserva con
      // `citySlug` nulo, conductor en Pamplona, tablero en blanco.
      //
      // Un dato que falta no puede excluir. Lo que sí excluye es un dato
      // presente y distinto: una reserva de Cúcuta no le sirve a un taxista
      // de Pamplona.
      ...(d.citySlug
        ? { OR: [{ citySlug: d.citySlug }, { citySlug: null }] }
        : {}),
    },
    orderBy: { scheduledFor: 'asc' },
    take: 50,
    select: _CAMPOS,
  });
  return { reservas: libres.map(_aDTO) };
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

/**
 * Avisa a los conductores de que hay una reserva nueva en el tablero.
 *
 * ESTE ERA EL AGUJERO. El tablero funcionaba y la reserva se creaba bien, pero
 * **a nadie se le decía que existía**: el único sitio donde aparecía era una
 * tarjeta del home cuyo contador se lee UNA vez al construir la pantalla. Un
 * taxista con la app abierta a las 22:05, cuando alguien reserva para las 6:00,
 * seguía viendo «Sin reservas por ahora» toda la noche. Desde fuera se ve
 * exactamente como lo describió el usuario: el cliente aparta un trayecto y no
 * le llega a ningún conductor.
 *
 * NO ES UNA OFERTA, y la diferencia es deliberada. Un `trip_request` interrumpe
 * con quince segundos de cuenta atrás porque hay alguien esperando en la calle;
 * una reserva para mañana no puede hacer eso. Esto es un aviso: lo mira cuando
 * pueda, entra al tablero y la aparta si le cuadra.
 *
 * SE AVISA TAMBIÉN AL QUE ESTÁ FUERA DE LÍNEA, que parece un descuido y es el
 * punto: el conductor que va camino a su casa es justo el que quiere cuadrar la
 * mañana siguiente. Filtrar por «en línea» dejaría la función para quien ya
 * está trabajando, que es quien menos la necesita.
 *
 * Best-effort de principio a fin: si esto falla, la reserva ya está creada y el
 * tablero la muestra igual. Nunca puede tumbar la petición del pasajero.
 */
export async function notificarNuevaReserva(tripId: string): Promise<number> {
  const t = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true, serviceType: true, status: true, driverId: true,
      scheduledFor: true, citySlug: true, originAddress: true,
      destAddress: true, estimatedFare: true,
    },
  });
  // Solo las que de verdad están en el tablero: si el barrido ya la activó o
  // alguien la apartó entre medias, avisar sería mandar a diez conductores a
  // pelearse por algo que ya no está.
  if (!t || t.status !== TripStatus.SCHEDULED || t.driverId) return 0;

  const tipos = tiposVehiculoParaServicio(t.serviceType);
  const candidatos = await prisma.driver.findMany({
    where: {
      // Su vehículo activo tiene que servir para ESTE servicio, con la misma
      // regla que el tablero — leída al revés.
      vehicles: { some: { isActive: true, type: { in: tipos as VehicleType[] } } },
      // Plaza: la MISMA expresión que en `listarReservasLibres`, invertida.
      // Allí un viaje sin ciudad no se le oculta a nadie; aquí, por tanto, una
      // reserva sin ciudad se le avisa a todos, y una de Pamplona solo a quien
      // está en Pamplona o todavía no tiene plaza resuelta.
      ...(t.citySlug ? { OR: [{ citySlug: t.citySlug }, { citySlug: null }] } : {}),
    },
    select: { id: true },
    // Tope de cordura. En una plaza con veinte taxis se avisa a los veinte: es
    // un tablero, el primero que la aparta se la lleva.
    take: 200,
  });

  const cuando = cuandoEnTexto(t.scheduledFor);
  const constancia: Array<{ tripId: string; driverId: string; resultado: string }> = [];
  let avisados = 0;
  for (const c of candidatos) {
    // Se pregunta por cada candidato en vez de repetir las condiciones en SQL.
    // `motivoParaNoConectar` es la MISMA función que decide si puede ponerse en
    // línea y la que `apartarReserva` vuelve a llamar: avisarle a quien al
    // tocar «Apartar» recibiría un no es la forma más rápida de enseñarle a
    // ignorar nuestros avisos. Las reservas son pocas al día, así que preguntar
    // una vez por candidato sale barato.
    const motivo = await motivoParaNoConectar(c.id).catch(() => null);
    if (motivo) {
      // Se guarda TAMBIÉN al que no se le avisó, con su motivo. Es la mitad
      // que de verdad se consulta: «a mí no me llegó» se responde con
      // «documentos vencidos el martes», no con una lista de los que sí.
      constancia.push({ tripId: t.id, driverId: c.id, resultado: motivo.error });
      continue;
    }

    _sendToDriver?.(c.id, {
      type: 'reserva_nueva',
      tripId: t.id,
      serviceType: t.serviceType,
      scheduledFor: t.scheduledFor?.toISOString() ?? null,
      originAddress: t.originAddress,
      destAddress: t.destAddress,
      estimatedFare: t.estimatedFare,
    });
    void sendPushToDriver(c.id, {
      title: 'Nueva reserva disponible',
      body: `${cuando} · ${t.originAddress} → ${t.destAddress}. Ábrela para apartarla.`,
      data: { type: 'reserva_nueva', tripId: t.id },
    });
    constancia.push({ tripId: t.id, driverId: c.id, resultado: RESULTADO_ENVIADO });
    avisados++;
  }

  // La constancia se escribe de una vez y sin esperar: el aviso ya salió, y un
  // fallo al registrarlo no puede deshacerlo ni retener al pasajero que acaba
  // de reservar.
  if (constancia.length > 0) {
    void prisma.reservaAviso
      .createMany({ data: constancia })
      .catch((e) => console.error('[Reservas] no se pudo registrar el aviso:', e));
  }
  return avisados;
}

/** Cuántos días se guarda el registro de avisos. */
const AVISOS_RETENCION_DIAS = Number(process.env['RESERVA_AVISOS_RETENCION_DIAS'] ?? 60);

/** Purga del barrido diario. Es registro de operación, no historia. */
export async function purgarAvisosDeReserva(): Promise<number> {
  const corte = new Date(Date.now() - AVISOS_RETENCION_DIAS * 24 * 60 * 60_000);
  const r = await prisma.reservaAviso.deleteMany({ where: { createdAt: { lt: corte } } });
  return r.count;
}

/**
 * Quién fue avisado de una reserva y quién no, para el panel.
 *
 * Responde la pregunta que hoy no tiene respuesta: cuando un conductor dice
 * «a mí no me llegó», o se ve su fila con el motivo, o se ve que ni siquiera
 * fue candidato — y eso último también es una respuesta («tu vehículo no
 * atiende ese servicio», «esa reserva es de otra plaza»).
 */
export async function avisosDeReserva(tripId: string): Promise<Array<{
  driverId: string;
  driverName: string;
  resultado: string;
  enviado: boolean;
  createdAt: string;
}>> {
  const filas = await prisma.reservaAviso.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  if (filas.length === 0) return [];
  const nombres = new Map(
    (await prisma.driver.findMany({
      where: { id: { in: filas.map((f) => f.driverId) } },
      select: { id: true, name: true },
    })).map((d) => [d.id, d.name]),
  );
  return filas.map((f) => ({
    driverId: f.driverId,
    driverName: nombres.get(f.driverId) ?? '—',
    resultado: f.resultado,
    enviado: f.resultado === RESULTADO_ENVIADO,
    createdAt: f.createdAt.toISOString(),
  }));
}

/** El valor que marca «sí se le mandó». Comparado en más de un sitio. */
export const RESULTADO_ENVIADO = 'enviado';

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
  // Vuelve al tablero, así que vuelve a avisarse: sin esto, una reserva soltada
  // quedaría tan invisible como estaba antes de que existiera el aviso, y esa
  // es la que más corre (ya se le prometió al pasajero y queda menos tiempo).
  void notificarNuevaReserva(tripId).catch(() => { /* best-effort */ });
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
        'documentos',
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

// ── Barrido 1.5: el recordatorio de media hora antes ─────────────────────────

/**
 * Con cuánta antelación se avisa de la carrera.
 *
 * Son treinta minutos y no quince (lo que tarda la activación) porque esto no
 * es el aviso de salir, es el de ORGANIZARSE: el taxista que tiene la reserva
 * de las 6:00 necesita saber a las 5:30 que no puede tomar otra carrera larga,
 * y el pasajero necesita estar listo cuando el carro llegue a la puerta.
 */
export const RECORDATORIO_MIN = Number(
  process.env['RESERVA_RECORDATORIO_MIN'] ?? 30,
);

/**
 * Avisa a LOS DOS que la carrera es en media hora.
 *
 * POR QUÉ HACÍA FALTA. La reserva solo avisaba al activarse —quince minutos
 * antes, y el push al conductor decía «empieza ahora»—, así que quien apartó
 * una carrera el lunes para el viernes a las 6:00 no recibía nada hasta ese
 * momento: si no abría la app, se le pasaba. Y al pasajero no se le avisaba de
 * nada hasta que el conductor ya iba en camino.
 *
 * SE AVISA UNA VEZ (`reminderSentAt`). El barrido corre cada minuto; sin la
 * marca, al pasajero y al conductor les sonaría el teléfono treinta veces.
 *
 * SOLO A LAS RESERVAS QUE YA TIENEN CONDUCTOR, a propósito. A las que están
 * esperando a que alguien las aparte no se les manda nada: la búsqueda no ha
 * empezado todavía (arranca quince minutos antes) y decirle al pasajero a
 * media hora que «aún no hay conductor» lo alarmaría por algo que es
 * perfectamente normal en ese momento.
 *
 * Devuelve cuántos recordatorios salieron.
 */
export async function recordarReservas(): Promise<number> {
  const limite = new Date(Date.now() + RECORDATORIO_MIN * 60 * 1000);

  const proximas = await prisma.trip.findMany({
    where: {
      status: TripStatus.SCHEDULED,
      driverId: { not: null },
      reminderSentAt: null,
      // Entre ahora y la ventana: una reserva cuya hora ya pasó no se
      // «recuerda», la resuelve el barrido de activación o el de incumplidas.
      scheduledFor: { not: null, gt: new Date(), lte: limite },
    },
    select: { ..._CAMPOS, driverId: true, passengerId: true },
    take: 100,
  });

  let avisados = 0;
  for (const t of proximas) {
    if (!t.driverId || !t.scheduledFor) continue;

    // La marca se escribe PRIMERO y con guarda: con dos instancias de Render
    // —o con un barrido que se solapa con el anterior— los dos avisarían.
    const marca = await prisma.trip.updateMany({
      where: { id: t.id, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (marca.count === 0) continue;

    // `hour12: false` NO es opcional: sin él sale «10:14 p. m.», que es lo
    // que escribió la primera versión y cazó el E2E. Toda la plataforma dice
    // la hora en 24 h —las apps la construyen a mano así— y mezclar los dos
    // formatos en el mismo aviso es el camino a confundir las 6 de la mañana
    // con las 6 de la tarde en una reserva.
    const hora = t.scheduledFor.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota',
    });

    _sendToDriver?.(t.driverId, {
      type: 'reserva_recordatorio',
      tripId: t.id,
      scheduledFor: t.scheduledFor.toISOString(),
      originAddress: t.originAddress,
      destAddress: t.destAddress,
    });
    void sendPushToDriver(t.driverId, {
      title: `Tu carrera es a las ${hora}`,
      body: `En ${RECORDATORIO_MIN} minutos: recogida en ${t.originAddress}.`,
      data: { type: 'reserva_recordatorio', tripId: t.id },
    });
    if (t.passengerId) {
      void sendPushToClient(t.passengerId, {
        title: `Tu viaje es a las ${hora}`,
        body: `Tu conductor te recoge en ${RECORDATORIO_MIN} minutos en `
          + `${t.originAddress}.`,
        data: { type: 'reserva_recordatorio', tripId: t.id },
      });
    }
    avisados++;
  }
  return avisados;
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
      'sin_senal',
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
  motivo: MotivoIncumplimiento,
): Promise<boolean> {
  const liberada = await prisma.trip.updateMany({
    where: { id: t.id, status: t.status, driverId: t.driverId },
    data: {
      status: TripStatus.SEARCHING,
      driverId: null,
      acceptedAt: null,
      // La constancia se escribe EN LA MISMA escritura que borra `driverId`.
      // Si fueran dos, un fallo entre ellas dejaría la reserva libre y al
      // conductor sin registro — que es exactamente el estado de antes.
      noShowDriverId: t.driverId,
      noShowAt: new Date(),
      noShowReason: motivo,
    },
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
