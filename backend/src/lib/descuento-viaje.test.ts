import { describe, it, expect } from 'vitest';
import { aplicarCupon, descuentoSellable, totalPasajero } from './descuento-viaje';

// Un viaje corriente: $20.000 de tarifa, 15 % de comisión.
const TARIFA = 20000;
const COMISION = 3000;
const NETO = 17000;

describe('aplicarCupon', () => {
  it('el pasajero paga la tarifa menos el descuento', () => {
    const d = aplicarCupon(TARIFA, COMISION, NETO, 5000);
    expect(d.pagaPasajero).toBe(15000);
    expect(d.descuento).toBe(5000);
  });

  it('LA LIQUIDACIÓN DEL CONDUCTOR NO CAMBIA', () => {
    // La regla que sostiene todo el archivo: el descuento es publicidad
    // nuestra. Si esto se rompe, le estamos descontando al conductor una
    // promoción que él no ofreció y de la que no se entera.
    const sin = aplicarCupon(TARIFA, COMISION, NETO, 0);
    for (const descuento of [1000, 5000, 19000, TARIFA]) {
      const con = aplicarCupon(TARIFA, COMISION, NETO, descuento);
      expect(con.netoConductor).toBe(sin.netoConductor);
      expect(con.netoConductor).toBe(NETO);
    }
  });

  it('lo absorbe la comisión, y puede quedar en negativo', () => {
    // Un descuento de $5.000 sobre una comisión de $3.000 nos cuesta $2.000
    // de verdad. Recortarlo a cero escondería el costo de la promoción.
    const d = aplicarCupon(TARIFA, COMISION, NETO, 5000);
    expect(d.margenPlataforma).toBe(-2000);
  });

  it('un descuento menor que la comisión solo la reduce', () => {
    const d = aplicarCupon(TARIFA, COMISION, NETO, 1000);
    expect(d.margenPlataforma).toBe(2000);
  });

  it('el descuento nunca supera la tarifa: nadie cobra por viajar', () => {
    const d = aplicarCupon(TARIFA, COMISION, NETO, 50000);
    expect(d.descuento).toBe(TARIFA);
    expect(d.pagaPasajero).toBe(0);
    expect(d.netoConductor).toBe(NETO);
  });

  it('sin cupón el desglose es idéntico al de hoy', () => {
    const d = aplicarCupon(TARIFA, COMISION, NETO, 0);
    expect(d.pagaPasajero).toBe(TARIFA);
    expect(d.descuento).toBe(0);
    expect(d.margenPlataforma).toBe(COMISION);
  });

  it('un descuento negativo se ignora en vez de sumar', () => {
    const d = aplicarCupon(TARIFA, COMISION, NETO, -5000);
    expect(d.descuento).toBe(0);
    expect(d.pagaPasajero).toBe(TARIFA);
  });

  it('todo queda en pesos enteros', () => {
    const d = aplicarCupon(20000.4, 3000.6, 16999.4, 1500.5);
    for (const v of Object.values(d)) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('descuentoSellable', () => {
  it('sin cupón no se sella nada', () => {
    expect(descuentoSellable(null)).toBeNull();
    expect(descuentoSellable(undefined)).toBeNull();
    expect(descuentoSellable(0)).toBeNull();
  });

  it('un descuento real se sella redondeado', () => {
    expect(descuentoSellable(4999.6)).toBe(5000);
  });
});

describe('totalPasajero', () => {
  it('sin tarifa liquidada no hay total que cobrar', () => {
    expect(totalPasajero(null, 5000)).toBeNull();
  });

  it('resta el descuento sellado', () => {
    expect(totalPasajero(20000, 5000)).toBe(15000);
  });

  it('sin cupón el total es la tarifa', () => {
    expect(totalPasajero(20000, null)).toBe(20000);
    expect(totalPasajero(20000, 0)).toBe(20000);
  });

  it('un descuento mayor que la tarifa no deja el total en negativo', () => {
    expect(totalPasajero(8000, 20000)).toBe(0);
  });
});
