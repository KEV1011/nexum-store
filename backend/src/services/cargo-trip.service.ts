// ── Viaje de carga ────────────────────────────────────────────────────────────
//
// Un camión sale con mercancía de VARIOS clientes, cada uno con su referencia,
// su destino y su fecha de entrega. El modelo de fletes no podía representarlo:
// `FreightRequest` es un cliente, un origen y un destino.
//
// Aquí el viaje agrupa remitos. Cada `FreightManifest` es una línea del
// despacho —y ya traía todo lo que la línea necesita: referencia, destinatario,
// ciudad de destino, bultos y medida—, así que no se duplica nada: el viaje
// solo aporta lo común al camión (de dónde salió, quién condujo, peso total).

import { CargoTripStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createManifest, toManifestDTO, type CreateManifestDTO } from './manifest.service';

export class CargoTripError extends Error {}

const _incluirLineas = {
  manifests: {
    orderBy: { createdAt: 'asc' },
    include: { items: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.CargoTripInclude;

type TripConLineas = Prisma.CargoTripGetPayload<{ include: typeof _incluirLineas }>;

export interface CreateCargoTripDTO {
  originCity: string;
  originPlace?: string;
  weightKg?: number;
  isUrban?: boolean;
  driverId?: string;
  vehicleId?: string;
  scheduledAt?: string;
  notes?: string;
}

export function toCargoTripDTO(t: TripConLineas) {
  const lineas = t.manifests.filter((m) => m.status !== 'CANCELLED');
  // Rollos y metros del viaje = suma de sus líneas. Se calculan y no se
  // guardan: si el operador corrige una línea, el total tiene que seguirla.
  const totalItems = lineas.reduce(
    (s, m) => s + (m.totalItems ?? m.items.length), 0,
  );
  const totalMeasure = lineas.reduce(
    (s, m) => s + (m.totalMeasure ?? m.items.reduce((a, i) => a + i.measure, 0)), 0,
  );

  return {
    id: t.id,
    number: t.number,
    originCity: t.originCity,
    originPlace: t.originPlace ?? undefined,
    weightKg: t.weightKg ?? undefined,
    isUrban: t.isUrban,
    driverId: t.driverId ?? undefined,
    vehicleId: t.vehicleId ?? undefined,
    driverName: t.driverName ?? undefined,
    vehiclePlate: t.vehiclePlate ?? undefined,
    status: t.status,
    notes: t.notes ?? undefined,
    scheduledAt: t.scheduledAt?.toISOString(),
    dispatchedAt: t.dispatchedAt?.toISOString(),
    completedAt: t.completedAt?.toISOString(),
    createdAt: t.createdAt.toISOString(),
    cobroId: t.cobroId ?? undefined,
    totalItems,
    totalMeasure: Math.round(totalMeasure * 10) / 10,
    lines: lineas.map(toManifestDTO),
  };
}

export type CargoTripDTO = ReturnType<typeof toCargoTripDTO>;

/**
 * Consecutivo por empresa, como el talonario de papel: dos flotas distintas
 * pueden tener el viaje 01 sin chocar.
 */
async function _siguienteNumero(operatorId: string): Promise<number> {
  const ultimo = await prisma.cargoTrip.findFirst({
    where: { operatorId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (ultimo?.number ?? 0) + 1;
}

function _fecha(iso: string | undefined, campo: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new CargoTripError(`La ${campo} no es una fecha válida.`);
  return d;
}

export async function createCargoTrip(
  operatorId: string,
  dto: CreateCargoTripDTO,
): Promise<CargoTripDTO> {
  if (!dto.originCity?.trim()) {
    throw new CargoTripError('Indica la ciudad de origen del viaje.');
  }
  if (dto.weightKg != null && !(dto.weightKg > 0)) {
    throw new CargoTripError('El peso del viaje debe ser mayor a cero.');
  }

  const t = await prisma.cargoTrip.create({
    data: {
      operatorId,
      number: await _siguienteNumero(operatorId),
      originCity: dto.originCity.trim(),
      originPlace: dto.originPlace?.trim() || null,
      weightKg: dto.weightKg ?? null,
      isUrban: dto.isUrban ?? false,
      driverId: dto.driverId || null,
      vehicleId: dto.vehicleId || null,
      scheduledAt: _fecha(dto.scheduledAt, 'fecha programada'),
      notes: dto.notes?.trim() || null,
    },
    include: _incluirLineas,
  });
  return toCargoTripDTO(t);
}

export async function listCargoTrips(
  operatorId: string,
  opts: { from?: string; to?: string; sinFacturar?: boolean } = {},
): Promise<CargoTripDTO[]> {
  const rango: Prisma.DateTimeFilter = {};
  const desde = _fecha(opts.from, 'fecha desde');
  const hasta = _fecha(opts.to, 'fecha hasta');
  if (desde) rango.gte = desde;
  if (hasta) rango.lte = hasta;

  const filas = await prisma.cargoTrip.findMany({
    where: {
      operatorId,
      ...(desde || hasta ? { createdAt: rango } : {}),
      ...(opts.sinFacturar ? { cobroId: null } : {}),
      status: { not: 'CANCELLED' },
    },
    orderBy: { number: 'asc' },
    take: 300,
    include: _incluirLineas,
  });
  return filas.map(toCargoTripDTO);
}

export async function getCargoTrip(
  operatorId: string,
  id: string,
): Promise<CargoTripDTO | null> {
  const t = await prisma.cargoTrip.findUnique({ where: { id }, include: _incluirLineas });
  if (!t || t.operatorId !== operatorId) return null;
  return toCargoTripDTO(t);
}

/** Comprueba pertenencia y devuelve el viaje crudo, o lanza. */
async function _mio(operatorId: string, id: string) {
  const t = await prisma.cargoTrip.findUnique({ where: { id } });
  if (!t || t.operatorId !== operatorId) {
    throw new CargoTripError('Ese viaje no pertenece a tu empresa.');
  }
  return t;
}

/**
 * Un viaje ya facturado no se toca: si se pudiera, la cuenta de cobro que el
 * cliente ya recibió dejaría de cuadrar con lo que dice el sistema.
 */
function _assertEditable(t: { cobroId: string | null; status: CargoTripStatus }): void {
  if (t.cobroId) {
    throw new CargoTripError('Este viaje ya está en una cuenta de cobro. Quítalo de la cuenta para editarlo.');
  }
  if (t.status === 'CANCELLED') throw new CargoTripError('El viaje está cancelado.');
}

export async function updateCargoTrip(
  operatorId: string,
  id: string,
  dto: Partial<CreateCargoTripDTO>,
): Promise<CargoTripDTO> {
  const t = await _mio(operatorId, id);
  _assertEditable(t);
  if (dto.weightKg != null && !(dto.weightKg > 0)) {
    throw new CargoTripError('El peso del viaje debe ser mayor a cero.');
  }

  await prisma.cargoTrip.update({
    where: { id },
    data: {
      ...(dto.originCity !== undefined ? { originCity: dto.originCity.trim() } : {}),
      ...(dto.originPlace !== undefined ? { originPlace: dto.originPlace?.trim() || null } : {}),
      ...(dto.weightKg !== undefined ? { weightKg: dto.weightKg ?? null } : {}),
      ...(dto.isUrban !== undefined ? { isUrban: dto.isUrban } : {}),
      ...(dto.driverId !== undefined ? { driverId: dto.driverId || null } : {}),
      ...(dto.vehicleId !== undefined ? { vehicleId: dto.vehicleId || null } : {}),
      ...(dto.scheduledAt !== undefined ? { scheduledAt: _fecha(dto.scheduledAt, 'fecha programada') } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
    },
  });
  return (await getCargoTrip(operatorId, id))!;
}

export interface AddTripLineDTO extends CreateManifestDTO {
  /** Fecha de entrega que irá en la cuenta de cobro. */
  deliveredOn?: string;
}

/**
 * Añade una línea al viaje. La línea ES un remito: así el mismo documento sirve
 * para la bodega (qué salió), para el conductor (qué concilia al entregar) y
 * para la cuenta de cobro (qué se factura), sin tres tablas que se contradigan.
 */
export async function addTripLine(
  operatorId: string,
  tripId: string,
  dto: AddTripLineDTO,
): Promise<CargoTripDTO> {
  const t = await _mio(operatorId, tripId);
  _assertEditable(t);

  const m = await createManifest(operatorId, dto);
  await prisma.freightManifest.update({
    where: { id: m.id },
    data: {
      cargoTripId: tripId,
      deliveredOn: _fecha(dto.deliveredOn, 'fecha de entrega'),
      // El punto de salida del viaje sirve de bodega por defecto para la línea.
      ...(dto.warehouse ? {} : { warehouse: t.originPlace ?? t.originCity }),
    },
  });
  return (await getCargoTrip(operatorId, tripId))!;
}

/** Saca una línea del viaje sin borrar el remito (queda suelto). */
export async function detachTripLine(
  operatorId: string,
  tripId: string,
  manifestId: string,
): Promise<CargoTripDTO> {
  const t = await _mio(operatorId, tripId);
  _assertEditable(t);
  const res = await prisma.freightManifest.updateMany({
    where: { id: manifestId, operatorId, cargoTripId: tripId },
    data: { cargoTripId: null },
  });
  if (res.count === 0) throw new CargoTripError('Esa línea no pertenece a este viaje.');
  return (await getCargoTrip(operatorId, tripId))!;
}

/** Cuelga un remito ya existente (creado suelto) de este viaje. */
export async function attachTripLine(
  operatorId: string,
  tripId: string,
  manifestId: string,
): Promise<CargoTripDTO> {
  const t = await _mio(operatorId, tripId);
  _assertEditable(t);
  const res = await prisma.freightManifest.updateMany({
    where: { id: manifestId, operatorId, cargoTripId: null },
    data: { cargoTripId: tripId },
  });
  if (res.count === 0) {
    throw new CargoTripError('Ese remito no existe, no es de tu empresa o ya está en otro viaje.');
  }
  return (await getCargoTrip(operatorId, tripId))!;
}

/**
 * Cambia el estado del viaje. Al despachar se copian conductor y placa: el
 * documento no puede cambiar si mañana se edita el perfil del conductor.
 */
export async function setCargoTripStatus(
  operatorId: string,
  tripId: string,
  status: 'dispatched' | 'completed' | 'cancelled',
): Promise<CargoTripDTO> {
  const t = await _mio(operatorId, tripId);
  if (t.cobroId && status === 'cancelled') {
    throw new CargoTripError('No puedes cancelar un viaje que ya está facturado.');
  }

  if (status === 'dispatched') {
    if (t.status !== 'DRAFT') throw new CargoTripError('Solo un viaje en borrador puede despacharse.');
    const lineas = await prisma.freightManifest.count({
      where: { cargoTripId: tripId, status: { not: 'CANCELLED' } },
    });
    // Un viaje sin líneas ni marca de urbano no describe nada que se pueda
    // cobrar; el acarreo urbano sí sale vacío a propósito.
    if (lineas === 0 && !t.isUrban) {
      throw new CargoTripError('Añade al menos una línea de mercancía, o marca el viaje como urbano.');
    }

    const [d, v] = await Promise.all([
      t.driverId ? prisma.driver.findUnique({ where: { id: t.driverId }, select: { name: true } }) : null,
      t.vehicleId ? prisma.vehicle.findUnique({ where: { id: t.vehicleId }, select: { plate: true } }) : null,
    ]);
    await prisma.cargoTrip.update({
      where: { id: tripId },
      data: {
        status: 'DISPATCHED',
        dispatchedAt: new Date(),
        driverName: d?.name ?? t.driverName,
        vehiclePlate: v?.plate ?? t.vehiclePlate,
      },
    });
  } else if (status === 'completed') {
    const res = await prisma.cargoTrip.updateMany({
      where: { id: tripId, status: { in: ['DRAFT', 'DISPATCHED'] } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (res.count === 0) throw new CargoTripError('El viaje ya está completado o cancelado.');
  } else {
    const res = await prisma.cargoTrip.updateMany({
      where: { id: tripId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED' },
    });
    if (res.count === 0) throw new CargoTripError('El viaje ya está cancelado.');
  }

  return (await getCargoTrip(operatorId, tripId))!;
}
