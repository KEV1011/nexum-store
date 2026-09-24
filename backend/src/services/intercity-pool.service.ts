import { sanitizeStops, stopsFromDb } from '../lib/trip-stops';
import {
  IntercityCity,
  PooledTripStatus,
  PublishPooledTripDTO,
  BookSeatsDTO,
  PooledTripDTO,
  SeatBookingDTO,
  SeatBookingStatus,
  MapaAsientosDTO,
} from '../types';
import {
  getIntercityRoute,
  getMaxFarePerSeat,
  INTERCITY_REMOVE_CAP,
  INTERCITY_DUAL_MODEL,
} from '../config/constants';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  esTipoConSillas,
  motivoParaNoReservar,
  plantillaPara,
  saneaConfigSillas,
  sillasLibres,
  type ConfigSillas,
  type TipoConSillas,
} from '../lib/mapa-asientos';
import { amenidadesDeSalida, saneaAmenidades } from '../lib/amenidades';
import {
  saneaPuntosEmbarque,
  puntosGuardados,
  type PuntoEmbarque,
} from '../lib/puntos-embarque';
import { motivoParaNoAplicarCupon, totalDelPasaje } from '../lib/cupon-pasaje';
import {
  admiteDomicilio,
  elegirAbordaje,
  type TipoDeVehiculo,
} from '../lib/recogida-salida';
import { politicasGuardadas, lineasDePolitica } from '../lib/politicas-tiquete';
import { cobroGuardado, lineasDeCobro, resumenDeCobro } from '../lib/cobro-pasaje';
import {
  exigirDocumentoDePasajero, pasajerosGuardados, saneaPasajeros, type PasajeroTiquete,
} from '../lib/pasajeros-tiquete';
import { saneaEstrellas, saneaComentario } from '../lib/reputacion';
import { motivoParaNoCalificar, type EstadoSalida } from '../lib/calificar-salida';
import {
  recalcularReputacionEmpresa,
  recalcularReputacionConductor,
} from './reputacion.service';
import { maskPhone } from './safe-contact.service';
import { marcarEncomiendasDeSalidaEnTransito } from './encomiendas.service';

// ─── Ephemeral WS subscription state ──────────────────────────────────────────
type TripCallback = (tripId: string, trip: PooledTripDTO) => void;
const tripListeners = new Map<string, Set<TripCallback>>();

const MAX_SEATS = 7;

export class PooledTripError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PooledTripError';
  }
}

// ─── Enum mappings ─────────────────────────────────────────────────────────────

// La columna guarda el SLUG del municipio (ver model Municipality). Esto era un
// mapa de los siete valores del enum viejo con `?? toUpperCase()` de respaldo,
// que escribía 'PAMPLONA' y 'LOS-PATIOS' en una columna que la migración de
// municipios ya había pasado a minúscula: las salidas publicadas antes de esa
// migración dejaron de aparecer en la búsqueda del pasajero, porque en
// PostgreSQL 'pamplona' <> 'PAMPLONA'. Mismo arreglo que intercity.service.
const CITY_TO_PRISMA = new Proxy({} as Record<string, string>, {
  get: (_t, slug: string) => slug,
});

const CITY_FROM_PRISMA: Record<string, IntercityCity> = {
  PAMPLONA: 'pamplona', CUCUTA: 'cucuta', BUCARAMANGA: 'bucaramanga',
  CHITAGA: 'chitaga', MALAGA: 'malaga', OCANA: 'ocana', BOGOTA: 'bogota',
};

const STATUS_FROM_PRISMA: Record<string, PooledTripStatus> = {
  OPEN: 'open', FULL: 'full', DEPARTED: 'departed', COMPLETED: 'completed', CANCELLED: 'cancelled',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DbPooledTrip = {
  id: string; tripRef: string; driverId: string; driverName: string; driverPhone: string;
  vehicleDescription: string; origin: string; destination: string; departureTime: Date;
  totalSeats: number; farePerSeat: number; maxFarePerSeat: number; allowFleet: boolean;
  status: string; notes: string | null; createdAt: Date;
  stops?: unknown;
  operatorId?: string | null;
  seatType?: string | null;
  seatRows?: number | null;
  seatConfig?: unknown;
  amenities?: unknown;
  boardingPoints?: unknown;
  doorToDoor?: boolean | null;
  bookings?: DbSeatBooking[];
  seatAssignments?: { seatNumber: number; bookingId: string }[];
};

type DbSeatBooking = {
  id: string; tripId: string; userId: string; passengerName: string; passengerPhone: string;
  seatsBooked: number; pickupAddress: string | null; notes: string | null; status: string; bookedAt: Date;
  rating?: number | null; ratingComment?: string | null;
  boardingPoint?: unknown; fareTotal?: number | null;
  discount?: number | null; promoCode?: string | null;
  passengers?: unknown;
  seats?: { seatNumber: number }[];
};

function _toBookingDTO(b: DbSeatBooking): SeatBookingDTO {
  return {
    id: b.id,
    tripId: b.tripId,
    passengerName: b.passengerName,
    // Privacy: the driver sees a masked reference, not the passenger's number.
    passengerPhone: maskPhone(b.passengerPhone) ?? '',
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(b.passengerPhone),
    seatsBooked: b.seatsBooked,
    // Ordenadas: en el manifiesto se leen de corrido y «7, 3» obliga a parar.
    seats: (b.seats ?? []).map((x) => x.seatNumber).sort((x, y) => x - y),
    pickupAddress: b.pickupAddress ?? undefined,
    notes: b.notes ?? undefined,
    status: (b.status === 'CONFIRMED' ? 'confirmed' : 'cancelled') as SeatBookingStatus,
    bookedAt: b.bookedAt.toISOString(),
    ...(b.rating != null && { rating: b.rating }),
    ...(b.ratingComment && { ratingComment: b.ratingComment }),
    ...(_puntoDe(b.boardingPoint) && { boardingPoint: _puntoDe(b.boardingPoint)! }),
    ...(b.fareTotal != null && { fareTotal: b.fareTotal }),
    ...(b.discount ? { discount: b.discount } : {}),
    ...(b.promoCode && { promoCode: b.promoCode }),
    // Lo que se paga, ya restado. Si lo calculara cada pantalla, una acabaría
    // enseñando el precio sin descuento justo cuando el pasajero va a pagar.
    ...(b.fareTotal != null && {
      amountToPay: Math.max(0, Math.round(b.fareTotal - (b.discount ?? 0))),
    }),
    // La planilla: quién viaja en cada silla. Vacío en las reservas hechas
    // antes de que existiera el campo, y el manifiesto lo dice así en vez de
    // repetir el nombre de la cuenta tantas veces como puestos.
    ...(pasajerosGuardados(b.passengers).length > 0 && {
      passengers: pasajerosGuardados(b.passengers),
    }),
  };
}

/** El punto sellado en la reserva, tolerante con lo que haya guardado. */
function _puntoDe(v: unknown): PuntoEmbarque | null {
  const p = puntosGuardados(Array.isArray(v) ? v : [v]);
  return p[0] ?? null;
}

/**
 * El mapa de sillas de la salida, o `undefined` si no va numerada.
 *
 * Se arma desde la plantilla del tipo de vehículo y se marcan las vendidas.
 * Las libres se CALCULAN de las ocupadas en vez de guardarse: un contador y
 * unas filas acaban discrepando y nadie sabe cuál miente.
 *
 * Si la consulta no trajo `seatAssignments` no se inventa que todo está libre
 * —eso invitaría a comprar una silla ya vendida— y se devuelve `undefined`,
 * que la app entiende como «esta salida no pide silla».
 */
function _mapaDe(t: DbPooledTrip): MapaAsientosDTO | undefined {
  if (!esTipoConSillas(t.seatType) || !t.seatAssignments) return undefined;

  const tipo = t.seatType as TipoConSillas;
  const filas = t.seatRows ?? undefined;
  const config = saneaConfigSillas(t.seatConfig);
  const ocupadas = t.seatAssignments.map((a) => a.seatNumber);
  const tomadas = new Set(ocupadas);
  const plantilla = plantillaPara(tipo, filas, config);

  return {
    tipo,
    etiqueta: plantilla.etiqueta,
    columnas: plantilla.columnas,
    filas: plantilla.filas.map((fila) =>
      fila.map((c) =>
        c.tipo === 'silla'
          ? { tipo: 'silla' as const, numero: c.numero, ocupada: tomadas.has(c.numero) }
          : { tipo: c.tipo },
      ),
    ),
    sillas: plantilla.sillas,
    libres: sillasLibres(tipo, ocupadas, filas, config),
    ocupadas,
  };
}

function _toDTO(t: DbPooledTrip, includeBookings: boolean): PooledTripDTO {
  const route = getIntercityRoute(
    (CITY_FROM_PRISMA[t.origin] ?? t.origin.toLowerCase()) as IntercityCity,
    (CITY_FROM_PRISMA[t.destination] ?? t.destination.toLowerCase()) as IntercityCity,
  );
  const confirmedBookings = (t.bookings ?? []).filter((b) => b.status === 'CONFIRMED');
  const takenSeats = confirmedBookings.reduce((sum, b) => sum + b.seatsBooked, 0);

  const dto: PooledTripDTO = {
    id: t.id,
    tripRef: t.tripRef,
    driverId: t.driverId,
    driverName: t.driverName,
    // Privacy: passengers see a masked reference, not the driver's number.
    driverPhone: maskPhone(t.driverPhone) ?? '',
    contactChannel: 'in_app_chat',
    maskedPhone: maskPhone(t.driverPhone),
    vehicleDescription: t.vehicleDescription,
    origin: (CITY_FROM_PRISMA[t.origin] ?? t.origin.toLowerCase()) as IntercityCity,
    destination: (CITY_FROM_PRISMA[t.destination] ?? t.destination.toLowerCase()) as IntercityCity,
    departureTime: t.departureTime.toISOString(),
    totalSeats: t.totalSeats,
    availableSeats: t.totalSeats - takenSeats,
    farePerSeat: t.farePerSeat,
    maxFarePerSeat: t.maxFarePerSeat,
    allowFleet: t.allowFleet,
    status: (STATUS_FROM_PRISMA[t.status] ?? 'open') as PooledTripStatus,
    notes: t.notes ?? undefined,
    stops: stopsFromDb(t.stops),
    seatMap: _mapaDe(t),
    // El baño sale del PLANO y no de lo que marcaron: dos fuentes acabarían
    // contradiciéndose, y un chip prometiendo baño sobre un plano que no lo
    // dibuja es la queja más cara en una ruta de nueve horas. Sin plano
    // (la salida por cupos del particular) no hay de dónde derivarlo.
    boardingPoints: puntosGuardados(t.boardingPoints),
    // Ya resuelto: la app no tiene que saber que una van recoge en casa y un
    // bus no. Si lo dedujera cada pantalla, una acabaría pidiendo la dirección
    // donde la otra no la pide.
    doorToDoor: admiteDomicilio(t.seatType as TipoDeVehiculo, t.doorToDoor),
    amenities: amenidadesDeSalida(
      t.amenities,
      esTipoConSillas(t.seatType)
        ? Boolean(saneaConfigSillas(t.seatConfig)?.bano)
        : null,
    ),
    distanceKm: route?.distanceKm,
    durationMinutes: route?.durationMinutes,
    createdAt: t.createdAt.toISOString(),
    operatorId: t.operatorId ?? undefined,
  };

  if (includeBookings) {
    dto.bookings = confirmedBookings.map(_toBookingDTO);
  }
  return dto;
}

async function _fetchWithBookings(id: string): Promise<DbPooledTrip | null> {
  return prisma.pooledTrip.findUnique({
    where: { id },
    include: { bookings: { include: { seats: true } }, seatAssignments: true },
  }) as Promise<DbPooledTrip | null>;
}

function _notify(tripId: string, trip: PooledTripDTO): void {
  for (const cb of tripListeners.get(tripId) ?? []) cb(tripId, trip);
}

// ─── Driver: publish & manage ─────────────────────────────────────────────────

export interface PublishPooledTripOpts {
  /** Empresa que publica la salida — se sella en el registro. */
  operatorId?: string;
  /**
   * true cuando publica una empresa habilitada (verificada): las rutas
   * troncales del modelo dual SÍ están permitidas para ella — ese es
   * exactamente el propósito del modelo.
   */
  licensedOperator?: boolean;
}

export async function publishPooledTrip(
  driverId: string,
  driverName: string,
  driverPhone: string,
  dto: PublishPooledTripDTO,
  opts?: PublishPooledTripOpts,
): Promise<PooledTripDTO> {
  if (dto.origin === dto.destination) throw new PooledTripError('El origen y el destino no pueden ser iguales');
  const route = getIntercityRoute(dto.origin, dto.destination);
  if (!route) throw new PooledTripError(`No hay ruta definida entre ${dto.origin} y ${dto.destination}`);

  // Option B (dual model): trunk routes require a habilitated operator.
  if (INTERCITY_DUAL_MODEL && route.requiresLicensedOperator && !opts?.licensedOperator) {
    throw new PooledTripError(
      'Esta es una ruta troncal que requiere operador de transporte habilitado. ' +
        'Por ahora no está disponible para conductores particulares.',
    );
  }

  // El tope de 7 es del GASTO COMPARTIDO: un particular repartiendo gasolina
  // en su carro. No aplica a una buseta de 19 ni a un bus de 40, que es
  // transporte de pasajeros de una empresa habilitada — y ahí los puestos no
  // los pone el formulario sino el mapa del vehículo, así que no hay número
  // que validar.
  if (
    !esTipoConSillas(dto.seatType) &&
    (!Number.isInteger(dto.totalSeats) || dto.totalSeats < 1 || dto.totalSeats > MAX_SEATS)
  ) {
    throw new PooledTripError(`Los puestos deben estar entre 1 y ${MAX_SEATS}`);
  }
  const departure = new Date(dto.departureTime);
  if (Number.isNaN(departure.getTime()) || departure.getTime() < Date.now()) {
    throw new PooledTripError('La hora de salida debe ser en el futuro');
  }
  if (dto.farePerSeat < 0) throw new PooledTripError('La tarifa por puesto no puede ser negativa');

  // Una buseta o un bus NO son gasto compartido: son transporte público de
  // pasajeros, y eso solo lo puede prestar una empresa habilitada. Dejar que
  // un particular publique una salida de 19 puestos sería ayudarle a operar
  // sin habilitación, que es exactamente lo que el modelo dual existe para
  // impedir.
  if (esTipoConSillas(dto.seatType) && !opts?.licensedOperator) {
    throw new PooledTripError(
      'Las salidas con silla numerada en van, buseta o bus solo las pueden ' +
        'publicar empresas de transporte habilitadas y verificadas.',
    );
  }

  // Cost-share reference value (always computed). Enforcement (Option A) is
  // skipped only when Option C (INTERCITY_REMOVE_CAP) is explicitly enabled.
  //
  // El tope tampoco aplica a una empresa habilitada: su tarifa es comercial y
  // la regula el Ministerio, no el reparto de gasolina entre compañeros de
  // viaje. Aplicárselo dejaría el puesto de Pamplona a Cúcuta en $3.000.
  const maxFare = getMaxFarePerSeat(dto.origin, dto.destination, dto.totalSeats);
  if (!INTERCITY_REMOVE_CAP && !opts?.licensedOperator && dto.farePerSeat > maxFare) {
    throw new PooledTripError(
      `La tarifa por puesto ($${dto.farePerSeat.toLocaleString('es-CO')}) supera el máximo legal de gasto compartido para esta ruta ($${maxFare.toLocaleString('es-CO')}).`,
    );
  }

  // Con vehículo declarado, los puestos los dice el MAPA, no el formulario:
  // si la empresa escribiera 20 en una van de 12, se venderían ocho sillas que
  // no existen y la pelea sería en la terminal.
  const numerada = esTipoConSillas(dto.seatType);
  const configSillas: ConfigSillas | null = numerada
    ? saneaConfigSillas((dto as { seatConfig?: unknown }).seatConfig)
    : null;
  const totalSeats = numerada
    ? plantillaPara(dto.seatType as TipoConSillas, dto.seatRows, configSillas).sillas
    : dto.totalSeats;

  const tripRef = `NXP-${Math.floor(1000 + Math.random() * 8000)}`;
  const trip = await prisma.pooledTrip.create({
    data: {
      tripRef,
      driverId,
      driverName,
      driverPhone,
      vehicleDescription: dto.vehicleDescription,
      origin: CITY_TO_PRISMA[dto.origin],
      destination: CITY_TO_PRISMA[dto.destination],
      departureTime: departure,
      totalSeats,
      seatType: numerada ? (dto.seatType as TipoConSillas) : null,
      seatRows: numerada ? (dto.seatRows ?? null) : null,
      seatConfig: configSillas ? (configSillas as unknown as Prisma.InputJsonObject) : Prisma.DbNull,
      // El baño se queda fuera aunque venga marcado: lo pone el plano.
      amenities: saneaAmenidades(dto.amenities),
      // Contra la hora de salida: así un punto a nueve horas se rechaza aquí y
      // no cuando un pasajero esté esperando en esa esquina.
      doorToDoor: dto.doorToDoor ?? null,
      boardingPoints: saneaPuntosEmbarque(
        dto.boardingPoints,
        departure,
      ) as unknown as Prisma.InputJsonValue,
      farePerSeat: dto.farePerSeat,
      maxFarePerSeat: maxFare,
      allowFleet: dto.allowFleet ?? false,
      status: 'OPEN',
      notes: dto.notes ?? null,
      stops: sanitizeStops(dto.stops),
      operatorId: opts?.operatorId ?? null,
    },
    include: { bookings: { include: { seats: true } }, seatAssignments: true },
  });
  return _toDTO(trip as DbPooledTrip, true);
}

export async function getDriverPooledTrips(driverId: string): Promise<PooledTripDTO[]> {
  const trips = await prisma.pooledTrip.findMany({
    where: { driverId },
    include: { bookings: { include: { seats: true } }, seatAssignments: true },
    orderBy: { createdAt: 'desc' },
  });
  return trips.map((t) => _toDTO(t as DbPooledTrip, true));
}

// ─── Empresa: salidas programadas ─────────────────────────────────────────────

export async function getOperatorPooledTrips(operatorId: string): Promise<PooledTripDTO[]> {
  const trips = await prisma.pooledTrip.findMany({
    where: { operatorId },
    include: { bookings: { include: { seats: true } }, seatAssignments: true },
    orderBy: { departureTime: 'desc' },
  });
  return trips.map((t) => _toDTO(t as DbPooledTrip, true));
}

/**
 * Numera las sillas de una salida YA PUBLICADA (o corrige el vehículo de una
 * numerada que aún nadie compró).
 *
 * POR QUÉ HACE FALTA. Las salidas publicadas antes de la numeración —y las que
 * se publiquen sin declarar vehículo— se venden por cupos para siempre: la
 * empresa tendría que cancelarlas y volver a crearlas una a una, y cancelar una
 * salida es un aviso a los pasajeros que ya compraron.
 *
 * POR QUÉ SOLO SIN RESERVAS. Con alguien ya comprado no hay forma honesta de
 * numerar: esa persona pagó un cupo, no una silla, y nadie le preguntó cuál
 * quería. Asignarle la primera libre sería inventarle un sitio —quizá el fondo
 * cuando pidió ventana— y además dejaría su silla marcada como vendida sin que
 * ella lo sepa. Se rechaza diciendo el motivo, que es lo único que la empresa
 * puede accionar (cancelar y republicar, o vender el resto por cupos).
 */
export async function numerarPooledTrip(
  operatorId: string,
  tripId: string,
  seatType: string | undefined,
  seatRows: number | undefined,
  opts?: { licensedOperator?: boolean },
): Promise<PooledTripDTO> {
  if (!esTipoConSillas(seatType)) {
    throw new PooledTripError('Elige el vehículo: van, buseta o bus.');
  }
  // Misma regla que al publicar: silla numerada = transporte de pasajeros, y
  // eso solo lo presta una empresa habilitada. Sin esto, numerar sería la
  // puerta de atrás para saltarse la guarda de `publishPooledTrip`.
  if (!opts?.licensedOperator) {
    throw new PooledTripError(
      'Las salidas con silla numerada solo las pueden ofrecer empresas de ' +
        'transporte habilitadas y verificadas.',
    );
  }

  const t = await _fetchWithBookings(tripId);
  if (!t || t.operatorId !== operatorId) {
    throw new PooledTripError('Salida no encontrada.');
  }
  if (t.status !== 'OPEN') {
    throw new PooledTripError('Solo se puede numerar una salida abierta.');
  }
  const vendidas = (t.bookings ?? []).filter((b) => b.status === 'CONFIRMED').length;
  if (vendidas > 0) {
    throw new PooledTripError(
      'Esta salida ya tiene pasajeros que compraron por cupo, así que no se ' +
        'les puede asignar una silla que no eligieron. Publica una salida ' +
        'nueva con el vehículo declarado.',
    );
  }

  const plantilla = plantillaPara(seatType as TipoConSillas, seatRows);
  const updated = await prisma.pooledTrip.update({
    where: { id: tripId },
    // Los puestos los dice el mapa, igual que al publicar: dejar el número
    // viejo vendería sillas que el vehículo no tiene.
    data: {
      seatType: seatType as TipoConSillas,
      seatRows: seatRows ?? null,
      totalSeats: plantilla.sillas,
    },
    include: { bookings: { include: { seats: true } }, seatAssignments: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

/** Cancela una salida publicada por la empresa (solo las suyas). */
export async function cancelPooledTripByOperator(
  operatorId: string,
  tripId: string,
): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.operatorId !== operatorId) return null;
  if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'CANCELLED' }, include: { bookings: { include: { seats: true } }, seatAssignments: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

export async function departPooledTrip(driverId: string, tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status !== 'OPEN' && t.status !== 'FULL') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'DEPARTED' }, include: { bookings: { include: { seats: true } }, seatAssignments: true },
  });

  // El bus arranca con las encomiendas en la bodega: sus pedidos pasan a
  // «en tránsito intermunicipal». Se ESPERA a propósito —es una transición de
  // estado, no un aviso—: si se dejara al aire y fallara, el cliente vería su
  // caja «preparando» con el bus ya en carretera.
  await marcarEncomiendasDeSalidaEnTransito(tripId).catch((e) => {
    // Pero tampoco puede impedir que el bus salga: el conductor está esperando
    // y el viaje de los pasajeros no depende de esto.
    console.error('[Pool] No se pudieron poner en tránsito las encomiendas:', e);
  });

  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

export async function completePooledTrip(driverId: string, tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status !== 'DEPARTED') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'COMPLETED' }, include: { bookings: { include: { seats: true } }, seatAssignments: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

export async function cancelPooledTrip(driverId: string, tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  if (!t || t.driverId !== driverId) return null;
  if (t.status === 'COMPLETED' || t.status === 'CANCELLED') return null;

  const updated = await prisma.pooledTrip.update({
    where: { id: tripId }, data: { status: 'CANCELLED' }, include: { bookings: { include: { seats: true } }, seatAssignments: true },
  });
  const dto = _toDTO(updated as DbPooledTrip, true);
  _notify(tripId, dto);
  return dto;
}

// ─── Client: search & book ────────────────────────────────────────────────────

export interface SearchPooledTripsQuery {
  origin?: IntercityCity;
  destination?: IntercityCity;
  date?: string;
}

/**
 * Le pone a cada salida los datos de la empresa que la publicó: nombre, nota y
 * condiciones del tiquete.
 *
 * En UNA consulta para todas. Es lo que mira el pasajero antes de comprar —con
 * quién viaja y qué pasa con su maleta— y hacer una consulta por salida
 * volvería lenta justo la pantalla de la búsqueda.
 *
 * Las salidas de conductor particular pasan de largo: no hay empresa detrás, y
 * ese hueco es información (es exactamente la diferencia que el pasajero está
 * evaluando).
 */
async function _conDatosDeEmpresa(dtos: PooledTripDTO[]): Promise<PooledTripDTO[]> {
  const ids = [...new Set(dtos.map((d) => d.operatorId).filter((x): x is string => !!x))];
  if (ids.length === 0) return dtos;

  const ops = await prisma.operator.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, legalName: true, tradeName: true,
      rating: true, ratingCount: true, policies: true, paymentInfo: true,
    },
  });
  const porId = new Map(ops.map((o) => [o.id, o]));

  for (const d of dtos) {
    const o = d.operatorId ? porId.get(d.operatorId) : undefined;
    if (!o) continue;
    d.operatorName = o.tradeName ?? o.legalName;
    // Sin calificaciones NO se manda un número: la app dice «Nuevo». Un cero
    // se leería como «pésimo» y un 5,0 de fábrica como «impecable», y las dos
    // lecturas serían falsas.
    if (o.rating != null) d.operatorRating = o.rating;
    if (o.ratingCount > 0) d.operatorRatingCount = o.ratingCount;
    const lineas = lineasDePolitica(politicasGuardadas(o.policies));
    if (lineas.length > 0) d.operatorPolicies = lineas;
    // Cómo se paga. Va SIEMPRE, incluso sin declarar, porque la línea que
    // manda entonces —«acuérdalo con la empresa»— es justo la que hoy falta:
    // la reserva termina sin decir una palabra sobre el dinero.
    const cobro = cobroGuardado(o.paymentInfo);
    d.operatorPayment = lineasDeCobro(cobro);
    const resumen = resumenDeCobro(cobro);
    if (resumen) d.operatorPaymentSummary = resumen;
  }
  return dtos;
}

export async function searchPooledTrips(query: SearchPooledTripsQuery): Promise<PooledTripDTO[]> {
  const now = new Date();
  let target: Date | null = null;
  if (query.date) {
    const d = new Date(query.date);
    if (!Number.isNaN(d.getTime())) target = d;
  }

  const where: Record<string, unknown> = {
    status: 'OPEN',
    departureTime: { gt: now },
    ...(query.origin && { origin: CITY_TO_PRISMA[query.origin] }),
    ...(query.destination && { destination: CITY_TO_PRISMA[query.destination] }),
  };

  const trips = await prisma.pooledTrip.findMany({
    where: where as NonNullable<Parameters<typeof prisma.pooledTrip.findMany>[0]>['where'],
    include: { bookings: { where: { status: 'CONFIRMED' }, include: { seats: true } }, seatAssignments: true },
    orderBy: { departureTime: 'asc' },
  });

  const dtos = await _conDatosDeEmpresa(trips.map((t) => _toDTO(t as DbPooledTrip, false)));

  return dtos
    .filter((t) => {
      if (t.availableSeats <= 0) return false;
      if (target) {
        const d = new Date(t.departureTime);
        return (
          d.getFullYear() === target.getFullYear() &&
          d.getMonth() === target.getMonth() &&
          d.getDate() === target.getDate()
        );
      }
      return true;
    });
}

/**
 * Dónde va el bus, del último latido del conductor.
 *
 * Solo con la salida EN CURSO: antes de arrancar, la posición del conductor no
 * es la del bus —está en su casa— y pintarla en el mapa como si lo fuera es
 * peor que no pintar nada, porque el pasajero decide cuándo salir de casa
 * mirando eso.
 */
async function _conPosicionDelBus(
  dto: PooledTripDTO,
  t: { driverId: string; status: string },
): Promise<PooledTripDTO> {
  if (t.status !== 'DEPARTED') return dto;
  const d = await prisma.driver.findUnique({
    where: { id: t.driverId },
    select: { lastLat: true, lastLng: true },
  });
  if (d?.lastLat != null && d.lastLng != null) {
    dto.driverLat = d.lastLat;
    dto.driverLng = d.lastLng;
  }
  return dto;
}

export async function getPooledTripById(tripId: string, includeBookings = false): Promise<PooledTripDTO | null> {
  const t = await prisma.pooledTrip.findUnique({
    where: { id: tripId },
    // Las sillas van SIEMPRE, aunque no se pidan las reservas: sin ellas el
    // DTO sale sin mapa y la salida parecería no numerada, con el pasajero
    // comprando un cupo sin poder elegir dónde se sienta.
    include: { bookings: includeBookings, seatAssignments: true },
  });
  if (!t) return null;
  return _conPosicionDelBus(_toDTO(t as DbPooledTrip, includeBookings), t);
}

export async function bookSeats(
  clientId: string,
  passengerName: string,
  passengerPhone: string,
  tripId: string,
  dto: BookSeatsDTO,
): Promise<{ trip: PooledTripDTO; booking: SeatBookingDTO }> {
  return prisma.$transaction(async (tx) => {
    const t = await tx.pooledTrip.findUnique({
      where: { id: tripId },
      include: { bookings: { where: { status: 'CONFIRMED' }, include: { seats: true } }, seatAssignments: true },
    });
    if (!t) throw new PooledTripError('El viaje no existe');
    if (t.status !== 'OPEN') throw new PooledTripError('Este viaje ya no acepta reservas');
    if (t.driverId === clientId) throw new PooledTripError('No puedes reservar tu propio viaje');

    const existing = (t.bookings as DbSeatBooking[]).find((b) => b.userId === clientId);
    if (existing) throw new PooledTripError('Ya tienes una reserva en este viaje');

    const takenSeats = (t.bookings as DbSeatBooking[]).reduce((sum, b) => sum + b.seatsBooked, 0);
    const available = t.totalSeats - takenSeats;

    // ── Salida NUMERADA: manda la lista de sillas ─────────────────────────
    // `seatsBooked` deja de ser el dato de entrada y pasa a derivarse de
    // cuántas sillas eligió. Si se confiara en el número que manda la app, se
    // podría pagar un puesto y ocupar tres.
    const numerada = esTipoConSillas(t.seatType);
    const sillas = numerada ? (dto.seats ?? []) : [];
    if (numerada) {
      const ocupadas = (
        await tx.seatAssignment.findMany({
          where: { tripId },
          select: { seatNumber: true },
        })
      ).map((a) => a.seatNumber);

      const motivo = motivoParaNoReservar({
        tipo: t.seatType as TipoConSillas,
        filas: t.seatRows ?? undefined,
        // La MISMA configuración con la que se dibujó el mapa. Si aquí se
        // validara contra el molde del tipo, el pasajero tocaría la silla 40
        // de su bus de 40 y el servidor le diría que no existe.
        config: saneaConfigSillas((t as { seatConfig?: unknown }).seatConfig),
        pedidas: sillas,
        ocupadas,
      });
      if (motivo) throw new PooledTripError(motivo);
    }

    const requested = numerada ? sillas.length : dto.seatsBooked;

    if (!Number.isInteger(requested) || requested < 1) throw new PooledTripError('Debes reservar al menos un puesto');
    if (requested > available) throw new PooledTripError(`Solo quedan ${available} puesto(s) disponible(s)`);
    if (requested === t.totalSeats && requested > 1 && !t.allowFleet) {
      throw new PooledTripError('Este conductor no permite reservar el vehículo completo');
    }

    // ── Dónde sube ────────────────────────────────────────────────────────
    // Un punto FIJO o su propia casa: una van intermunicipal hace las dos
    // cosas. El punto se SELLA, no se referencia: si la empresa le cambia la
    // hora mañana, a esta persona le dijeron otra cosa.
    const puntos = puntosGuardados((t as { boardingPoints?: unknown }).boardingPoints);
    const abordaje = elegirAbordaje({
      puntos,
      domicilioAdmitido: admiteDomicilio(
        t.seatType as TipoDeVehiculo,
        (t as { doorToDoor?: boolean | null }).doorToDoor,
      ),
      puntoId: dto.boardingPointId,
      direccion: dto.pickupAddress,
    });
    if (abordaje.motivo) throw new PooledTripError(abordaje.motivo);
    const punto = abordaje.punto;

    // ── Cuánto cuesta, y el descuento si trae código ──────────────────────
    // El importe se sella aquí: sin esto, subir la tarifa mañana le cambiaba
    // el precio a quien ya había comprado.
    let descuento = 0;
    let codigo: string | null = null;
    if (dto.promoCode?.trim()) {
      const bruto = totalDelPasaje(t.farePerSeat, requested).total;
      const cupon = await tx.promoCode.findUnique({
        where: { code: dto.promoCode.trim().toUpperCase() },
      });
      if (!cupon || !cupon.active) throw new PooledTripError('Código no válido');
      const motivoCupon = motivoParaNoAplicarCupon(
        {
          code: cupon.code,
          operatorId: cupon.operatorId,
          aplicaAPasajes: cupon.scope === 'INTERCITY' || cupon.scope === 'ALL',
        },
        { operatorId: t.operatorId ?? null },
      );
      if (motivoCupon) throw new PooledTripError(motivoCupon);
      if (cupon.expiresAt && cupon.expiresAt < new Date()) {
        throw new PooledTripError('Este código ya venció');
      }
      if (bruto < cupon.minAmount) {
        throw new PooledTripError(
          `Monto mínimo: $${cupon.minAmount.toLocaleString('es-CO')}`,
        );
      }
      const usos = await tx.promoRedemption.count({
        where: { promoCodeId: cupon.id, userId: clientId },
      });
      if (usos >= cupon.perUserLimit) throw new PooledTripError('Ya usaste este código');
      if (cupon.maxRedemptions != null) {
        const total = await tx.promoRedemption.count({ where: { promoCodeId: cupon.id } });
        if (total >= cupon.maxRedemptions) {
          throw new PooledTripError('Este código alcanzó su límite de usos');
        }
      }

      const crudo = cupon.type === 'PERCENT'
        ? bruto * (Math.min(cupon.value, 100) / 100)
        : cupon.value;
      const topado = cupon.maxDiscount != null ? Math.min(crudo, cupon.maxDiscount) : crudo;
      descuento = totalDelPasaje(t.farePerSeat, requested, topado).descuento;
      codigo = cupon.code;

      // La redención va DENTRO de la transacción de la reserva: si la silla se
      // la lleva otro, el cupón no puede quedar gastado.
      await tx.promoRedemption.create({
        data: {
          promoCodeId: cupon.id, userId: clientId, context: 'pooled',
          amountBefore: bruto, discount: descuento,
        },
      });
    }

    const plata = totalDelPasaje(t.farePerSeat, requested, descuento);

    // ── Quién viaja en cada silla ─────────────────────────────────────────
    // Se valida contra los puestos REALES (`requested`), no contra lo que
    // mandó el cliente: en una salida numerada los puestos los cuentan las
    // sillas elegidas, y validar contra el otro número dejaría pasar una
    // planilla con más o menos gente de la que sube.
    let pasajeros: PasajeroTiquete[] | null = null;
    try {
      pasajeros = saneaPasajeros((dto as { passengers?: unknown }).passengers, requested);
    } catch (e) {
      throw new PooledTripError(e instanceof Error ? e.message : 'Datos de los pasajeros inválidos');
    }
    if (!pasajeros && exigirDocumentoDePasajero()) {
      throw new PooledTripError(
        'Para viajar hace falta el documento de cada pasajero. Actualiza la app para continuar.',
      );
    }

    const booking = await tx.seatBooking.create({
      data: {
        tripId,
        userId: clientId,
        passengerName,
        passengerPhone,
        seatsBooked: requested,
        // La resuelta: quien eligió un punto fijo no lleva dirección, y
        // guardarla igual haría que el conductor viera dos sitios distintos
        // donde recoger a la misma persona.
        pickupAddress: abordaje.direccion,
        notes: dto.notes ?? null,
        status: 'CONFIRMED',
        ...(punto && { boardingPoint: punto as unknown as Prisma.InputJsonObject }),
        fareTotal: plata.total,
        discount: plata.descuento,
        promoCode: codigo,
        ...(pasajeros && { passengers: pasajeros as unknown as Prisma.InputJsonValue }),
      },
    });

    if (numerada) {
      // Aquí es donde de verdad se decide quién se queda la silla. Dos
      // compras simultáneas pasan las dos la validación de arriba —entre
      // mirar y escribir hay milisegundos—, y es el índice único
      // (tripId, seatNumber) el que deja fuera a la segunda. La transacción
      // revierte entera, así que no queda una reserva sin sillas.
      try {
        await tx.seatAssignment.createMany({
          data: sillas.map((n) => ({ tripId, seatNumber: n, bookingId: booking.id })),
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new PooledTripError(
            'Alguien acaba de tomar una de esas sillas. Actualiza y elige otra.',
          );
        }
        throw e;
      }
    }

    const newAvailable = available - requested;
    let updatedTrip = t;
    if (newAvailable <= 0) {
      updatedTrip = await tx.pooledTrip.update({
        where: { id: tripId },
        data: { status: 'FULL' },
        include: { bookings: { where: { status: 'CONFIRMED' }, include: { seats: true } }, seatAssignments: true },
      });
    }

    const allBookings = [
      ...(updatedTrip.bookings as DbSeatBooking[]),
      ...(updatedTrip === t ? [booking] : []) as DbSeatBooking[],
    ];
    const tripWithBooking = { ...updatedTrip, bookings: allBookings } as DbPooledTrip;
    const tripDto = _toDTO(tripWithBooking, false);
    _notify(tripId, tripDto);

    // La reserva vuelve CON sus sillas. `create` no devuelve las relaciones,
    // así que sin esta relectura la confirmación de compra salía con la lista
    // vacía: el pasajero acaba de elegir la 4 y el recibo le diría «1 puesto».
    const conSillas = numerada
      ? ((await tx.seatBooking.findUnique({
          where: { id: booking.id },
          include: { seats: true },
        })) as DbSeatBooking)
      : (booking as DbSeatBooking);

    return { trip: tripDto, booking: _toBookingDTO(conSillas) };
  });
}

export async function cancelSeatBooking(clientId: string, bookingId: string): Promise<PooledTripDTO | null> {
  const b = await prisma.seatBooking.findUnique({ where: { id: bookingId } });
  if (!b || b.userId !== clientId) return null;

  if (b.status === 'CANCELLED') {
    const t = await _fetchWithBookings(b.tripId);
    return t ? _toDTO(t, false) : null;
  }

  const trip = await prisma.pooledTrip.findUnique({ where: { id: b.tripId } });
  if (!trip) return null;
  if (trip.status === 'COMPLETED' || trip.status === 'DEPARTED') {
    throw new PooledTripError('No puedes cancelar una reserva de un viaje que ya salió');
  }

  await prisma.seatBooking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } });

  // Y las SILLAS vuelven al mapa.
  //
  // La reserva se marca cancelada, no se borra —hay que poder auditar quién
  // reservó y canceló—, pero las asignaciones sí se eliminan: si se quedaran,
  // el cupo se liberaría (se cuenta por reservas CONFIRMED) mientras la silla
  // seguiría pintada como vendida. La salida diría «quedan 3 libres» y no
  // habría forma de comprar ninguna de las tres.
  await prisma.seatAssignment.deleteMany({ where: { bookingId } });

  // Reopen if full trip now has freed seats
  let updatedTrip = trip;
  if (trip.status === 'FULL') {
    const remaining = await prisma.seatBooking.aggregate({
      where: { tripId: b.tripId, status: 'CONFIRMED' },
      _sum: { seatsBooked: true },
    });
    if ((remaining._sum.seatsBooked ?? 0) < trip.totalSeats) {
      updatedTrip = await prisma.pooledTrip.update({ where: { id: b.tripId }, data: { status: 'OPEN' } });
    }
  }

  const t = await prisma.pooledTrip.findUnique({
    where: { id: b.tripId }, include: { bookings: { include: { seats: true } }, seatAssignments: true },
  });
  if (!t) return null;
  const dto = _toDTO({ ...updatedTrip, ...t, bookings: t.bookings } as DbPooledTrip, false);
  _notify(b.tripId, dto);
  return dto;
}

export async function getClientBookings(clientId: string): Promise<Array<PooledTripDTO & { myBooking: SeatBookingDTO }>> {
  const bookings = await prisma.seatBooking.findMany({
    where: { userId: clientId, status: 'CONFIRMED' },
    include: {
      // `seats` en DOS niveles y no es repetición: el de abajo arma el mapa de
      // la salida; ESTE es el de la reserva propia. Sin él, «Mis reservas» le
      // decía «2 puestos» a quien había elegido ventana, que es justo el dato
      // que va a necesitar en la terminal.
      seats: true,
      trip: { include: { bookings: { include: { seats: true } }, seatAssignments: true } },
    },
    orderBy: { bookedAt: 'desc' },
  });

  // La posición de los buses EN CURSO, en UNA consulta. Es la pantalla donde
  // el pasajero mira dónde va el suyo, y hacer una consulta por reserva la
  // volvería lenta justo cuando más se abre.
  const enCurso = bookings
    .map((b) => b.trip)
    .filter((t) => t.status === 'DEPARTED')
    .map((t) => t.driverId);
  const posiciones = new Map<string, { lat: number; lng: number }>();
  if (enCurso.length > 0) {
    const conductores = await prisma.driver.findMany({
      where: { id: { in: [...new Set(enCurso)] } },
      select: { id: true, lastLat: true, lastLng: true },
    });
    for (const d of conductores) {
      if (d.lastLat != null && d.lastLng != null) {
        posiciones.set(d.id, { lat: d.lastLat, lng: d.lastLng });
      }
    }
  }

  const conEmpresa = await _conDatosDeEmpresa(
    bookings.map((b) => {
      const dto = _toDTO(b.trip as DbPooledTrip, false);
      const pos = b.trip.status === 'DEPARTED' ? posiciones.get(b.trip.driverId) : undefined;
      if (pos) {
        dto.driverLat = pos.lat;
        dto.driverLng = pos.lng;
      }
      return dto;
    }),
  );

  // Las condiciones del tiquete se necesitan MÁS aquí que en la búsqueda: al
  // comprar se leen por encima, y se vuelven a buscar cuando hay que cancelar
  // o cuando aparece la maleta de más.
  return conEmpresa.map((dto, i) => ({
    ...dto,
    myBooking: _toBookingDTO(bookings[i] as unknown as DbSeatBooking),
  }));
}

/**
 * Cuánto descontaría un código en esta salida, sin canjearlo.
 *
 * Existe para que el pasajero vea el precio con descuento ANTES de dar a
 * comprar. La validación de verdad vuelve a correr dentro de la transacción de
 * la reserva —entre mirar y comprar el cupón puede agotarse—, así que esto es
 * una previsualización y no una promesa.
 */
export async function cotizarCuponDePasaje(
  clientId: string,
  tripId: string,
  code: string,
  puestos: number,
): Promise<{ code: string; discount: number; amountToPay: number }> {
  const t = await prisma.pooledTrip.findUnique({
    where: { id: tripId },
    select: { farePerSeat: true, operatorId: true },
  });
  if (!t) throw new PooledTripError('Esa salida ya no existe');

  const cupon = await prisma.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!cupon || !cupon.active) throw new PooledTripError('Código no válido');

  const motivo = motivoParaNoAplicarCupon(
    {
      code: cupon.code,
      operatorId: cupon.operatorId,
      aplicaAPasajes: cupon.scope === 'INTERCITY' || cupon.scope === 'ALL',
    },
    { operatorId: t.operatorId ?? null },
  );
  if (motivo) throw new PooledTripError(motivo);
  if (cupon.expiresAt && cupon.expiresAt < new Date()) {
    throw new PooledTripError('Este código ya venció');
  }

  const bruto = totalDelPasaje(t.farePerSeat, puestos).total;
  if (bruto < cupon.minAmount) {
    throw new PooledTripError(`Monto mínimo: $${cupon.minAmount.toLocaleString('es-CO')}`);
  }
  const usos = await prisma.promoRedemption.count({
    where: { promoCodeId: cupon.id, userId: clientId },
  });
  if (usos >= cupon.perUserLimit) throw new PooledTripError('Ya usaste este código');

  const crudo = cupon.type === 'PERCENT'
    ? bruto * (Math.min(cupon.value, 100) / 100)
    : cupon.value;
  const topado = cupon.maxDiscount != null ? Math.min(crudo, cupon.maxDiscount) : crudo;
  const plata = totalDelPasaje(t.farePerSeat, puestos, topado);
  return { code: cupon.code, discount: plata.descuento, amountToPay: plata.paga };
}

/**
 * Califica la salida en la que viajó: estrellas para la EMPRESA.
 *
 * La nota se guarda en la reserva —como en `Trip` y en `Order`— y el promedio
 * de la empresa se recalcula de ahí. Es corregible: si alguien se equivoca de
 * estrella, cambiarla es mejor que dejar una nota falsa para siempre, y
 * `rateIntercityBooking` es el único sitio del código que no lo permite.
 *
 * También mueve la nota del conductor, porque una salida de bus es un servicio
 * suyo: antes de esto, sus estrellas solo salían de los viajes urbanos.
 */
export async function rateSeatBooking(
  clientId: string,
  bookingId: string,
  estrellas: unknown,
  comentario?: unknown,
): Promise<SeatBookingDTO> {
  const rating = saneaEstrellas(estrellas);
  const ratingComment = saneaComentario(comentario);

  const b = await prisma.seatBooking.findUnique({
    where: { id: bookingId },
    include: { trip: true, seats: true },
  });
  if (!b || b.userId !== clientId) throw new PooledTripError('Reserva no encontrada');

  const motivo = motivoParaNoCalificar({
    estadoSalida: (STATUS_FROM_PRISMA[b.trip.status] ?? 'open') as EstadoSalida,
    reservaCancelada: b.status !== 'CONFIRMED',
    salidaEn: b.trip.departureTime,
    duracionMin: getIntercityRoute(
      (CITY_FROM_PRISMA[b.trip.origin] ?? b.trip.origin.toLowerCase()) as IntercityCity,
      (CITY_FROM_PRISMA[b.trip.destination] ?? b.trip.destination.toLowerCase()) as IntercityCity,
    )?.durationMinutes,
    ahora: new Date(),
  });
  if (motivo) throw new PooledTripError(motivo);

  const actualizada = await prisma.seatBooking.update({
    where: { id: bookingId },
    data: { rating, ratingComment },
    include: { seats: true },
  });

  // Los promedios se ESPERAN, como en el viaje urbano. La tentación era
  // lanzarlos sin `await` «para no bloquear», pero la protección ya está
  // dentro: las dos funciones son best-effort y se tragan su propio fallo. Sin
  // esperarlas se abre una carrera —la app recarga y lee la nota vieja— a
  // cambio de nada. Lo cazó el E2E: la empresa seguía sin nota justo después
  // de calificarla.
  if (b.trip.operatorId) await recalcularReputacionEmpresa(b.trip.operatorId);
  await recalcularReputacionConductor(b.trip.driverId);

  return _toBookingDTO(actualizada as unknown as DbSeatBooking);
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribePooledTrip(tripId: string, cb: TripCallback): () => void {
  if (!tripListeners.has(tripId)) tripListeners.set(tripId, new Set());
  tripListeners.get(tripId)!.add(cb);
  return () => tripListeners.get(tripId)?.delete(cb);
}

export async function getPooledTripSnapshot(tripId: string): Promise<PooledTripDTO | null> {
  const t = await _fetchWithBookings(tripId);
  return t ? _toDTO(t, false) : null;
}
