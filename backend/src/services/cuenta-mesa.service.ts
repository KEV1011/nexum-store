// ── La cuenta de una mesa ──────────────────────────────────────────────────
//
// Agrupa las rondas que una mesa va pidiendo, para poder cobrarlas juntas e
// imprimir el papel que se lleva en el platito. Cada ronda sigue siendo su
// propio `Order`: la cocina trabaja por ronda y necesita distinguir lo que
// acaba de entrar.

import { prisma } from '../lib/prisma';
import {
  totalDeCuenta,
  rondasDeCuenta,
  motivoParaNoCerrar,
  siguienteNumero,
  lineasImpresas,
  type LineaImpresa,
} from '../lib/cuenta-mesa';
import { saneaMetodoPago } from '../lib/metodos-pago';

export interface CuentaMesaDTO {
  id: string;
  numero: number;
  tableLabel: string;
  openedAt: string;
  closedAt: string | null;
  /** Lo que debe la mesa: derivado mientras está abierta, sellado al cerrar. */
  total: number;
  rondas: number;
  paymentMethod: string | null;
  lineas: LineaImpresa[];
  /** Las rondas, para poder ver qué llegó cuándo. */
  pedidos: Array<{
    id: string;
    orderRef: string;
    status: string;
    total: number;
    createdAt: string;
  }>;
}

const _incluirRondas = {
  orders: {
    orderBy: { createdAt: 'asc' as const },
    include: { lines: true },
  },
};

type CuentaConRondas = {
  id: string; numero: number; tableLabel: string;
  openedAt: Date; closedAt: Date | null; closedTotal: number | null;
  paymentMethod: string | null;
  orders: Array<{
    id: string; orderRef: string; status: string; total: number; createdAt: Date;
    lines: Array<{
      productName: string; quantity: number; unitPrice: number;
      optionsSummary: string | null; notes: string | null;
    }>;
  }>;
};

function _aDTO(c: CuentaConRondas): CuentaMesaDTO {
  return {
    id: c.id,
    numero: c.numero,
    tableLabel: c.tableLabel,
    openedAt: c.openedAt.toISOString(),
    closedAt: c.closedAt?.toISOString() ?? null,
    // Abierta: se deriva de las rondas, porque un total guardado y unas
    // rondas guardadas acaban discrepando. Cerrada: manda el sellado, que es
    // lo que se cobró y no puede cambiar porque alguien toque un pedido.
    total: c.closedAt ? (c.closedTotal ?? 0) : totalDeCuenta(c.orders),
    rondas: rondasDeCuenta(c.orders),
    paymentMethod: c.paymentMethod,
    lineas: lineasImpresas(c.orders),
    pedidos: c.orders.map((o) => ({
      id: o.id,
      orderRef: o.orderRef,
      status: o.status,
      total: o.total,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

/**
 * Devuelve la cuenta abierta de una mesa, creándola si no hay.
 *
 * ATÓMICO A PROPÓSITO. Dos comensales de la misma mesa tocando «pedir» a la
 * vez desde sus teléfonos es el caso normal, no el raro. Sin la carrera
 * resuelta saldrían dos cuentas: una ronda caería en una, el cobro en la
 * otra, y el local cobraría de menos sin que nada fallara a la vista.
 *
 * La guarda de verdad es el índice único parcial de la base
 * (`table_tabs_una_abierta_por_mesa`): si dos peticiones intentan crear a la
 * vez, una falla con violación de unicidad y entonces se relee la que ganó.
 * Comprobar «¿existe?» y después crear NO basta — entre las dos operaciones
 * cabe la otra petición.
 */
export async function cuentaAbiertaDeMesa(
  businessId: string,
  tableLabel: string,
): Promise<{ id: string; numero: number }> {
  const existente = await prisma.tableTab.findFirst({
    where: { businessId, tableLabel, closedAt: null },
    select: { id: true, numero: true },
  });
  if (existente) return existente;

  // El consecutivo del DÍA. Se calcula aquí y puede chocar con otra petición
  // simultánea; por eso el reintento de abajo relee en vez de insistir.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const delDia = await prisma.tableTab.findMany({
    where: { businessId, openedAt: { gte: hoy } },
    select: { numero: true },
  });

  try {
    return await prisma.tableTab.create({
      data: {
        businessId,
        tableLabel,
        numero: siguienteNumero(delDia.map((t) => t.numero)),
      },
      select: { id: true, numero: true },
    });
  } catch {
    // Perdió la carrera: la cuenta la creó la otra petición. Se relee la
    // suya en vez de reventar — para el comensal no cambia nada.
    const ganadora = await prisma.tableTab.findFirst({
      where: { businessId, tableLabel, closedAt: null },
      select: { id: true, numero: true },
    });
    if (!ganadora) throw new Error('No pudimos abrir la cuenta de la mesa.');
    return ganadora;
  }
}

/** Las cuentas abiertas del local, que es lo que el portal necesita ver. */
export async function cuentasAbiertas(businessId: string): Promise<CuentaMesaDTO[]> {
  const cuentas = await prisma.tableTab.findMany({
    where: { businessId, closedAt: null },
    orderBy: { openedAt: 'asc' },
    include: _incluirRondas,
  });
  return cuentas.map(_aDTO);
}

export async function getCuenta(
  businessId: string,
  tabId: string,
): Promise<CuentaMesaDTO | null> {
  const c = await prisma.tableTab.findFirst({
    where: { id: tabId, businessId },
    include: _incluirRondas,
  });
  return c ? _aDTO(c) : null;
}

/**
 * Cierra la cuenta: la mesa pagó.
 *
 * El total se SELLA aquí. Mientras estaba abierta se derivaba de las rondas;
 * a partir de ahora es el documento de lo que se cobró, y no puede moverse
 * porque alguien cancele un pedido mañana.
 *
 * El `closedAt: null` en el `where` del `updateMany` es la guarda de
 * concurrencia: dos toques al botón de cobrar no cierran dos veces ni sellan
 * dos totales distintos.
 */
export async function cerrarCuenta(
  businessId: string,
  tabId: string,
  opts: { paymentMethod?: string; closedBy?: string } = {},
): Promise<CuentaMesaDTO> {
  const c = await prisma.tableTab.findFirst({
    where: { id: tabId, businessId },
    include: _incluirRondas,
  });
  if (!c) throw new Error('No encontramos esa cuenta.');

  const motivo = motivoParaNoCerrar({ closedAt: c.closedAt, pedidos: c.orders });
  if (motivo) throw new Error(motivo);

  const total = totalDeCuenta(c.orders);
  const metodo = opts.paymentMethod ? saneaMetodoPago(opts.paymentMethod) : null;

  const r = await prisma.tableTab.updateMany({
    where: { id: tabId, businessId, closedAt: null },
    data: {
      closedAt: new Date(),
      closedTotal: total,
      ...(metodo ? { paymentMethod: metodo } : {}),
      ...(opts.closedBy ? { closedBy: opts.closedBy.trim().slice(0, 80) } : {}),
    },
  });
  if (r.count === 0) throw new Error('Esta cuenta ya está cerrada.');

  const cerrada = await prisma.tableTab.findFirst({
    where: { id: tabId },
    include: _incluirRondas,
  });
  return _aDTO(cerrada!);
}

/**
 * Reabre una cuenta cerrada por error.
 *
 * Pasa: el mesero cobra la 4 queriendo cobrar la 5. Sin vuelta atrás, la
 * mesa que sigue comiendo se queda sin cuenta donde sumar y sus siguientes
 * rondas abren una nueva — con lo que el cliente acaba pagando dos papeles.
 *
 * Se borra el total sellado porque la cuenta vuelve a estar viva y su total
 * vuelve a derivarse: dejarlo congelaría un número que ya no es el que debe.
 *
 * NO se puede reabrir si la mesa ya tiene otra cuenta abierta: serían dos a
 * la vez, que es justo lo que el índice único impide — y aquí el error sería
 * de la base, poco legible, así que se dice antes y con palabras.
 */
export async function reabrirCuenta(
  businessId: string,
  tabId: string,
): Promise<CuentaMesaDTO> {
  const c = await prisma.tableTab.findFirst({ where: { id: tabId, businessId } });
  if (!c) throw new Error('No encontramos esa cuenta.');
  if (!c.closedAt) throw new Error('Esa cuenta ya está abierta.');

  const otra = await prisma.tableTab.findFirst({
    where: { businessId, tableLabel: c.tableLabel, closedAt: null },
    select: { numero: true },
  });
  if (otra) {
    throw new Error(
      `La mesa ${c.tableLabel} ya tiene la cuenta ${otra.numero} abierta. `
      + 'Ciérrala primero si quieres volver a esta.',
    );
  }

  await prisma.tableTab.update({
    where: { id: tabId },
    data: { closedAt: null, closedTotal: null },
  });
  const abierta = await prisma.tableTab.findFirst({
    where: { id: tabId },
    include: _incluirRondas,
  });
  return _aDTO(abierta!);
}
