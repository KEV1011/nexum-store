import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prisma mockeado (vi.hoisted para que esté listo antes del vi.mock hoisteado).
const mockPrisma = vi.hoisted(() => ({
  driverEarning: { aggregate: vi.fn() },
  payout: { findMany: vi.fn(), create: vi.fn() },
  driver: { findUnique: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { getDriverBalance, requestPayout, PayoutError } from './payout.service';

function setupBalance(
  earned: number,
  payouts: Array<{ amount: number; status: string }> = [],
): void {
  mockPrisma.driverEarning.aggregate.mockResolvedValue({ _sum: { netEarning: earned } });
  mockPrisma.payout.findMany.mockResolvedValue(payouts);
  mockPrisma.driver.findUnique.mockResolvedValue({
    bankName: 'Bancolombia',
    bankAccountType: 'Ahorros',
    bankAccountNumber: '****4521',
  });
}

beforeEach(() => vi.clearAllMocks());

describe('getDriverBalance', () => {
  it('available = ganado − pagado − pendiente; REJECTED no reserva', async () => {
    setupBalance(100000, [
      { amount: 20000, status: 'PAID' },
      { amount: 10000, status: 'REQUESTED' },
      { amount: 5000, status: 'PROCESSING' },
      { amount: 9999, status: 'REJECTED' },
    ]);
    const b = await getDriverBalance('d1');
    expect(b.totalEarned).toBe(100000);
    expect(b.totalPaidOut).toBe(20000);
    expect(b.pending).toBe(15000);
    expect(b.available).toBe(65000);
    expect(b.minPayout).toBe(20000);
    expect(b.bank.name).toBe('Bancolombia');
  });

  it('available nunca es negativo', async () => {
    setupBalance(10000, [{ amount: 50000, status: 'PAID' }]);
    const b = await getDriverBalance('d1');
    expect(b.available).toBe(0);
  });
});

describe('requestPayout', () => {
  it('rechaza un monto por debajo del mínimo', async () => {
    setupBalance(100000);
    await expect(requestPayout('d1', { amount: 5000 })).rejects.toBeInstanceOf(PayoutError);
  });

  it('rechaza un monto mayor al saldo disponible', async () => {
    setupBalance(30000);
    await expect(requestPayout('d1', { amount: 50000 })).rejects.toBeInstanceOf(PayoutError);
  });

  it('crea el retiro cuando es válido', async () => {
    setupBalance(100000);
    mockPrisma.payout.create.mockResolvedValue({
      id: 'p1',
      amount: 30000,
      status: 'REQUESTED',
      method: 'bank',
      accountInfo: 'Bancolombia · Ahorros · ****4521',
      notes: null,
      reference: null,
      requestedAt: new Date(),
      processedAt: null,
    });
    const p = await requestPayout('d1', { amount: 30000, method: 'bank' });
    expect(p.amount).toBe(30000);
    expect(mockPrisma.payout.create).toHaveBeenCalledTimes(1);
  });
});
