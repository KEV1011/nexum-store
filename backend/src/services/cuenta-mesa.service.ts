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
  motivoParaNoCancelarRonda,
  siguienteNumero,
  lineasImpresas,
  type LineaImpresa,
} from '../lib/cuenta-mesa';
import { saneaMetodoPago } from '../lib/metodos-pago';
import { restoreOrderStock, avisarNegocioDePedidoNuevo } from './client.service';
import { registrarEventoPedido } from './pedido-eventos.service';

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
  /** Cuántas veces se reabrió esta cuenta. 0 = nunca. */
  reopenCount: number;
  /** Por cuánto estaba cobrada la última vez que se reabrió. */
  reopenedFrom: number | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
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
  reopenCount: number;
  reopenedFrom: number | null;
  reopenedAt: Date | null;
  reopenedBy: string | null;
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
    reopenCount: c.reopenCount,
    reopenedFrom: c.reopenedFrom,
    reopenedAt: c.reopenedAt?.toISOString() ?? null,
    reopenedBy: c.reopenedBy,
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
  quien?: string,
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

  // LA CONSTANCIA. Una cuenta cobrada que se puede volver a abrir en
  // silencio es la puerta para quitar pedidos y volver a cerrar por menos:
  // la caja cuadraría con ella misma y el dueño no se enteraría nunca. Aquí
  // queda cuántas veces, cuándo, quién, y SOBRE TODO por cuánto estaba
  // cobrada — que es la cifra contra la que se compara si vuelve a cerrarse.
  await prisma.tableTab.update({
    where: { id: tabId },
    data: {
      closedAt: null,
      // El total vuelve a derivarse: dejarlo congelaría un número que ya no
      // es el que debe la mesa.
      closedTotal: null,
      reopenCount: { increment: 1 },
      reopenedAt: new Date(),
      reopenedFrom: c.closedTotal,
      ...(quien?.trim() ? { reopenedBy: quien.trim().slice(0, 80) } : {}),
    },
  });
  const abierta = await prisma.tableTab.findFirst({
    where: { id: tabId },
    include: _incluirRondas,
  });
  return _aDTO(abierta!);
}

/**
 * Cancela una ronda de la cuenta, con efecto inmediato.
 *
 * Pasa todos los días —el plato se cae, el cliente se arrepiente— y hasta
 * ahora no había forma de deshacerlo: el único camino era cobrar algo que
 * nadie consumió. El total de la cuenta se deriva de las rondas, así que al
 * cancelar BAJA solo; no hay nada que recalcular a mano.
 *
 * Devuelve el inventario con la MISMA función que usan las cancelaciones de
 * domicilio: duplicarla dejaría dos formas de contar existencias, y la que no
 * se usa a diario es la que se queda mal.
 *
 * El aviso sale por `emitirCambioDePedido` (dentro de `avisarNegocioDePedidoNuevo`),
 * así que el portal, la cocina y la pantalla de mesas se enteran al instante
 * — que es justo lo que se pidió: que la cancelación llegue de inmediato.
 */
export async function cancelarRondaDeMesa(
  businessId: string,
  orderId: string,
  motivoTexto?: string,
): Promise<CuentaMesaDTO | null> {
  const pedido = await prisma.order.findFirst({
    where: { id: orderId, businessId, mode: 'DINE_IN' },
    select: { id: true, status: true, tabId: true, tab: { select: { closedAt: true } } },
  });
  if (!pedido) throw new Error('No encontramos ese pedido.');

  const motivo = motivoParaNoCancelarRonda({
    status: pedido.status,
    cuentaCerrada: !!pedido.tab?.closedAt,
  });
  if (motivo) throw new Error(motivo);

  // `updateMany` con el estado en el `where`: dos toques al botón no
  // devuelven el inventario dos veces.
  const r = await prisma.order.updateMany({
    where: { id: orderId, businessId, status: { not: 'CANCELLED' } },
    data: { status: 'CANCELLED' },
  });
  if (r.count === 0) throw new Error('Esa ronda ya estaba cancelada.');

  await restoreOrderStock(orderId);
  await registrarEventoPedido(orderId, 'CANCELLED', {
    actor: 'negocio',
    ...(motivoTexto?.trim() ? { note: motivoTexto.trim().slice(0, 200) } : {}),
  });
  // Esto es lo que hace que la cancelación llegue «de inmediato» a las tres
  // pantallas: el portal, la cocina y las mesas escuchan el mismo socket.
  await avisarNegocioDePedidoNuevo(orderId);

  return pedido.tabId ? getCuenta(businessId, pedido.tabId) : null;
}

/**
 * Las cuentas de hoy que alguien reabrió después de cobrarlas.
 *
 * Es la contrapartida de que reabrir exista. Sin una pantalla donde el dueño
 * las vea sin buscarlas, la red de seguridad se convierte en un agujero:
 * quien reabre, quita pedidos y vuelve a cerrar por menos deja una caja que
 * cuadra consigo misma. Con `reopenedFrom` al lado del total actual, la
 * diferencia salta a la vista.
 */
export async function cuentasReabiertasHoy(businessId: string): Promise<CuentaMesaDTO[]> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const cuentas = await prisma.tableTab.findMany({
    where: { businessId, openedAt: { gte: hoy }, reopenCount: { gt: 0 } },
    orderBy: { reopenedAt: 'desc' },
    include: _incluirRondas,
  });
  return cuentas.map(_aDTO);
}
