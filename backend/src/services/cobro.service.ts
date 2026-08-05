// ── Cuenta de cobro ───────────────────────────────────────────────────────────
//
// El documento con el que la empresa de carga le factura a su cliente un
// período: «DETALLE DE ENTREGA CUENTA DE COBRO 066 · DETALLE VIAJES
// NACIONALES». Agrupa los viajes del período y lista, viaje por viaje, cada
// línea con su referencia, rollos, metros, destinatario y fecha de entrega.
//
// Dos reglas sostienen que el documento sirva como prueba:
//
//  - Un viaje solo puede estar en UNA cuenta. Si pudiera estar en dos, dos
//    cuentas cobrarían el mismo viaje y la conciliación con el cliente dejaría
//    de probar nada.
//  - Una cuenta emitida queda sellada. Se pueden añadir y quitar viajes
//    mientras es borrador; después no, porque el cliente ya tiene su copia.

import { prisma } from '../lib/prisma';
import { toCargoTripDTO, type CargoTripDTO } from './cargo-trip.service';

export class CobroError extends Error {}

const _incluirViajes = {
  trips: {
    orderBy: { number: 'asc' },
    include: {
      manifests: {
        orderBy: { createdAt: 'asc' },
        include: { items: { orderBy: { position: 'asc' } } },
      },
    },
  },
} as const;

export interface CreateCobroDTO {
  number: string;
  clientName: string;
  fromDate: string;
  toDate: string;
  signedBy?: string;
  notes?: string;
}

export interface CobroTotals {
  trips: number;
  lines: number;
  items: number;
  measure: number;
  weightKg: number;
}

function _fecha(iso: string, campo: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new CobroError(`La ${campo} no es una fecha válida.`);
  return d;
}

function _totales(trips: CargoTripDTO[]): CobroTotals {
  return {
    trips: trips.length,
    lines: trips.reduce((s, t) => s + t.lines.length, 0),
    items: trips.reduce((s, t) => s + t.totalItems, 0),
    measure: Math.round(trips.reduce((s, t) => s + t.totalMeasure, 0) * 10) / 10,
    // Solo los viajes que traen peso: sumar ceros por los que no lo anotaron
    // daría un total que no corresponde a nada pesado de verdad.
    weightKg: trips.reduce((s, t) => s + (t.weightKg ?? 0), 0),
  };
}

type CobroConViajes = Awaited<ReturnType<typeof prisma.cobroAccount.findUnique>> extends null
  ? never
  : NonNullable<Awaited<ReturnType<typeof prisma.cobroAccount.findUnique>>>;

function _toDTO(c: CobroConViajes & { trips: Parameters<typeof toCargoTripDTO>[0][] }) {
  const trips = c.trips.map(toCargoTripDTO);
  return {
    id: c.id,
    number: c.number,
    clientName: c.clientName,
    fromDate: c.fromDate.toISOString(),
    toDate: c.toDate.toISOString(),
    status: c.status,
    issuedAt: c.issuedAt?.toISOString(),
    signedBy: c.signedBy ?? undefined,
    notes: c.notes ?? undefined,
    createdAt: c.createdAt.toISOString(),
    trips,
    totals: _totales(trips),
  };
}

export type CobroDTO = ReturnType<typeof _toDTO>;

export async function createCobro(operatorId: string, dto: CreateCobroDTO): Promise<CobroDTO> {
  if (!dto.number?.trim()) throw new CobroError('Indica el número de la cuenta de cobro.');
  if (!dto.clientName?.trim()) throw new CobroError('Indica a quién se le cobra.');

  const from = _fecha(dto.fromDate, 'fecha desde');
  const to = _fecha(dto.toDate, 'fecha hasta');
  if (to < from) throw new CobroError('La fecha hasta no puede ser anterior a la fecha desde.');

  const numero = dto.number.trim();
  const yaExiste = await prisma.cobroAccount.findFirst({
    where: { operatorId, number: numero },
    select: { id: true },
  });
  if (yaExiste) throw new CobroError(`Ya tienes una cuenta de cobro con el número ${numero}.`);

  const c = await prisma.cobroAccount.create({
    data: {
      operatorId,
      number: numero,
      clientName: dto.clientName.trim(),
      fromDate: from,
      // Hasta el final del día: si no, todo lo del último día queda fuera del
      // cobro y la cuenta sale corta.
      toDate: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999),
      signedBy: dto.signedBy?.trim() || null,
      notes: dto.notes?.trim() || null,
    },
    include: _incluirViajes,
  });
  return _toDTO(c);
}

export async function listCobros(operatorId: string): Promise<Omit<CobroDTO, 'trips'>[]> {
  const filas = await prisma.cobroAccount.findMany({
    where: { operatorId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: _incluirViajes,
  });
  return filas.map((c) => {
    const { trips: _omitido, ...resto } = _toDTO(c);
    return resto;
  });
}

export async function getCobro(operatorId: string, id: string): Promise<CobroDTO | null> {
  const c = await prisma.cobroAccount.findUnique({ where: { id }, include: _incluirViajes });
  if (!c || c.operatorId !== operatorId) return null;
  return _toDTO(c);
}

async function _mia(operatorId: string, id: string) {
  const c = await prisma.cobroAccount.findUnique({ where: { id } });
  if (!c || c.operatorId !== operatorId) throw new CobroError('Esa cuenta no pertenece a tu empresa.');
  return c;
}

function _assertBorrador(c: { status: string }): void {
  if (c.status !== 'DRAFT') {
    throw new CobroError('La cuenta ya fue emitida. Anúlala si necesitas rehacerla.');
  }
}

/**
 * Mete en la cuenta todos los viajes completados del período que aún no estén
 * facturados. `updateMany` con `cobroId: null` en el where hace la toma
 * atómica: dos cuentas armadas a la vez no pueden llevarse el mismo viaje.
 */
export async function fillCobroFromPeriod(operatorId: string, id: string): Promise<CobroDTO> {
  const c = await _mia(operatorId, id);
  _assertBorrador(c);

  await prisma.cargoTrip.updateMany({
    where: {
      operatorId,
      cobroId: null,
      status: 'COMPLETED',
      completedAt: { gte: c.fromDate, lte: c.toDate },
    },
    data: { cobroId: id },
  });
  return (await getCobro(operatorId, id))!;
}

export async function addTripToCobro(
  operatorId: string,
  id: string,
  tripId: string,
): Promise<CobroDTO> {
  const c = await _mia(operatorId, id);
  _assertBorrador(c);
  const res = await prisma.cargoTrip.updateMany({
    where: { id: tripId, operatorId, cobroId: null, status: { not: 'CANCELLED' } },
    data: { cobroId: id },
  });
  if (res.count === 0) {
    throw new CobroError('Ese viaje no existe, está cancelado o ya está en otra cuenta de cobro.');
  }
  return (await getCobro(operatorId, id))!;
}

export async function removeTripFromCobro(
  operatorId: string,
  id: string,
  tripId: string,
): Promise<CobroDTO> {
  const c = await _mia(operatorId, id);
  _assertBorrador(c);
  const res = await prisma.cargoTrip.updateMany({
    where: { id: tripId, operatorId, cobroId: id },
    data: { cobroId: null },
  });
  if (res.count === 0) throw new CobroError('Ese viaje no está en esta cuenta.');
  return (await getCobro(operatorId, id))!;
}

/** Emite la cuenta: queda sellada y sus viajes ya no se pueden mover. */
export async function issueCobro(
  operatorId: string,
  id: string,
  signedBy?: string,
): Promise<CobroDTO> {
  const c = await _mia(operatorId, id);
  _assertBorrador(c);

  const viajes = await prisma.cargoTrip.count({ where: { cobroId: id } });
  // Emitir una cuenta vacía le mandaría al cliente un documento que no cobra
  // nada y ocuparía un número del talonario.
  if (viajes === 0) throw new CobroError('La cuenta no tiene viajes. Añade al menos uno antes de emitirla.');

  const res = await prisma.cobroAccount.updateMany({
    where: { id, status: 'DRAFT' },
    data: {
      status: 'ISSUED',
      issuedAt: new Date(),
      ...(signedBy?.trim() ? { signedBy: signedBy.trim() } : {}),
    },
  });
  if (res.count === 0) throw new CobroError('La cuenta ya fue emitida.');
  return (await getCobro(operatorId, id))!;
}

/** Anula la cuenta y libera sus viajes para poder refacturarlos. */
export async function voidCobro(operatorId: string, id: string): Promise<CobroDTO> {
  await _mia(operatorId, id);
  await prisma.$transaction([
    prisma.cargoTrip.updateMany({ where: { cobroId: id }, data: { cobroId: null } }),
    prisma.cobroAccount.update({ where: { id }, data: { status: 'VOID' } }),
  ]);
  return (await getCobro(operatorId, id))!;
}

/** CSV con el mismo detalle del documento impreso. */
export function cobroToCsv(c: CobroDTO): string {
  const header = [
    'Viaje', 'Origen', 'Referencia', 'Rollos', 'Metros', 'Peso_kg',
    'Fecha_entrega', 'Cliente', 'Destino',
  ];
  const filas: string[][] = [];

  for (const t of c.trips) {
    const origen = [t.originCity, t.originPlace].filter(Boolean).join(' ');
    if (t.lines.length === 0) {
      // Acarreo urbano: el viaje se cobra aunque no liste mercancía.
      filas.push([
        String(t.number), origen, t.isUrban ? 'URBANO' : '', '', '',
        t.weightKg ? String(t.weightKg) : '', '', '', '',
      ]);
      continue;
    }
    t.lines.forEach((l, i) => {
      filas.push([
        // El número del viaje va solo en su primera línea, como en el papel.
        i === 0 ? String(t.number) : '',
        i === 0 ? origen : '',
        l.reference ?? '',
        String(l.totalItems ?? 0),
        String(l.totalMeasure ?? 0),
        // El peso es del viaje: se anota una sola vez, en la última línea.
        i === t.lines.length - 1 && t.weightKg ? String(t.weightKg) : '',
        l.deliveredOn ? l.deliveredOn.slice(0, 10) : '',
        l.clientName,
        l.clientCity ?? '',
      ]);
    });
  }

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...filas].map((cols) => cols.map((x) => esc(String(x))).join(',')).join('\r\n');
}
