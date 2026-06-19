import { Payout, PayoutStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { MIN_PAYOUT_COP } from '../config/constants';

/** Error de dominio de payouts (mapea a HTTP 400 en las rutas). */
export class PayoutError extends Error {}

export interface DriverBalanceDTO {
  totalEarned: number;
  totalPaidOut: number; // retiros PAID
  pending: number; // retiros REQUESTED + PROCESSING
  available: number; // totalEarned - totalPaidOut - pending (≥ 0)
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

export interface AdminPayoutDTO extends PayoutDTO {
  driverId: string;
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
    prisma.driverEarning.aggregate({ where: { driverId }, _sum: { netEarning: true } }),
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
  const available = Math.max(0, Math.round(totalEarned - totalPaidOut - pending));

  return {
    totalEarned: Math.round(totalEarned),
    totalPaidOut: Math.round(totalPaidOut),
    pending: Math.round(pending),
    available,
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

/** Lista los retiros para la operación, opcionalmente filtrados por estado. */
export async function listPayoutsForAdmin(status?: PayoutStatus): Promise<AdminPayoutDTO[]> {
  const rows = await prisma.payout.findMany({
    where: status ? { status } : undefined,
    orderBy: { requestedAt: 'desc' },
    include: { driver: { select: { name: true, phone: true } } },
  });
  return rows.map((p) => ({
    ...toDTO(p),
    driverId: p.driverId,
    driverName: p.driver.name,
    driverPhone: p.driver.phone,
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
    include: { driver: { select: { name: true, phone: true } } },
  });
  return {
    ...toDTO(updated),
    driverId: updated.driverId,
    driverName: updated.driver.name,
    driverPhone: updated.driver.phone,
  };
}
