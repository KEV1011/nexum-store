import { describe, it, expect } from 'vitest';
import {
  EXPENSE_TYPES, FREIGHT_EVENT_TYPES, costBreakdown, isFreightEventType, requiresAmount,
} from './freight-costs';

describe('tipos de evento del flete', () => {
  it('acepta los seis tipos y rechaza cualquier otro', () => {
    for (const t of FREIGHT_EVENT_TYPES) expect(isFreightEventType(t)).toBe(true);
    expect(isFreightEventType('GASOLINA')).toBe(false);
    expect(isFreightEventType('fuel')).toBe(false); // el servicio normaliza a mayúsculas antes
    expect(isFreightEventType('')).toBe(false);
  });

  it('solo los gastos exigen monto', () => {
    for (const t of EXPENSE_TYPES) expect(requiresAmount(t)).toBe(true);
    expect(requiresAmount('STOP')).toBe(false);
    expect(requiresAmount('NOTE')).toBe(false);
  });

  it('los cuatro conceptos de gasto siguen siendo los esperados', () => {
    // Si alguien añade un tipo de gasto sin tocar costBreakdown, el margen
    // quedaría mal y nadie lo notaría hasta el cierre de mes.
    expect([...EXPENSE_TYPES]).toEqual(['FUEL', 'TOLL', 'PERDIEM', 'MAINTENANCE']);
  });
});

describe('costBreakdown', () => {
  it('sin eventos, todo en cero', () => {
    expect(costBreakdown([])).toEqual({ fuel: 0, toll: 0, perdiem: 0, maintenance: 0, total: 0 });
  });

  it('reparte por concepto y suma el total', () => {
    const c = costBreakdown([
      { type: 'FUEL', amountCop: 320_000 },
      { type: 'FUEL', amountCop: 180_000 },
      { type: 'TOLL', amountCop: 46_500 },
      { type: 'PERDIEM', amountCop: 60_000 },
      { type: 'MAINTENANCE', amountCop: 90_000 },
    ]);
    expect(c.fuel).toBe(500_000);
    expect(c.toll).toBe(46_500);
    expect(c.perdiem).toBe(60_000);
    expect(c.maintenance).toBe(90_000);
    expect(c.total).toBe(696_500);
  });

  it('las paradas y notas no son gasto aunque traigan monto', () => {
    const c = costBreakdown([
      { type: 'STOP', amountCop: 999_999 },
      { type: 'NOTE', amountCop: 999_999 },
      { type: 'FUEL', amountCop: 100_000 },
    ]);
    expect(c.total).toBe(100_000);
  });

  it('ignora montos nulos, cero y negativos', () => {
    // Un evento viejo o mal grabado no debe inventar costo ni restarlo.
    const c = costBreakdown([
      { type: 'FUEL', amountCop: null },
      { type: 'TOLL' },
      { type: 'PERDIEM', amountCop: 0 },
      { type: 'MAINTENANCE', amountCop: -50_000 },
      { type: 'FUEL', amountCop: 70_000 },
    ]);
    expect(c.total).toBe(70_000);
    expect(c.maintenance).toBe(0);
  });

  it('ignora tipos desconocidos sin romperse', () => {
    const c = costBreakdown([
      { type: 'PARQUEADERO', amountCop: 20_000 },
      { type: 'FUEL', amountCop: 30_000 },
    ]);
    expect(c.total).toBe(30_000);
  });

  it('el margen real se hunde cuando el flete gasta más de lo que deja', () => {
    // Caso que el panel viejo no podía mostrar: flete de $800.000, comisión 15%
    // (=$120.000) y $700.000 de ruta. Facturación sana, operación en pérdida.
    const bruto = 800_000;
    const comision = 120_000;
    const c = costBreakdown([
      { type: 'FUEL', amountCop: 520_000 },
      { type: 'TOLL', amountCop: 120_000 },
      { type: 'PERDIEM', amountCop: 60_000 },
    ]);
    expect(bruto - comision - c.total).toBe(-20_000);
  });
});
