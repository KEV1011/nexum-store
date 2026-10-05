/**
 * El giro a negocios y empresas: acreditar lo cobrado y pagárselo.
 *
 * Es la mitad que faltaba del modelo de recaudo. Hasta ahora `Payout` servía
 * solo a conductores, así que la plataforma podía cobrar el pedido de una
 * tienda y no tenía forma de pagarle a la tienda. Recaudar sin el giro
 * construido no es avanzar: es crear un pasivo.
 *
 * DOS MOMENTOS, Y NO SE PUEDEN MEZCLAR:
 *
 *  1. **Acreditar** (`acreditarAliado`) — cuando la plata ENTRA. Se sella una
 *     fila con el bruto, la comisión del día y el neto del aliado. No se
 *     recalcula nunca más: si mañana se renegocia la comisión, lo cobrado hoy
 *     no cambia.
 *  2. **Girar** (`crearGiroAliado`) — cuando la plata SALE. Toma créditos
 *     pendientes, los marca con ese giro y deja el registro para la operación.
 *
 * El saldo del aliado no se guarda en ningún sitio: se deriva de los créditos
 * sin girar. La misma regla que sostiene la cuenta de cobro de carga.
 */

import { prisma } from '../lib/prisma';
import {
  tipoDeAliado, saldoDeAliado, motivoParaNoGirar, creditosQueCubre,
  GiroError, MINIMO_GIRO_COP, type Beneficiario, type TipoAliado,
} from '../lib/giro-aliado';

export { GiroError };

/** De dónde salió un crédito. Cerrado a propósito: cada uno se concilia distinto. */
export type FuenteCredito = 'order' | 'booking';

export interface CreditoDTO {
  id: string;
  source: string;
  sourceId: string;
  grossAmount: number;
  commission: number;
  netAmount: number;
  payoutId: string | null;
  createdAt: string;
}

export interface SaldoAliadoDTO {
  disponible: number;
  movimientos: number;
  minimo: number;
  /** Por qué no se puede girar el disponible ahora mismo. null = se puede. */
  motivo: string | null;
}

export interface GiroDTO {
  id: string;
  amount: number;
  status: string;
  reference: string | null;
  notes: string | null;
  requestedAt: string;
  processedAt: string | null;
  /** Cuántas ventas quedaron saldadas con este giro. */
  creditos: number;
}

function _aGiroDTO(p: {
  id: string; amount: number; status: string; reference: string | null;
  notes: string | null; requestedAt: Date; processedAt: Date | null;
}, creditos: number): GiroDTO {
  return {
    id: p.id,
    amount: Math.round(p.amount),
    status: p.status,
    reference: p.reference,
    notes: p.notes,
    requestedAt: p.requestedAt.toISOString(),
    processedAt: p.processedAt?.toISOString() ?? null,
    creditos,
  };
}

/** El `where` del beneficiario, ya validado. */
function _where(b: Beneficiario): { businessId: string } | { operatorId: string } {
  const tipo = tipoDeAliado(b);
  if (tipo === 'negocio') return { businessId: b.businessId! };
  if (tipo === 'empresa') return { operatorId: b.operatorId! };
  // El conductor tiene su propio saldo, derivado de `driver_earnings`, y su
  // propia pantalla de retiro. Mezclarlo aquí haría que la misma plata se
  // pudiera pedir por dos caminos.
  throw new GiroError('El saldo del conductor se consulta en su billetera, no aquí.');
}

/**
 * Acredita a un aliado lo que le queda de una venta que cobramos nosotros.
 *
 * ES IDEMPOTENTE, y eso no es un adorno: las pasarelas REINTENTAN el webhook
 * de confirmación —es su forma de garantizar la entrega— y sin esta guarda un
 * reintento le acreditaría la misma venta dos veces al aliado. Se apoya en el
 * índice único `(source, sourceId)` y no en una consulta previa, porque entre
 * el `findFirst` y el `create` caben dos reintentos simultáneos.
 *
 * Devuelve el crédito, tanto si lo creó ahora como si ya existía.
 */
export async function acreditarAliado(params: {
  beneficiario: Beneficiario;
  source: FuenteCredito;
  sourceId: string;
  grossAmount: number;
  commission: number;
}): Promise<CreditoDTO> {
  const tipo = tipoDeAliado(params.beneficiario);
  if (tipo === 'conductor') {
    throw new GiroError('El conductor se liquida por `driver_earnings`, no por créditos.');
  }

  const bruto = Math.round(params.grossAmount);
  const comision = Math.round(params.commission);
  if (!Number.isFinite(bruto) || bruto <= 0) {
    throw new GiroError('El bruto de un crédito tiene que ser mayor que cero.');
  }
  if (!Number.isFinite(comision) || comision < 0) {
    throw new GiroError('La comisión no puede ser negativa.');
  }
  if (comision > bruto) {
    // Pasaría solo por un error de cálculo nuestro, y el resultado sería un
    // crédito negativo: una venta que le DESCUENTA plata al aliado.
    throw new GiroError('La comisión no puede superar lo que pagó el cliente.');
  }

  const datos = {
    ...(tipo === 'negocio'
      ? { businessId: params.beneficiario.businessId! }
      : { operatorId: params.beneficiario.operatorId! }),
    source: params.source,
    sourceId: params.sourceId,
    grossAmount: bruto,
    commission: comision,
    netAmount: bruto - comision,
  };

  const credito = await prisma.partnerCredit.upsert({
    where: { source_sourceId: { source: params.source, sourceId: params.sourceId } },
    create: datos,
    // El reintento NO reescribe nada: lo sellado en el primer cobro manda. Si
    // se actualizara, un webhook tardío con otra tasa cambiaría lo que ya se
    // le prometió al aliado.
    update: {},
  });

  return {
    id: credito.id,
    source: credito.source,
    sourceId: credito.sourceId,
    grossAmount: credito.grossAmount,
    commission: credito.commission,
    netAmount: credito.netAmount,
    payoutId: credito.payoutId,
    createdAt: credito.createdAt.toISOString(),
  };
}

/** Lo que se le debe a un aliado ahora mismo. */
export async function saldoDelAliado(b: Beneficiario): Promise<SaldoAliadoDTO> {
  const pendientes = await prisma.partnerCredit.findMany({
    where: { ..._where(b), payoutId: null },
    select: { netAmount: true },
  });
  const saldo = saldoDeAliado(pendientes);
  return {
    disponible: saldo.disponible,
    movimientos: saldo.movimientos,
    minimo: MINIMO_GIRO_COP,
    motivo: motivoParaNoGirar(saldo, saldo.disponible),
  };
}

/** El detalle de lo pendiente: qué ventas componen el saldo. */
export async function creditosPendientes(b: Beneficiario): Promise<CreditoDTO[]> {
  const filas = await prisma.partnerCredit.findMany({
    where: { ..._where(b), payoutId: null },
    orderBy: { createdAt: 'asc' },
  });
  return filas.map((c) => ({
    id: c.id,
    source: c.source,
    sourceId: c.sourceId,
    grossAmount: c.grossAmount,
    commission: c.commission,
    netAmount: c.netAmount,
    payoutId: c.payoutId,
    createdAt: c.createdAt.toISOString(),
  }));
}

/**
 * Crea el giro y amarra los créditos que salda.
 *
 * TODO DENTRO DE UNA TRANSACCIÓN, y el amarre lleva `payoutId: null` en el
 * `where`. Sin eso, dos giros lanzados a la vez —la operación desde el panel y
 * un proceso automático, por ejemplo— podrían llevarse los mismos créditos y
 * el aliado cobraría dos veces la misma venta. El `updateMany` guardado es lo
 * que lo hace imposible: el segundo escribe cero filas y se cae.
 */
export async function crearGiroAliado(
  b: Beneficiario,
  params: { amount?: number; method?: string; accountInfo?: string; notes?: string },
): Promise<GiroDTO> {
  const where = _where(b);
  const tipo = tipoDeAliado(b);

  return prisma.$transaction(async (tx) => {
    const pendientes = await tx.partnerCredit.findMany({
      where: { ...where, payoutId: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, netAmount: true },
    });
    const saldo = saldoDeAliado(pendientes);

    // Sin monto se gira todo lo pendiente, que es lo que se hace el 99 % de
    // las veces. Pedir el número cada vez solo añade una forma de teclearlo mal.
    const monto = params.amount != null ? Math.round(params.amount) : saldo.disponible;

    const motivo = motivoParaNoGirar(saldo, monto);
    if (motivo) throw new GiroError(motivo);

    const { cubiertos, total } = creditosQueCubre(pendientes, monto);
    if (cubiertos.length === 0) {
      // Pasa cuando el monto pedido es menor que el crédito más antiguo. Se
      // dice con el número, porque «no se pudo» no le explica a nadie qué
      // hacer.
      throw new GiroError(
        'El monto no alcanza a cubrir ninguna venta completa. Los giros saldan '
        + 'ventas enteras para que la conciliación cuadre.',
      );
    }

    const giro = await tx.payout.create({
      data: {
        ...(tipo === 'negocio'
          ? { businessId: b.businessId! }
          : { operatorId: b.operatorId! }),
        // El monto es el de los créditos REALMENTE cubiertos, no el pedido:
        // si se guardara el pedido, el giro diría una cifra y las ventas que
        // salda sumarían otra.
        amount: total,
        method: params.method ?? null,
        accountInfo: params.accountInfo?.trim() || null,
        notes: params.notes?.trim() || null,
      },
    });

    const amarre = await tx.partnerCredit.updateMany({
      where: { id: { in: cubiertos.map((c) => c.id) }, payoutId: null },
      data: { payoutId: giro.id },
    });
    if (amarre.count !== cubiertos.length) {
      // Otro giro se llevó parte de estos créditos mientras armábamos este.
      // Se revienta la transacción entera: es preferible repetir la operación
      // a dejar un giro que no cuadra con lo que salda.
      throw new GiroError('Otro giro tomó esas ventas. Vuelve a intentarlo.');
    }

    return _aGiroDTO(giro, amarre.count);
  });
}

/** Los giros de un aliado, el más reciente primero. */
export async function girosDelAliado(b: Beneficiario): Promise<GiroDTO[]> {
  const filas = await prisma.payout.findMany({
    where: _where(b),
    orderBy: { requestedAt: 'desc' },
    include: { _count: { select: { creditos: true } } },
  });
  return filas.map((p) => _aGiroDTO(p, p._count.creditos));
}

/** Para el aviso: a quién hay que avisarle y cómo se llama. */
export interface DestinatarioAviso {
  tipo: TipoAliado;
  id: string;
  nombre: string;
}

export async function destinatarioDelGiro(payoutId: string): Promise<DestinatarioAviso | null> {
  const p = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: {
      businessId: true,
      operatorId: true,
      business: { select: { name: true } },
      operator: { select: { tradeName: true, legalName: true } },
    },
  });
  if (!p) return null;
  if (p.businessId) {
    return { tipo: 'negocio', id: p.businessId, nombre: p.business?.name ?? 'Tu negocio' };
  }
  if (p.operatorId) {
    return {
      tipo: 'empresa',
      id: p.operatorId,
      nombre: p.operator?.tradeName ?? p.operator?.legalName ?? 'Tu empresa',
    };
  }
  return null;
}

// ─── El aviso de «ya se te pagó» ──────────────────────────────────────────────
//
// Los servicios NO importan sockets: `ws.handler` inyecta la función al
// arrancar. Es el patrón del repositorio y evita el ciclo de imports.

type AvisoGiro = (destino: DestinatarioAviso, msg: Record<string, unknown>) => void;
let _avisar: AvisoGiro | null = null;

/** Inyectada por ws.handler. */
export function registerAvisoDeGiro(fn: AvisoGiro): void {
  _avisar = fn;
}

/**
 * Avisa al aliado de que su giro salió.
 *
 * POR QUÉ ESTE AVISO IMPORTA MÁS DE LO QUE PARECE. Todo el modelo de recaudo
 * le pide a un comerciante que nos deje cobrar SU plata. La única forma de que
 * eso no se sienta como un riesgo es que el momento en que se la devolvemos
 * sea visible y tenga constancia. Un giro silencioso obliga al dueño a revisar
 * su cuenta a ciegas, y a la tercera vez deja de confiar.
 *
 * Lleva la REFERENCIA de la transferencia: es lo que le permite buscarla en su
 * banco. Sin ella el aviso dice «te pagamos» y no se puede comprobar, que es
 * peor que no avisar.
 *
 * Best-effort a propósito: el giro ya está hecho y registrado. Un fallo al
 * avisar no puede deshacerlo ni retener a quien lo procesó.
 */
export async function avisarGiroPagado(payoutId: string): Promise<boolean> {
  const destino = await destinatarioDelGiro(payoutId);
  if (!destino) return false; // giro a conductor: tiene su propia pantalla

  const giro = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: {
      amount: true, reference: true, processedAt: true,
      _count: { select: { creditos: true } },
    },
  });
  if (!giro) return false;

  _avisar?.(destino, {
    type: 'giro_pagado',
    payoutId,
    amount: Math.round(giro.amount),
    reference: giro.reference,
    ventas: giro._count.creditos,
    processedAt: giro.processedAt?.toISOString() ?? new Date().toISOString(),
  });
  return true;
}
