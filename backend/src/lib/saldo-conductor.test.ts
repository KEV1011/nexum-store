import { describe, it, expect } from 'vitest';
import { movimientoDeLiquidacion, quienCobra, saldoDelConductor } from './saldo-conductor';

describe('quienCobra', () => {
  it('el pago en línea lo cobra la plataforma', () => {
    expect(quienCobra('en_linea')).toBe('plataforma');
  });

  it('efectivo, Nequi, Daviplata y transferencias las cobra el conductor', () => {
    // Nequi NO es «pago en la app»: la plata le llega a él directamente.
    // Confundirlos es lo que hacía que la billetera le debiera dinero que ya
    // tenía en la mano.
    for (const m of ['efectivo', 'nequi', 'daviplata', 'bancolombia', 'transferencia']) {
      expect(quienCobra(m), m).toBe('conductor');
    }
  });

  it('sin método declarado se asume EFECTIVO, no plataforma', () => {
    // Es el error barato frente al caro: como mucho deja una comisión sin
    // cobrar, mientras que asumir «plataforma» acreditaría plata que nunca
    // recibimos. Las apps viejas no mandan el campo.
    expect(quienCobra(null)).toBe('conductor');
    expect(quienCobra(undefined)).toBe('conductor');
    expect(quienCobra('')).toBe('conductor');
  });

  it('un método inventado tampoco acredita nada', () => {
    expect(quienCobra('bitcoin')).toBe('conductor');
  });
});

describe('movimientoDeLiquidacion', () => {
  it('EFECTIVO: no se le debe nada y nos debe la comisión', () => {
    // Carrera de 6.000 con comisión de 900: él ya tiene los 6.000.
    expect(movimientoDeLiquidacion(6000, 5100, 'efectivo')).toEqual({
      aFavorDelConductor: 0,
      deudaDelConductor: 900,
    });
  });

  it('EN LÍNEA: se le debe su neto y la comisión ya está en casa', () => {
    expect(movimientoDeLiquidacion(6000, 5100, 'en_linea')).toEqual({
      aFavorDelConductor: 5100,
      deudaDelConductor: 0,
    });
  });

  it('NEQUI al conductor cuenta como efectivo, no como pago en la app', () => {
    // Es el caso que más fácil se cuela: «pagó por la app» suena a que
    // nosotros cobramos, y no.
    expect(movimientoDeLiquidacion(10000, 8500, 'nequi')).toEqual({
      aFavorDelConductor: 0,
      deudaDelConductor: 1500,
    });
  });

  it('las dos ramas son excluyentes: nunca se debe y se adeuda a la vez', () => {
    for (const m of ['efectivo', 'en_linea', 'nequi', null]) {
      const mov = movimientoDeLiquidacion(9000, 7650, m);
      expect(mov.aFavorDelConductor === 0 || mov.deudaDelConductor === 0, String(m)).toBe(true);
    }
  });

  it('sin comisión (propina, tarifa completa) no genera deuda', () => {
    expect(movimientoDeLiquidacion(5000, 5000, 'efectivo')).toEqual({
      aFavorDelConductor: 0,
      deudaDelConductor: 0,
    });
  });

  it('redondea a peso entero: no quedan deudas de céntimos', () => {
    const mov = movimientoDeLiquidacion(6000.4, 5100.6, 'efectivo');
    expect(Number.isInteger(mov.deudaDelConductor)).toBe(true);
  });

  it('un neto mayor que el bruto no produce comisión negativa', () => {
    // Dato corrupto: se descarta hacia cero en vez de regalarle saldo.
    expect(movimientoDeLiquidacion(5000, 7000, 'efectivo').deudaDelConductor).toBe(0);
  });
});

describe('saldoDelConductor', () => {
  it('lo retenido menos lo girado es lo que hay a favor', () => {
    const s = saldoDelConductor({
      retenidoPorLaPlataforma: 50000, deudaAcumulada: 0, yaPagado: 20000, solicitado: 0,
    });
    expect(s.aFavor).toBe(30000);
    expect(s.disponible).toBe(30000);
  });

  it('la deuda se compensa contra lo retirable', () => {
    // Si le debemos 50.000 y nos debe 12.000, saca 38.000. Cobrárselo aparte
    // sería hacerle dar dos vueltas por el mismo dinero.
    const s = saldoDelConductor({
      retenidoPorLaPlataforma: 50000, deudaAcumulada: 12000, yaPagado: 0, solicitado: 0,
    });
    expect(s.disponible).toBe(38000);
    expect(s.deuda).toBe(12000);
  });

  it('la deuda se VE aunque el disponible quede en cero', () => {
    // Un «$0 disponible» a secas se lee como un error de la app; «debes
    // $9.000 de comisiones» se lee como lo que es.
    const s = saldoDelConductor({
      retenidoPorLaPlataforma: 0, deudaAcumulada: 9000, yaPagado: 0, solicitado: 0,
    });
    expect(s.disponible).toBe(0);
    expect(s.deuda).toBe(9000);
  });

  it('lo solicitado no se puede volver a pedir', () => {
    const s = saldoDelConductor({
      retenidoPorLaPlataforma: 50000, deudaAcumulada: 0, yaPagado: 10000, solicitado: 15000,
    });
    expect(s.disponible).toBe(25000);
  });

  it('el disponible nunca es negativo', () => {
    const s = saldoDelConductor({
      retenidoPorLaPlataforma: 1000, deudaAcumulada: 90000, yaPagado: 0, solicitado: 0,
    });
    expect(s.disponible).toBe(0);
    expect(s.deuda).toBe(90000);
  });

  it('un conductor 100 % de efectivo no tiene nada que retirar', () => {
    // El caso que hoy se rompe: cincuenta carreras en efectivo daban
    // ~$255.000 «disponibles» de plata que ya se había cobrado.
    const s = saldoDelConductor({
      retenidoPorLaPlataforma: 0, deudaAcumulada: 45000, yaPagado: 0, solicitado: 0,
    });
    expect(s.disponible).toBe(0);
  });
});
