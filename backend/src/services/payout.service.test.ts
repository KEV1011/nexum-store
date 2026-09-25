import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prisma mockeado (vi.hoisted para que esté listo antes del vi.mock hoisteado).
const mockPrisma = vi.hoisted(() => ({
  driverEarning: { aggregate: vi.fn() },
  payout: { findMany: vi.fn(), create: vi.fn() },
  driver: { findUnique: vi.fn() },
}));

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { getDriverBalance, requestPayout, PayoutError } from './payout.service';

/**
 * `earned` es lo que GANÓ; `retenido` es lo que ZIPA de verdad recaudó.
 *
 * Antes eran el mismo número y de ahí salía el saldo retirable — ése era el
 * defecto: un servicio en efectivo sumaba «disponible» aunque el conductor ya
 * tuviera la plata en el bolsillo. Por defecto se asume que todo lo ganado se
 * cobró en línea, para que las pruebas que no hablan de esto sigan leyéndose
 * igual; las que sí, lo pasan aparte.
 */
function setupBalance(
  earned: number,
  payouts: Array<{ amount: number; status: string }> = [],
  retenido: number = earned,
  debe: number = 0,
): void {
  mockPrisma.driverEarning.aggregate.mockResolvedValue({
    _sum: { netEarning: earned, platformHeld: retenido, driverOwes: debe },
  });
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

  // ── Lo que esta tanda corrige ─────────────────────────────────────────────
  // El saldo retirable salía de `netEarning`, que se escribe en TODO servicio
  // completado sin mirar quién cobró. En efectivo eso le debía al conductor una
  // plata que ya tenía encima.

  it('lo cobrado EN EFECTIVO no deja saldo retirable', async () => {
    // Ganó 100.000 conduciendo, pero todo lo cobró él: no recaudamos nada.
    setupBalance(100000, [], 0, 15000);
    const b = await getDriverBalance('d1');
    expect(b.totalEarned).toBe(100000);
    expect(b.available).toBe(0);
    expect(b.owed).toBe(15000);
  });

  it('la deuda se compensa contra lo que sí retuvimos', async () => {
    setupBalance(100000, [], 50000, 12000);
    const b = await getDriverBalance('d1');
    expect(b.available).toBe(38000);
    expect(b.owed).toBe(12000);
  });

  it('la deuda se VE aunque el disponible quede en cero', async () => {
    setupBalance(60000, [], 0, 9000);
    const b = await getDriverBalance('d1');
    expect(b.available).toBe(0);
    expect(b.owed).toBe(9000);
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

  it('un conductor 100 % de efectivo no puede retirar nada', async () => {
    // El caso concreto que el defecto permitía: cincuenta carreras en efectivo
    // daban ~$255.000 «disponibles» de plata ya cobrada.
    setupBalance(255000, [], 0, 45000);
    await expect(requestPayout('d1', { amount: 25000 })).rejects.toBeInstanceOf(PayoutError);
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
