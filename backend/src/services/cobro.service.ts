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
import {
  assertPaymentAmount, cobroBalance, PaymentAmountError,
  type CobroPaymentKind,
} from '../lib/cobro-balance';

export class CobroError extends Error {}

const _incluirViajes = {
  payments: { orderBy: { paidAt: 'asc' } },
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
  /** Suma del flete de los viajes: el valor que se le cobra al cliente. */
  amount: number;
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
    amount: Math.round(trips.reduce((s, t) => s + (t.freightAmount ?? 0), 0)),
  };
}

type CobroConViajes = Awaited<ReturnType<typeof prisma.cobroAccount.findUnique>> extends null
  ? never
  : NonNullable<Awaited<ReturnType<typeof prisma.cobroAccount.findUnique>>>;

export interface PaymentDTO {
  id: string;
  amount: number;
  kind: CobroPaymentKind;
  method?: string;
  reference?: string;
  notes?: string;
  receiptUrl?: string;
  paidAt: string;
  voidedAt?: string;
}

interface DbPayment {
  id: string; amount: number; kind: string; method: string | null;
  reference: string | null; notes: string | null; receiptUrl: string | null;
  paidAt: Date; voidedAt: Date | null;
}

function _pagoToDTO(p: DbPayment): PaymentDTO {
  return {
    id: p.id,
    amount: p.amount,
    kind: p.kind as CobroPaymentKind,
    method: p.method ?? undefined,
    reference: p.reference ?? undefined,
    notes: p.notes ?? undefined,
    receiptUrl: p.receiptUrl ?? undefined,
    paidAt: p.paidAt.toISOString(),
    voidedAt: p.voidedAt?.toISOString(),
  };
}

function _toDTO(
  c: CobroConViajes & {
    trips: Parameters<typeof toCargoTripDTO>[0][];
    payments?: DbPayment[];
  },
) {
  const trips = c.trips.map(toCargoTripDTO);
  const pagos = c.payments ?? [];
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
    payments: pagos.map(_pagoToDTO),
    // El saldo se deriva SIEMPRE de los viajes y los pagos: nunca se guarda,
    // para que no puedan quedar en desacuerdo.
    balance: cobroBalance(_totales(trips).amount, pagos),
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


// ─── Pagos ────────────────────────────────────────────────────────────────────

export interface AddPaymentDTO {
  amount: number;
  kind?: string;
  method?: string;
  reference?: string;
  notes?: string;
  receiptUrl?: string;
  paidAt?: string;
  /** El cliente adelanta más de lo que debe: hay que pedirlo a propósito. */
  allowOverpay?: boolean;
}

const _KINDS: CobroPaymentKind[] = ['ANTICIPO', 'ABONO', 'SALDO'];

/**
 * Registra un pago contra la cuenta: un anticipo, un abono parcial o el saldo.
 *
 * Se admite sobre una cuenta en BORRADOR además de emitida, porque el anticipo
 * normalmente se cobra AL DESPACHAR, antes de que exista el documento final.
 * Sobre una cuenta anulada no: sus viajes ya volvieron al tablero.
 */
export async function addCobroPayment(
  operatorId: string,
  id: string,
  dto: AddPaymentDTO,
): Promise<CobroDTO> {
  const c = await _mia(operatorId, id);
  if (c.status === 'VOID') throw new CobroError('La cuenta está anulada.');

  const kind = String(dto.kind ?? 'ABONO').toUpperCase() as CobroPaymentKind;
  if (!_KINDS.includes(kind)) {
    throw new CobroError(`El tipo de pago debe ser uno de: ${_KINDS.join(', ')}.`);
  }

  const actual = await getCobro(operatorId, id);
  if (!actual) throw new CobroError('Esa cuenta no pertenece a tu empresa.');
  // Sin valor facturado no hay contra qué abonar: el anticipo quedaría colgado
  // y el saldo saldría negativo desde el primer peso.
  if (actual.totals.amount <= 0) {
    throw new CobroError(
      'La cuenta todavía no tiene valor. Ponle precio a los viajes antes de registrar pagos.',
    );
  }

  try {
    assertPaymentAmount(dto.amount, actual.balance.balance, dto.allowOverpay === true);
  } catch (e) {
    if (e instanceof PaymentAmountError) throw new CobroError(e.message);
    throw e;
  }

  let paidAt: Date | undefined;
  if (dto.paidAt) {
    const d = new Date(dto.paidAt);
    if (Number.isNaN(d.getTime())) throw new CobroError('La fecha del pago no es válida.');
    paidAt = d;
  }

  await prisma.cobroPayment.create({
    data: {
      cobroId: id,
      amount: Math.round(dto.amount),
      kind,
      method: dto.method?.trim() || null,
      reference: dto.reference?.trim() || null,
      notes: dto.notes?.trim() || null,
      receiptUrl: dto.receiptUrl?.trim() || null,
      ...(paidAt ? { paidAt } : {}),
    },
  });
  return (await getCobro(operatorId, id))!;
}

/**
 * Anula un pago mal cargado. No se borra ni se edita: un recibo que cambia de
 * monto después de entregado no prueba nada, así que queda la constancia de
 * que existió y de que se anuló.
 */
export async function voidCobroPayment(
  operatorId: string,
  id: string,
  paymentId: string,
): Promise<CobroDTO> {
  await _mia(operatorId, id);
  const res = await prisma.cobroPayment.updateMany({
    where: { id: paymentId, cobroId: id, voidedAt: null },
    data: { voidedAt: new Date() },
  });
  if (res.count === 0) throw new CobroError('Ese pago no existe en esta cuenta o ya está anulado.');
  return (await getCobro(operatorId, id))!;
}

/** CSV con el mismo detalle del documento impreso. */
export function cobroToCsv(c: CobroDTO): string {
  const header = [
    'Viaje', 'Origen', 'Referencia', 'Rollos', 'Metros', 'Peso_kg',
    'Fecha_entrega', 'Cliente', 'Destino', 'Valor_flete_COP',
  ];
  const filas: string[][] = [];

  for (const t of c.trips) {
    const origen = [t.originCity, t.originPlace].filter(Boolean).join(' ');
    if (t.lines.length === 0) {
      // Acarreo urbano: el viaje se cobra aunque no liste mercancía.
      filas.push([
        String(t.number), origen, t.isUrban ? 'URBANO' : '', '', '',
        t.weightKg ? String(t.weightKg) : '', '', '', '',
        t.freightAmount ? String(Math.round(t.freightAmount)) : '',
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
        // El valor es del viaje: como el peso, se anota una sola vez.
        i === t.lines.length - 1 && t.freightAmount ? String(Math.round(t.freightAmount)) : '',
      ]);
    });
  }

  // Pie con el estado de pago: quien abre el CSV para conciliar necesita ver
  // cuánto se facturó, cuánto entró y qué queda debiendo.
  const b = c.balance;
  filas.push([]);
  filas.push(['TOTAL FACTURADO', '', '', '', '', '', '', '', '', String(b.total)]);
  filas.push(['PAGADO', '', '', '', '', '', '', '', '', String(b.paid)]);
  filas.push(['SALDO', '', '', '', '', '', '', '', '', String(b.balance)]);

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...filas].map((cols) => cols.map((x) => esc(String(x))).join(',')).join('\r\n');
}
