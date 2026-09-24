import { describe, it, expect } from 'vitest';
import { motivoParaNoAplicarCupon, totalDelPasaje } from './cupon-pasaje';

const deEmpresa = (operatorId: string) => ({
  code: 'COTRA10', operatorId, aplicaAPasajes: true,
});
const dePlataforma = { code: 'ZIPA5', operatorId: null, aplicaAPasajes: true };

describe('quién paga el descuento', () => {
  it('el de la empresa vale en SUS salidas', () => {
    expect(motivoParaNoAplicarCupon(deEmpresa('op-1'), { operatorId: 'op-1' })).toBeNull();
  });

  it('el de la PLATAFORMA se rechaza, y no es un capricho', () => {
    // El pasaje se le paga a la empresa: nosotros no estamos en medio del
    // dinero. Aplicarlo haría que la empresa cobrara menos sin haberlo
    // decidido y sin que nadie le reponga la diferencia — justo lo que el
    // cupón urbano existe para NO hacer.
    const m = motivoParaNoAplicarCupon(dePlataforma, { operatorId: 'op-1' });
    expect(m).toMatch(/directamente a la empresa/i);
  });

  it('el de una empresa NO vale en la salida de otra', () => {
    expect(motivoParaNoAplicarCupon(deEmpresa('op-1'), { operatorId: 'op-2' }))
      .toMatch(/otra empresa/i);
  });

  it('ni en la de un conductor particular', () => {
    expect(motivoParaNoAplicarCupon(deEmpresa('op-1'), { operatorId: null }))
      .toMatch(/particular/i);
  });

  it('un código que no es para pasajes se rechaza antes que nada', () => {
    const m = motivoParaNoAplicarCupon(
      { code: 'COMIDA', operatorId: 'op-1', aplicaAPasajes: false },
      { operatorId: 'op-1' },
    );
    expect(m).toMatch(/no aplica para pasajes/i);
  });
});

describe('la cuenta del pasaje', () => {
  it('multiplica los puestos', () => {
    expect(totalDelPasaje(40000, 2)).toEqual({ total: 80000, descuento: 0, paga: 80000 });
  });

  it('descuenta sin pasarse del total', () => {
    // Un cupón mayor que el pasaje dejaría al pasajero cobrando por viajar, y
    // al conductor discutiéndolo en la puerta del bus.
    expect(totalDelPasaje(40000, 1, 60000)).toEqual({
      total: 40000, descuento: 40000, paga: 0,
    });
  });

  it('todo en pesos enteros: el efectivo no tiene monedas partidas', () => {
    const r = totalDelPasaje(33333.4, 3, 1000.6);
    expect(Number.isInteger(r.total)).toBe(true);
    expect(Number.isInteger(r.paga)).toBe(true);
    expect(r.total).toBe(100000);
  });

  it('un descuento negativo no suma plata', () => {
    expect(totalDelPasaje(40000, 1, -5000).paga).toBe(40000);
  });
});
