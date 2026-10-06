import { describe, it, expect } from 'vitest';
import {
  tipoDeAliado, saldoDeAliado, motivoParaNoGirar, creditosQueCubre,
  GiroError, MINIMO_GIRO_COP,
} from './giro-aliado';

describe('a quién se le gira', () => {
  it('reconoce cada tipo de aliado', () => {
    expect(tipoDeAliado({ driverId: 'd1' })).toBe('conductor');
    expect(tipoDeAliado({ businessId: 'b1' })).toBe('negocio');
    expect(tipoDeAliado({ operatorId: 'o1' })).toBe('empresa');
  });

  it('DOS beneficiarios es un error, no una preferencia', () => {
    // Si se eligiera uno «por orden», cambiar ese orden más tarde movería
    // plata a otro bolsillo sin que nadie lo note.
    expect(() => tipoDeAliado({ businessId: 'b1', operatorId: 'o1' }))
      .toThrow(GiroError);
    expect(() => tipoDeAliado({ driverId: 'd1', businessId: 'b1' }))
      .toThrow(/dos beneficiarios/);
  });

  it('sin beneficiario también revienta: es plata saliendo sin destino', () => {
    expect(() => tipoDeAliado({})).toThrow(GiroError);
    expect(() => tipoDeAliado({ driverId: null, businessId: '' })).toThrow(GiroError);
  });
});

describe('el saldo del aliado', () => {
  it('suma lo pendiente y dice de cuántas ventas sale', () => {
    const s = saldoDeAliado([{ netAmount: 12000 }, { netAmount: 8000 }]);
    expect(s.disponible).toBe(20000);
    expect(s.movimientos).toBe(2);
  });

  it('un crédito negativo NO le resta al aliado', () => {
    // Un negativo solo puede venir de un error de cálculo nuestro. Dejar que
    // reduzca lo que le debemos le cobraría a él nuestra equivocación.
    const s = saldoDeAliado([{ netAmount: 10000 }, { netAmount: -4000 }]);
    expect(s.disponible).toBe(10000);
    expect(s.movimientos).toBe(1);
  });

  it('sin créditos, cero y sin inventar nada', () => {
    expect(saldoDeAliado([])).toEqual({ disponible: 0, movimientos: 0 });
  });
});

describe('cuándo se puede girar', () => {
  const saldo = { disponible: 50000, movimientos: 3 };

  it('deja girar lo que hay', () => {
    expect(motivoParaNoGirar(saldo, 50000)).toBeNull();
  });

  it('no deja girar más de lo que hay, y DICE cuánto hay', () => {
    const m = motivoParaNoGirar(saldo, 60000);
    expect(m).toBeTruthy();
    // El número exacto importa: «no se puede» no le dice a nadie qué pedir.
    expect(m).toContain('50.000');
  });

  it('por debajo del mínimo se explica que se acumula', () => {
    const m = motivoParaNoGirar(saldo, 1000);
    expect(m).toContain('mínimo');
    expect(m).toContain('acumula');
  });

  it('sin nada pendiente lo dice distinto de «no llegas al mínimo»', () => {
    // Son dos conversaciones: una se arregla esperando y la otra no se
    // arregla de ninguna forma.
    const m = motivoParaNoGirar({ disponible: 0, movimientos: 0 }, 1000);
    expect(m).toContain('No hay nada pendiente');
  });

  it('un monto de cero o negativo se rechaza', () => {
    expect(motivoParaNoGirar(saldo, 0)).toBeTruthy();
    expect(motivoParaNoGirar(saldo, -100)).toBeTruthy();
  });

  it('el mínimo es configurable y tiene un valor sensato', () => {
    expect(MINIMO_GIRO_COP).toBeGreaterThan(0);
  });
});

describe('qué ventas salda un giro', () => {
  const creditos = [
    { id: 'viejo', netAmount: 10000 },
    { id: 'medio', netAmount: 15000 },
    { id: 'nuevo', netAmount: 20000 },
  ];

  it('paga lo MÁS VIEJO primero', () => {
    // Si pagara lo más nuevo, una venta de hace tres meses podría quedarse
    // sin girar indefinidamente mientras entran otras.
    const r = creditosQueCubre(creditos, 25000);
    expect(r.cubiertos.map((c) => c.id)).toEqual(['viejo', 'medio']);
    expect(r.total).toBe(25000);
  });

  it('solo entran ventas COMPLETAS; lo que sobra queda para el siguiente giro', () => {
    // Partir un crédito obligaría a llevar un «pagado parcialmente», que es
    // justo el estado que vuelve imposible cuadrar una conciliación.
    const r = creditosQueCubre(creditos, 20000);
    expect(r.cubiertos.map((c) => c.id)).toEqual(['viejo']);
    expect(r.total).toBe(10000);
  });

  it('si no alcanza ni para la más vieja, no cubre ninguna', () => {
    const r = creditosQueCubre(creditos, 5000);
    expect(r.cubiertos).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('con monto de sobra las toma todas', () => {
    const r = creditosQueCubre(creditos, 999999);
    expect(r.cubiertos).toHaveLength(3);
    expect(r.total).toBe(45000);
  });
});
