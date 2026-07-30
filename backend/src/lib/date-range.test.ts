import { describe, it, expect } from 'vitest';
import { rangoFechas } from './date-range';

describe('rangoFechas', () => {
  it('sin fechas no filtra nada (comportamiento de siempre)', () => {
    expect(rangoFechas()).toEqual({});
    expect(rangoFechas('', '')).toEqual({});
  });

  it('incluye el último día COMPLETO', () => {
    // Es el error clásico: con lte a medianoche, todo lo del 31 se pierde y el
    // reporte del mes no cuadra con lo que cobraron los conductores.
    const { createdAt } = rangoFechas(undefined, '2026-07-31');
    expect(createdAt?.lte?.toISOString().slice(0, 10)).toBe('2026-07-31');
    expect(createdAt?.lte?.getHours()).toBe(23);
    expect(createdAt?.lte?.getMinutes()).toBe(59);
  });

  it('un viaje del último día a las 22:00 entra en el rango', () => {
    const { createdAt } = rangoFechas('2026-07-01', '2026-07-31');
    const viaje = new Date('2026-07-31T22:00:00');
    expect(viaje >= createdAt!.gte!).toBe(true);
    expect(viaje <= createdAt!.lte!).toBe(true);
  });

  it('acepta solo el desde', () => {
    const { createdAt } = rangoFechas('2026-07-01');
    expect(createdAt?.gte).toBeInstanceOf(Date);
    expect(createdAt?.lte).toBeUndefined();
  });

  it('ignora una fecha inválida en vez de reventar', () => {
    expect(rangoFechas('no-es-fecha')).toEqual({});
    const { createdAt } = rangoFechas('no-es-fecha', '2026-07-31');
    expect(createdAt?.gte).toBeUndefined();
    expect(createdAt?.lte).toBeInstanceOf(Date);
  });
});
