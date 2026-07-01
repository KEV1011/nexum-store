import { describe, it, expect } from 'vitest';
import { getIntercityRoute, getMaxFarePerSeat } from './constants';

describe('getIntercityRoute', () => {
  it('devuelve una ruta con distancia > 0 para un par soportado', () => {
    const r = getIntercityRoute('pamplona', 'cucuta');
    expect(r).toBeTruthy();
    expect(r!.distanceKm).toBeGreaterThan(0);
  });
});

describe('getMaxFarePerSeat (tope de gasto compartido)', () => {
  it('es 0 con totalSeats inválido', () => {
    expect(getMaxFarePerSeat('pamplona', 'cucuta', 0)).toBe(0);
  });

  it('reparte el costo entre ocupantes y redondea a múltiplos de 500', () => {
    const cap = getMaxFarePerSeat('pamplona', 'cucuta', 4);
    expect(cap).toBeGreaterThan(0);
    expect(cap % 500).toBe(0);
  });

  it('más puestos → tope por puesto menor o igual', () => {
    const cap2 = getMaxFarePerSeat('pamplona', 'cucuta', 2);
    const cap4 = getMaxFarePerSeat('pamplona', 'cucuta', 4);
    expect(cap4).toBeLessThanOrEqual(cap2);
  });
});
