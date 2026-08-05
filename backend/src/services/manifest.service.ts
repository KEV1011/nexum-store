// ── Remito de salida de mercancía ─────────────────────────────────────────────
//
// Digitaliza el formato en papel "SALIDA DE MERCANCÍA": la flota arma el remito
// en el portal (destinatario, conductor, vehículo y la lista de bultos con su
// medida), lo despacha, y el conductor lo concilia bulto por bulto al entregar.
//
// Lo que el papel no podía hacer: el formato en papel solo dice "se recibe a
// satisfacción". Si llegaban 16 rollos en vez de 17, o uno traía 90 metros en
// vez de 113, no había forma de probarlo — la diferencia aparecía semanas
// después, en el reclamo, sin evidencia de qué lado falló. Aquí cada bulto
// lleva medida declarada y medida recibida, y la diferencia queda sellada con
// foto en el momento de la entrega.

import { Prisma, ManifestStatus, ManifestItemStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/** Máximo de renglones: el formato en papel tiene 100 casillas. */
const MAX_ITEMS = 100;

export interface ManifestItemInput {
  position?: number;
  measure: number;
  code?: string;
  note?: string;
}

export interface CreateManifestDTO {
  reference?: string;
  warehouse?: string;
  clientName: string;
  clientAddress?: string;
  clientCity?: string;
  unitLabel?: string;
  measureLabel?: string;
  authorizedBy?: string;
  notes?: string;
  items?: ManifestItemInput[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Consecutivo legible por empresa (REM-0001). Se calcula del último remito de
 * ESA empresa: dos flotas distintas pueden tener el mismo número sin chocar,
 * igual que dos talonarios de papel.
 */
async function _siguienteCodigo(operatorId: string): Promise<string> {
  const ultimo = await prisma.freightManifest.findFirst({
    where: { operatorId },
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  const n = Number(ultimo?.code?.replace(/\D/g, '') ?? 0) + 1;
  return `REM-${String(n).padStart(4, '0')}`;
}

function _validarItems(items: ManifestItemInput[]): ManifestItemInput[] {
  if (items.length > MAX_ITEMS) {
    throw new ManifestError(`Un remito admite máximo ${MAX_ITEMS} bultos.`);
  }
  return items.map((it, i) => {
    const measure = Number(it.measure);
    if (!Number.isFinite(measure) || measure <= 0) {
      throw new ManifestError(
        `El bulto ${it.position ?? i + 1} necesita una medida mayor que cero.`,
      );
    }
    return {
      position: it.position ?? i + 1,
      measure,
      code: it.code?.trim() || undefined,
      note: it.note?.trim() || undefined,
    };
  });
}

/** Redondeo a un decimal: los metrajes del formato vienen con un decimal. */
function _redondear(n: number): number {
  return Math.round(n * 10) / 10;
}

const _incluirItems = {
  items: { orderBy: { position: 'asc' } },
} satisfies Prisma.FreightManifestInclude;

type ManifestConItems = Prisma.FreightManifestGetPayload<{
  include: typeof _incluirItems;
}>;

export function toManifestDTO(m: ManifestConItems) {
  const declarado = m.items.reduce((s, it) => s + it.measure, 0);
  const recibido = m.items.reduce((s, it) => s + (it.receivedMeasure ?? 0), 0);
  return {
    id: m.id,
    code: m.code,
    reference: m.reference ?? undefined,
    warehouse: m.warehouse ?? undefined,
    clientName: m.clientName,
    clientAddress: m.clientAddress ?? undefined,
    clientCity: m.clientCity ?? undefined,
    freightId: m.freightId ?? undefined,
    driverId: m.driverId ?? undefined,
    driverName: m.driverName ?? undefined,
    driverIdNumber: m.driverIdNumber ?? undefined,
    vehiclePlate: m.vehiclePlate ?? undefined,
    unitLabel: m.unitLabel,
    measureLabel: m.measureLabel,
    status: m.status,
    authorizedBy: m.authorizedBy ?? undefined,
    notes: m.notes ?? undefined,
    // Totales: los sellados al despachar mandan; mientras es borrador se
    // calculan en vivo para que el portal muestre la suma mientras se teclea.
    totalItems: m.totalItems ?? m.items.length,
    totalMeasure: _redondear(m.totalMeasure ?? declarado),
    receivedMeasure: m.status === 'RECEIVED' ? _redondear(recibido) : undefined,
    discrepancyCount: m.discrepancyCount,
    receivedByName: m.receivedByName ?? undefined,
    receivedByIdNumber: m.receivedByIdNumber ?? undefined,
    receivedAt: m.receivedAt?.toISOString(),
    receiptPhotoUrl: m.receiptPhotoUrl ?? undefined,
    createdAt: m.createdAt.toISOString(),
    dispatchedAt: m.dispatchedAt?.toISOString(),
    cargoTripId: m.cargoTripId ?? undefined,
    // Fecha de entrega para la cuenta de cobro: manda la sellada al conciliar,
    // y si no la hay se usa la que se cargó a mano (despachos ya entregados
    // que se están pasando del papel al sistema).
    deliveredOn: (m.receivedAt ?? m.deliveredOn)?.toISOString(),
    items: m.items.map((it) => ({
      id: it.id,
      position: it.position,
      measure: it.measure,
      code: it.code ?? undefined,
      note: it.note ?? undefined,
      receivedMeasure: it.receivedMeasure ?? undefined,
      status: it.itemStatus,
      receivedNote: it.receivedNote ?? undefined,
      photoUrl: it.photoUrl ?? undefined,
    })),
  };
}

export type ManifestDTO = ReturnType<typeof toManifestDTO>;

// ── Portal de la flota ────────────────────────────────────────────────────────

export async function createManifest(
  operatorId: string,
  dto: CreateManifestDTO,
): Promise<ManifestDTO> {
  if (!dto.clientName?.trim()) {
    throw new ManifestError('Indica a quién va dirigida la mercancía.');
  }
  const items = _validarItems(dto.items ?? []);

  const m = await prisma.freightManifest.create({
    data: {
      operatorId,
      code: await _siguienteCodigo(operatorId),
      reference: dto.reference?.trim() || null,
      warehouse: dto.warehouse?.trim() || null,
      clientName: dto.clientName.trim(),
      clientAddress: dto.clientAddress?.trim() || null,
      clientCity: dto.clientCity?.trim() || null,
      unitLabel: dto.unitLabel?.trim() || 'bulto',
      measureLabel: dto.measureLabel?.trim() || 'unidades',
      authorizedBy: dto.authorizedBy?.trim() || null,
      notes: dto.notes?.trim() || null,
      items: { create: items.map((it) => ({
        position: it.position!,
        measure: it.measure,
        code: it.code ?? null,
        note: it.note ?? null,
      })) },
    },
    include: _incluirItems,
  });
  return toManifestDTO(m);
}

export async function listManifests(
  operatorId: string,
  status?: string,
): Promise<ManifestDTO[]> {
  const filas = await prisma.freightManifest.findMany({
    where: {
      operatorId,
      ...(status && Object.values(ManifestStatus).includes(status as ManifestStatus)
        ? { status: status as ManifestStatus }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: _incluirItems,
  });
  return filas.map(toManifestDTO);
}

export async function getManifest(
  operatorId: string,
  id: string,
): Promise<ManifestDTO | null> {
  const m = await prisma.freightManifest.findFirst({
    where: { id, operatorId },
    include: _incluirItems,
  });
  return m ? toManifestDTO(m) : null;
}

/**
 * Reemplaza la lista de bultos completa. Solo en borrador: una vez despachado,
 * el remito es la constancia de lo que salió de bodega y no se puede reescribir
 * (si se pudiera, la conciliación no probaría nada).
 */
export async function setManifestItems(
  operatorId: string,
  id: string,
  items: ManifestItemInput[],
): Promise<ManifestDTO> {
  const actual = await prisma.freightManifest.findFirst({
    where: { id, operatorId },
    select: { status: true },
  });
  if (!actual) throw new ManifestError('El remito no existe.');
  if (actual.status !== 'DRAFT') {
    throw new ManifestError('El remito ya salió de bodega y no se puede modificar.');
  }
  const validos = _validarItems(items);

  const m = await prisma.$transaction(async (tx) => {
    await tx.freightManifestItem.deleteMany({ where: { manifestId: id } });
    if (validos.length > 0) {
      await tx.freightManifestItem.createMany({
        data: validos.map((it) => ({
          manifestId: id,
          position: it.position!,
          measure: it.measure,
          code: it.code ?? null,
          note: it.note ?? null,
        })),
      });
    }
    return tx.freightManifest.findUniqueOrThrow({
      where: { id },
      include: _incluirItems,
    });
  });
  return toManifestDTO(m);
}

export async function updateManifest(
  operatorId: string,
  id: string,
  dto: Partial<CreateManifestDTO>,
): Promise<ManifestDTO> {
  const actual = await prisma.freightManifest.findFirst({
    where: { id, operatorId },
    select: { status: true },
  });
  if (!actual) throw new ManifestError('El remito no existe.');
  if (actual.status !== 'DRAFT') {
    throw new ManifestError('El remito ya salió de bodega y no se puede modificar.');
  }
  const m = await prisma.freightManifest.update({
    where: { id },
    data: {
      ...(dto.reference !== undefined && { reference: dto.reference?.trim() || null }),
      ...(dto.warehouse !== undefined && { warehouse: dto.warehouse?.trim() || null }),
      ...(dto.clientName !== undefined && dto.clientName.trim() && { clientName: dto.clientName.trim() }),
      ...(dto.clientAddress !== undefined && { clientAddress: dto.clientAddress?.trim() || null }),
      ...(dto.clientCity !== undefined && { clientCity: dto.clientCity?.trim() || null }),
      ...(dto.unitLabel !== undefined && dto.unitLabel.trim() && { unitLabel: dto.unitLabel.trim() }),
      ...(dto.measureLabel !== undefined && dto.measureLabel.trim() && { measureLabel: dto.measureLabel.trim() }),
      ...(dto.authorizedBy !== undefined && { authorizedBy: dto.authorizedBy?.trim() || null }),
      ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
    },
    include: _incluirItems,
  });
  return toManifestDTO(m);
}

/**
 * Despacha: sella los totales y copia la identidad del conductor y el vehículo.
 *
 * Se copian (no se referencian) a propósito: el remito es un documento con
 * valor probatorio. Si mañana el conductor corrige su cédula o el vehículo
 * cambia de placa, el papel que se firmó ese día no puede cambiar con él.
 */
export async function dispatchManifest(
  operatorId: string,
  id: string,
  opts: { driverId: string; vehicleId?: string; freightId?: string },
): Promise<ManifestDTO> {
  const m = await prisma.freightManifest.findFirst({
    where: { id, operatorId },
    include: _incluirItems,
  });
  if (!m) throw new ManifestError('El remito no existe.');
  if (m.status !== 'DRAFT') throw new ManifestError('Este remito ya fue despachado.');
  if (m.items.length === 0) {
    throw new ManifestError('Agrega al menos un bulto antes de despachar.');
  }

  // El conductor tiene que estar afiliado a ESTA empresa.
  const driver = await prisma.driver.findFirst({
    where: { id: opts.driverId, operatorId },
    select: { id: true, name: true, documentNumber: true },
  });
  if (!driver) {
    throw new ManifestError('El conductor no está afiliado a tu empresa.');
  }

  let plate: string | null = null;
  if (opts.vehicleId) {
    const v = await prisma.vehicle.findFirst({
      where: { id: opts.vehicleId, operatorId },
      select: { plate: true },
    });
    if (!v) throw new ManifestError('El vehículo no pertenece a tu empresa.');
    plate = v.plate;
  }

  const totalMeasure = _redondear(m.items.reduce((s, it) => s + it.measure, 0));

  const actualizado = await prisma.freightManifest.update({
    where: { id },
    data: {
      status: 'DISPATCHED',
      dispatchedAt: new Date(),
      driverId: driver.id,
      driverName: driver.name,
      driverIdNumber: driver.documentNumber,
      vehiclePlate: plate,
      freightId: opts.freightId ?? null,
      totalItems: m.items.length,
      totalMeasure,
    },
    include: _incluirItems,
  });
  return toManifestDTO(actualizado);
}

export async function cancelManifest(
  operatorId: string,
  id: string,
): Promise<ManifestDTO> {
  const res = await prisma.freightManifest.updateMany({
    where: { id, operatorId, status: { in: ['DRAFT', 'DISPATCHED'] } },
    data: { status: 'CANCELLED' },
  });
  if (res.count === 0) {
    throw new ManifestError('El remito no existe o ya fue recibido.');
  }
  const m = await prisma.freightManifest.findUniqueOrThrow({
    where: { id },
    include: _incluirItems,
  });
  return toManifestDTO(m);
}

// ── App del conductor ─────────────────────────────────────────────────────────

/** Remitos que lleva este conductor (despachados y sin conciliar). */
export async function listDriverManifests(driverId: string): Promise<ManifestDTO[]> {
  const filas = await prisma.freightManifest.findMany({
    where: { driverId, status: { in: ['DISPATCHED', 'RECEIVED'] } },
    orderBy: { dispatchedAt: 'desc' },
    take: 30,
    include: _incluirItems,
  });
  return filas.map(toManifestDTO);
}

export async function getDriverManifest(
  driverId: string,
  id: string,
): Promise<ManifestDTO | null> {
  const m = await prisma.freightManifest.findFirst({
    where: { id, driverId },
    include: _incluirItems,
  });
  return m ? toManifestDTO(m) : null;
}

export interface ReceiveItemInput {
  position: number;
  status: 'OK' | 'SHORT' | 'MISSING' | 'DAMAGED';
  receivedMeasure?: number;
  note?: string;
  photoUrl?: string;
}

export interface ReceiveManifestDTO {
  receivedByName: string;
  receivedByIdNumber?: string;
  receiptPhotoUrl?: string;
  items: ReceiveItemInput[];
}

/**
 * Conciliación de la entrega: el conductor marca cada bulto y quien recibe
 * queda registrado con su nombre y cédula.
 *
 * Los bultos que no se reportan se dan por conformes (recibidos completos):
 * exigir tocar los 17 uno por uno en la calle garantizaría que nadie lo use.
 * Lo que importa es que la excepción quede registrada, no la rutina.
 */
export async function receiveManifest(
  driverId: string,
  id: string,
  dto: ReceiveManifestDTO,
): Promise<ManifestDTO> {
  if (!dto.receivedByName?.trim()) {
    throw new ManifestError('Escribe el nombre de quien recibe la mercancía.');
  }

  const m = await prisma.freightManifest.findFirst({
    where: { id, driverId },
    include: _incluirItems,
  });
  if (!m) throw new ManifestError('El remito no existe o no es tuyo.');
  if (m.status !== 'DISPATCHED') {
    throw new ManifestError('Este remito ya fue conciliado.');
  }

  const porPosicion = new Map(m.items.map((it) => [it.position, it]));
  const reportes = new Map<number, ReceiveItemInput>();
  for (const r of dto.items ?? []) {
    if (!porPosicion.has(r.position)) {
      throw new ManifestError(`El remito no tiene un bulto ${r.position}.`);
    }
    reportes.set(r.position, r);
  }

  let diferencias = 0;
  const actualizaciones = m.items.map((it) => {
    const r = reportes.get(it.position);
    if (!r || r.status === 'OK') {
      return {
        where: { id: it.id },
        data: {
          itemStatus: ManifestItemStatus.OK,
          receivedMeasure: it.measure,
          receivedNote: r?.note?.trim() || null,
          photoUrl: r?.photoUrl ?? null,
        },
      };
    }
    diferencias += 1;
    // Un faltante recibe cero; un corto recibe lo que llegó (nunca más de lo
    // declarado: si llegara más, el remito de salida estaba mal, no la entrega).
    const recibido =
      r.status === 'MISSING'
        ? 0
        : r.status === 'SHORT'
          ? Math.min(Math.max(Number(r.receivedMeasure) || 0, 0), it.measure)
          : it.measure; // DAMAGED: llegó completo pero averiado
    return {
      where: { id: it.id },
      data: {
        itemStatus: r.status as ManifestItemStatus,
        receivedMeasure: recibido,
        receivedNote: r.note?.trim() || null,
        photoUrl: r.photoUrl ?? null,
      },
    };
  });

  const actualizado = await prisma.$transaction(async (tx) => {
    for (const u of actualizaciones) {
      await tx.freightManifestItem.update(u);
    }
    return tx.freightManifest.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        receivedByName: dto.receivedByName.trim(),
        receivedByIdNumber: dto.receivedByIdNumber?.trim() || null,
        receiptPhotoUrl: dto.receiptPhotoUrl ?? null,
        discrepancyCount: diferencias,
      },
      include: _incluirItems,
    });
  });
  return toManifestDTO(actualizado);
}

/** Guarda la foto de la firma/acta de recepción (multipart, best-effort). */
export async function setManifestReceiptPhoto(
  driverId: string,
  id: string,
  url: string,
): Promise<boolean> {
  const res = await prisma.freightManifest.updateMany({
    where: { id, driverId },
    data: { receiptPhotoUrl: url },
  });
  return res.count > 0;
}
