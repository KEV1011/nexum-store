import { Payout, PayoutStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { avisarGiroPagado } from './giro-aliado.service';
import { MIN_PAYOUT_COP } from '../config/constants';
import { saldoDelConductor } from '../lib/saldo-conductor';

/** Error de dominio de payouts (mapea a HTTP 400 en las rutas). */
export class PayoutError extends Error {}

export interface DriverBalanceDTO {
  totalEarned: number;
  totalPaidOut: number; // retiros PAID
  pending: number; // retiros REQUESTED + PROCESSING
  /**
   * Lo que puede retirar HOY: lo que ZIPA recaudó, menos lo girado, lo
   * solicitado y lo que él debe. No es `totalEarned`: de un servicio en
   * efectivo la plata ya la tiene en el bolsillo.
   */
  available: number;
  /** Comisiones de servicios que cobró de su mano y todavía no ha pagado. */
  owed: number;
  minPayout: number;
  bank: {
    name: string | null;
    accountType: string | null;
    accountNumber: string | null;
  };
}

export interface PayoutDTO {
  id: string;
  amount: number;
  status: PayoutStatus;
  method: string | null;
  accountInfo: string | null;
  notes: string | null;
  reference: string | null;
  requestedAt: string;
  processedAt: string | null;
}

/**
 * Un giro visto por la operación, sea a quien sea.
 *
 * Los tres tipos de aliado viven en la MISMA tabla y en la misma pantalla
 * porque para quien hace la transferencia son el mismo trabajo: un monto, un
 * destino y una referencia que registrar. `driverId` pasó a opcional al
 * extender el giro a negocios y empresas; `beneficiarioTipo` dice cuál es sin
 * obligar a nadie a deducirlo de qué campo viene lleno.
 */
export interface AdminPayoutDTO extends PayoutDTO {
  driverId: string | null;
  businessId: string | null;
  operatorId: string | null;
  beneficiarioTipo: 'conductor' | 'negocio' | 'empresa';
  beneficiarioNombre: string;
  /** Teléfono de contacto del beneficiario, para resolver dudas del pago. */
  beneficiarioTelefono: string | null;
  /** Mantenidos para el panel que ya los leía. */
  driverName: string;
  driverPhone: string;
}

function toDTO(p: Payout): PayoutDTO {
  return {
    id: p.id,
    amount: p.amount,
    status: p.status,
    method: p.method,
    accountInfo: p.accountInfo,
    notes: p.notes,
    reference: p.reference,
    requestedAt: p.requestedAt.toISOString(),
    processedAt: p.processedAt?.toISOString() ?? null,
  };
}

/**
 * Saldo del conductor: ganancia neta acumulada en driver_earnings menos los
 * retiros que ya reservan saldo (pagados, en proceso o solicitados).
 */
export async function getDriverBalance(driverId: string): Promise<DriverBalanceDTO> {
  const [earnAgg, payouts, driver] = await Promise.all([
    prisma.driverEarning.aggregate({
      where: { driverId },
      // `netEarning` es lo que GANÓ, no lo que puede retirar: incluye los
      // servicios que cobró de su mano. Lo retirable sale de `platformHeld`
      // menos `driverOwes` (ver `lib/saldo-conductor.ts`).
      _sum: { netEarning: true, platformHeld: true, driverOwes: true },
    }),
    prisma.payout.findMany({ where: { driverId }, select: { amount: true, status: true } }),
    prisma.driver.findUnique({
      where: { id: driverId },
      select: { bankName: true, bankAccountType: true, bankAccountNumber: true },
    }),
  ]);

  const totalEarned = earnAgg._sum.netEarning ?? 0;
  let totalPaidOut = 0;
  let pending = 0;
  for (const p of payouts) {
    if (p.status === 'PAID') totalPaidOut += p.amount;
    else if (p.status === 'REQUESTED' || p.status === 'PROCESSING') pending += p.amount;
  }

  const saldo = saldoDelConductor({
    retenidoPorLaPlataforma: earnAgg._sum.platformHeld ?? 0,
    deudaAcumulada: earnAgg._sum.driverOwes ?? 0,
    yaPagado: totalPaidOut,
    solicitado: pending,
  });

  return {
    totalEarned: Math.round(totalEarned),
    totalPaidOut: Math.round(totalPaidOut),
    pending: Math.round(pending),
    available: saldo.disponible,
    // Lo que debe de comisiones de servicios que cobró él. Va aparte y NO
    // escondido detrás de un cero: un «$0 disponible» a secas se lee como un
    // error de la app, y esto es lo que hace falta para poder cobrárselo.
    owed: saldo.deuda,
    minPayout: MIN_PAYOUT_COP,
    bank: {
      name: driver?.bankName ?? null,
      accountType: driver?.bankAccountType ?? null,
      accountNumber: driver?.bankAccountNumber ?? null,
    },
  };
}

/** Crea una solicitud de retiro (REQUESTED) validada contra el saldo disponible. */
export async function requestPayout(
  driverId: string,
  params: { amount: number; method?: string; accountInfo?: string; notes?: string },
): Promise<PayoutDTO> {
  const amount = Math.round(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PayoutError('Monto inválido');
  }
  if (amount < MIN_PAYOUT_COP) {
    throw new PayoutError(`El retiro mínimo es ${MIN_PAYOUT_COP.toLocaleString('es-CO')} COP`);
  }

  const balance = await getDriverBalance(driverId);
  if (amount > balance.available) {
    throw new PayoutError('El monto supera tu saldo disponible');
  }

  // Si el conductor no envía destino, se toma una instantánea de su cuenta bancaria.
  let accountInfo = params.accountInfo?.trim() || null;
  if (!accountInfo && balance.bank.accountNumber) {
    accountInfo = [balance.bank.name, balance.bank.accountType, balance.bank.accountNumber]
      .filter(Boolean)
      .join(' · ');
  }

  const payout = await prisma.payout.create({
    data: {
      driverId,
      amount,
      method: params.method ?? null,
      accountInfo,
      notes: params.notes?.trim() || null,
    },
  });
  return toDTO(payout);
}

/** Historial de retiros del conductor, más reciente primero. */
export async function getDriverPayouts(driverId: string): Promise<PayoutDTO[]> {
  const rows = await prisma.payout.findMany({
    where: { driverId },
    orderBy: { requestedAt: 'desc' },
  });
  return rows.map(toDTO);
}

// ─── Operación (panel admin) ──────────────────────────────────────────────────

/**
 * Resuelve quién cobra este giro.
 *
 * Mira en el orden en que los campos son excluyentes (lo garantiza
 * `tipoDeAliado` al crearlos), así que el primero que venga lleno es el bueno.
 * El respaldo 'conductor' con nombre vacío NO debería alcanzarse nunca: existe
 * para que una fila corrupta se vea rara en el panel en vez de tumbar la tabla
 * entera, que es lo que pasaría con un `!`.
 */
function _beneficiario(p: {
  driverId: string | null; businessId: string | null; operatorId: string | null;
  driver?: { name: string; phone: string } | null;
  business?: { name: string; phone: string | null } | null;
  operator?: { tradeName: string | null; legalName: string; contactPhone: string | null } | null;
}): Pick<AdminPayoutDTO,
  'beneficiarioTipo' | 'beneficiarioNombre' | 'beneficiarioTelefono' | 'driverName' | 'driverPhone'
> {
  if (p.driverId) {
    const nombre = p.driver?.name ?? '';
    const tel = p.driver?.phone ?? null;
    return {
      beneficiarioTipo: 'conductor', beneficiarioNombre: nombre,
      beneficiarioTelefono: tel, driverName: nombre, driverPhone: tel ?? '',
    };
  }
  if (p.businessId) {
    const nombre = p.business?.name ?? '';
    const tel = p.business?.phone ?? null;
    return {
      beneficiarioTipo: 'negocio', beneficiarioNombre: nombre,
      beneficiarioTelefono: tel, driverName: nombre, driverPhone: tel ?? '',
    };
  }
  if (p.operatorId) {
    const nombre = p.operator?.tradeName ?? p.operator?.legalName ?? '';
    const tel = p.operator?.contactPhone ?? null;
    return {
      beneficiarioTipo: 'empresa', beneficiarioNombre: nombre,
      beneficiarioTelefono: tel, driverName: nombre, driverPhone: tel ?? '',
    };
  }
  return {
    beneficiarioTipo: 'conductor', beneficiarioNombre: '(sin beneficiario)',
    beneficiarioTelefono: null, driverName: '(sin beneficiario)', driverPhone: '',
  };
}

/** Lista los retiros para la operación, opcionalmente filtrados por estado. */
export async function listPayoutsForAdmin(status?: PayoutStatus): Promise<AdminPayoutDTO[]> {
  const rows = await prisma.payout.findMany({
    where: status ? { status } : undefined,
    orderBy: { requestedAt: 'desc' },
    include: {
      driver: { select: { name: true, phone: true } },
      business: { select: { name: true, phone: true } },
      operator: { select: { tradeName: true, legalName: true, contactPhone: true } },
    },
  });
  return rows.map((p) => ({
    ...toDTO(p),
    driverId: p.driverId,
    businessId: p.businessId,
    operatorId: p.operatorId,
    ..._beneficiario(p),
  }));
}

/**
 * Actualiza el estado de un retiro desde la operación. Al pasar a PAID/REJECTED
 * se sella processedAt; PAID admite la referencia de la transferencia.
 */
export async function adminUpdatePayout(
  id: string,
  status: PayoutStatus,
  params: { processedBy: string; reference?: string; notes?: string },
): Promise<AdminPayoutDTO | null> {
  const existing = await prisma.payout.findUnique({ where: { id } });
  if (!existing) return null;

  const isTerminal = status === 'PAID' || status === 'REJECTED';
  const updated = await prisma.payout.update({
    where: { id },
    data: {
      status,
      reference: params.reference?.trim() || existing.reference,
      notes: params.notes?.trim() || existing.notes,
      processedBy: params.processedBy,
      processedAt: isTerminal ? new Date() : existing.processedAt,
    },
    include: {
      driver: { select: { name: true, phone: true } },
      business: { select: { name: true, phone: true } },
      operator: { select: { tradeName: true, legalName: true, contactPhone: true } },
    },
  });
  const dto: AdminPayoutDTO = {
    ...toDTO(updated),
    driverId: updated.driverId,
    businessId: updated.businessId,
    operatorId: updated.operatorId,
    ..._beneficiario(updated),
  };

  // Al marcar PAGADO se le avisa al aliado, con la referencia de la
  // transferencia para que pueda buscarla en su banco. Solo aplica a negocios
  // y empresas: el conductor ve su retiro en la billetera de su app.
  //
  // Sin `await` a propósito: el giro ya está escrito y quien lo procesó no
  // tiene por qué esperar a un socket. Si el aviso falla, el giro sigue hecho
  // y visible en el portal.
  if (status === 'PAID' && (updated.businessId || updated.operatorId)) {
    void avisarGiroPagado(updated.id).catch((e) => {
      console.error('[Giro] no se pudo avisar del pago:', e);
    });
  }

  return dto;
}
