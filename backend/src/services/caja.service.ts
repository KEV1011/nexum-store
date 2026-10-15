// ── La caja del turno ──────────────────────────────────────────────────────
//
// Abrir con una base, cobrar durante el turno, y cerrar contando el efectivo
// para ver si cuadra. La diferencia es el dato: un faltante de veinte mil
// repetido tres días no es mala suerte.

import { prisma } from '../lib/prisma';
import {
  esperadoEnCaja,
  efectivoDelTurno,
  electronicoDelTurno,
  diferenciaDeCaja,
  motivoParaNoAbrir,
  motivoParaNoCerrar,
  avisosAlCerrar,
  veredictoDeCaja,
  type CobroDeTurno,
} from '../lib/caja';
import { siguienteNumero } from '../lib/cuenta-mesa';

export interface CajaDTO {
  id: string;
  numero: number;
  openedAt: string;
  openedBy: string | null;
  openingFloat: number;
  closedAt: string | null;
  closedBy: string | null;
  /** Lo cobrado en efectivo durante el turno. Lo que entró al cajón. */
  ventasEfectivo: number;
  /** Lo cobrado por otros medios. Se enseña APARTE: no está en el cajón. */
  ventasElectronicas: number;
  /** Base + efectivo. Derivado mientras está abierta, sellado al cerrar. */
  esperado: number;
  countedCash: number | null;
  difference: number | null;
  veredicto: 'cuadra' | 'sobra' | 'falta' | null;
  notes: string | null;
  /** Mesas que siguen abiertas: su plata todavía no entró. */
  mesasAbiertas: number;
  avisos: string[];
}

/**
 * Lo que se cobró EN EL LOCAL durante el turno.
 *
 * Dos fuentes y solo dos:
 *  - las cuentas de mesa que se cerraron (cobraron) dentro del turno,
 *  - los pedidos PARA LLEVAR que se entregaron dentro del turno.
 *
 * Los DOMICILIOS no entran, y es la decisión que más importa: esa plata la
 * cobró el repartidor en la puerta del cliente y vive en su saldo, no en el
 * cajón del local. Meterla haría que el arqueo diera un faltante enorme cada
 * día y a la semana nadie lo miraría.
 */
async function cobrosDelTurno(
  businessId: string,
  desde: Date,
  hasta: Date,
): Promise<CobroDeTurno[]> {
  const [cuentas, paraLlevar] = await Promise.all([
    prisma.tableTab.findMany({
      where: { businessId, closedAt: { gte: desde, lte: hasta } },
      select: { closedTotal: true, paymentMethod: true },
    }),
    prisma.order.findMany({
      where: {
        businessId,
        mode: 'TAKEAWAY',
        status: 'DELIVERED',
        deliveredAt: { gte: desde, lte: hasta },
      },
      select: { total: true, paymentMethod: true },
    }),
  ]);

  return [
    ...cuentas.map((c) => ({ monto: c.closedTotal ?? 0, metodo: c.paymentMethod })),
    ...paraLlevar.map((o) => ({ monto: o.total, metodo: o.paymentMethod })),
  ];
}

async function _aDTO(c: {
  id: string; numero: number; openedAt: Date; openedBy: string | null;
  openingFloat: number; closedAt: Date | null; closedBy: string | null;
  countedCash: number | null; expectedCash: number | null;
  difference: number | null; notes: string | null; businessId: string;
}): Promise<CajaDTO> {
  const cobros = await cobrosDelTurno(c.businessId, c.openedAt, c.closedAt ?? new Date());
  const mesasAbiertas = await prisma.tableTab.count({
    where: { businessId: c.businessId, closedAt: null },
  });

  return {
    id: c.id,
    numero: c.numero,
    openedAt: c.openedAt.toISOString(),
    openedBy: c.openedBy,
    openingFloat: c.openingFloat,
    closedAt: c.closedAt?.toISOString() ?? null,
    closedBy: c.closedBy,
    ventasEfectivo: efectivoDelTurno(cobros),
    ventasElectronicas: electronicoDelTurno(cobros),
    // Cerrada: manda el sellado, que es lo que se arqueó. Abierta: se deriva,
    // porque un esperado guardado y unas ventas guardadas acaban discrepando.
    esperado: c.closedAt ? (c.expectedCash ?? 0) : esperadoEnCaja(c.openingFloat, cobros),
    countedCash: c.countedCash,
    difference: c.difference,
    veredicto: c.difference == null ? null : veredictoDeCaja(c.difference).estado,
    notes: c.notes,
    mesasAbiertas,
    avisos: c.closedAt ? [] : avisosAlCerrar(mesasAbiertas),
  };
}

/** La caja abierta del local, o `null` si no hay ninguna. */
export async function cajaAbierta(businessId: string): Promise<CajaDTO | null> {
  const c = await prisma.cashSession.findFirst({
    where: { businessId, closedAt: null },
  });
  return c ? _aDTO(c) : null;
}

/**
 * Abre la caja del turno.
 *
 * El índice único parcial de la base (`cash_sessions_una_abierta`) es la
 * guarda de verdad: dos cajas abiertas reparten las ventas del turno entre
 * dos arqueos y ninguno cuadra.
 */
export async function abrirCaja(
  businessId: string,
  opts: { openingFloat?: number; openedBy?: string } = {},
): Promise<CajaDTO> {
  const yaHay = await prisma.cashSession.findFirst({
    where: { businessId, closedAt: null },
    select: { id: true },
  });
  const motivo = motivoParaNoAbrir(!!yaHay);
  if (motivo) throw new Error(motivo);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const delDia = await prisma.cashSession.findMany({
    where: { businessId, openedAt: { gte: hoy } },
    select: { numero: true },
  });

  const base = Number(opts.openingFloat);
  const creada = await prisma.cashSession.create({
    data: {
      businessId,
      numero: siguienteNumero(delDia.map((c) => c.numero)),
      // Una base negativa o sin sentido se trata como cero en vez de
      // rechazarse: nadie debería quedarse sin poder abrir la caja por
      // teclear mal el sencillo, y el arqueo lo delataría igual.
      openingFloat: Number.isFinite(base) && base > 0 ? Math.round(base) : 0,
      ...(opts.openedBy?.trim() ? { openedBy: opts.openedBy.trim().slice(0, 80) } : {}),
    },
  });
  return _aDTO(creada);
}

/**
 * Cierra la caja: se cuenta el efectivo y se sella la diferencia.
 *
 * El `closedAt: null` del `updateMany` es la guarda de concurrencia: dos
 * toques al botón no cierran dos veces ni sellan dos arqueos distintos.
 */
export async function cerrarCaja(
  businessId: string,
  opts: { countedCash: number; closedBy?: string; notes?: string },
): Promise<CajaDTO> {
  const c = await prisma.cashSession.findFirst({ where: { businessId, closedAt: null } });
  if (!c) throw new Error('No hay ninguna caja abierta.');

  const contado = Number(opts.countedCash);
  const motivo = motivoParaNoCerrar({
    cerrada: !!c.closedAt,
    contado: Number.isFinite(contado) ? contado : null,
  });
  if (motivo) throw new Error(motivo);

  const ahora = new Date();
  const cobros = await cobrosDelTurno(businessId, c.openedAt, ahora);
  const esperado = esperadoEnCaja(c.openingFloat, cobros);

  const r = await prisma.cashSession.updateMany({
    where: { id: c.id, businessId, closedAt: null },
    data: {
      closedAt: ahora,
      countedCash: Math.round(contado),
      expectedCash: esperado,
      difference: diferenciaDeCaja(contado, esperado),
      ...(opts.closedBy?.trim() ? { closedBy: opts.closedBy.trim().slice(0, 80) } : {}),
      ...(opts.notes?.trim() ? { notes: opts.notes.trim().slice(0, 500) } : {}),
    },
  });
  if (r.count === 0) throw new Error('Esta caja ya está cerrada.');

  const cerrada = await prisma.cashSession.findUnique({ where: { id: c.id } });
  return _aDTO(cerrada!);
}

/** Las cajas del día, para que el dueño vea cómo cerró cada turno. */
export async function cajasDelDia(businessId: string): Promise<CajaDTO[]> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const cajas = await prisma.cashSession.findMany({
    where: { businessId, openedAt: { gte: hoy } },
    orderBy: { openedAt: 'desc' },
  });
  return Promise.all(cajas.map(_aDTO));
}
