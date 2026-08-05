import { describe, it, expect } from 'vitest';
import { cobroBalance, assertPaymentAmount, PaymentAmountError } from './cobro-balance';

describe('cobroBalance', () => {
  it('una cuenta sin pagos debe el total', () => {
    const b = cobroBalance(5_000_000, []);
    expect(b.total).toBe(5_000_000);
    expect(b.paid).toBe(0);
    expect(b.balance).toBe(5_000_000);
    expect(b.status).toBe('SIN_PAGOS');
    expect(b.pct).toBe(0);
  });

  it('el anticipo deja la cuenta parcial', () => {
    // El caso normal: adelanto al despachar para combustible y peajes.
    const b = cobroBalance(5_000_000, [{ amount: 1_500_000, kind: 'ANTICIPO' }]);
    expect(b.paid).toBe(1_500_000);
    expect(b.balance).toBe(3_500_000);
    expect(b.advance).toBe(1_500_000);
    expect(b.status).toBe('PARCIAL');
    expect(b.pct).toBe(30);
  });

  it('anticipo más saldo cierra la cuenta exacta', () => {
    const b = cobroBalance(5_000_000, [
      { amount: 1_500_000, kind: 'ANTICIPO' },
      { amount: 3_500_000, kind: 'SALDO' },
    ]);
    expect(b.balance).toBe(0);
    expect(b.status).toBe('PAGADA');
    expect(b.pct).toBe(100);
  });

  it('varios abonos parciales se acumulan', () => {
    const b = cobroBalance(9_000_000, [
      { amount: 2_000_000, kind: 'ANTICIPO' },
      { amount: 3_000_000, kind: 'ABONO' },
      { amount: 1_000_000, kind: 'ABONO' },
    ]);
    expect(b.paid).toBe(6_000_000);
    expect(b.balance).toBe(3_000_000);
    expect(b.payments).toBe(3);
    // El anticipo se distingue de los abonos: es el que financia el viaje.
    expect(b.advance).toBe(2_000_000);
  });

  it('un pago anulado deja de contar', () => {
    const b = cobroBalance(5_000_000, [
      { amount: 1_500_000, kind: 'ANTICIPO' },
      { amount: 2_000_000, kind: 'ABONO', voidedAt: new Date() },
    ]);
    expect(b.paid).toBe(1_500_000);
    expect(b.payments).toBe(1);
  });

  it('marca el sobrepago en vez de esconderlo', () => {
    const b = cobroBalance(1_000_000, [{ amount: 1_200_000, kind: 'ABONO' }]);
    expect(b.balance).toBe(-200_000);
    expect(b.status).toBe('SOBREPAGADA');
    // El porcentaje se acota: un 120 % en la barra no se entiende.
    expect(b.pct).toBe(100);
  });

  it('una cuenta sin valor no se declara pagada', () => {
    // Sin viajes con precio no hay contra qué abonar; devolver 100 % diría que
    // está saldada una cuenta que todavía no vale nada.
    const b = cobroBalance(0, []);
    expect(b.status).toBe('SIN_PAGOS');
    expect(b.pct).toBe(0);
    expect(b.balance).toBe(0);
  });

  it('redondea a pesos: no deja saldos fantasma de céntimos', () => {
    const b = cobroBalance(1_000_000.4, [{ amount: 1_000_000.3, kind: 'SALDO' }]);
    expect(b.balance).toBe(0);
    expect(b.status).toBe('PAGADA');
  });
});

describe('assertPaymentAmount', () => {
  it('rechaza montos no positivos', () => {
    expect(() => assertPaymentAmount(0, 100_000)).toThrow(PaymentAmountError);
    expect(() => assertPaymentAmount(-5, 100_000)).toThrow(PaymentAmountError);
    expect(() => assertPaymentAmount(Number.NaN, 100_000)).toThrow(PaymentAmountError);
  });

  it('acepta un abono menor al saldo', () => {
    expect(() => assertPaymentAmount(50_000, 100_000)).not.toThrow();
  });

  it('acepta el pago exacto del saldo', () => {
    expect(() => assertPaymentAmount(100_000, 100_000)).not.toThrow();
  });

  it('rechaza el dedo de más y dice cuál es el saldo', () => {
    // Un cero de más es el error típico y descuadra el cierre del mes.
    try {
      assertPaymentAmount(1_000_000, 100_000);
      throw new Error('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentAmountError);
      expect((e as Error).message).toContain('100.000');
    }
  });

  it('avisa distinto cuando ya no queda saldo', () => {
    try {
      assertPaymentAmount(50_000, 0);
      throw new Error('debió lanzar');
    } catch (e) {
      expect((e as Error).message).toContain('ya está pagada');
    }
  });

  it('deja pasar el sobrepago cuando se pide a propósito', () => {
    expect(() => assertPaymentAmount(1_000_000, 100_000, true)).not.toThrow();
  });
});
