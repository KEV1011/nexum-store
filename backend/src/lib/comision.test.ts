import { describe, it, expect } from 'vitest';
import {
  tasaValida,
  saneaTasa,
  resolverComision,
  repartir,
  COMISION_GLOBAL,
  COMISION_MAXIMA,
} from './comision';

/**
 * La comisión es la única cifra de la plataforma que sale del bolsillo de otra
 * persona. Un error aquí no da una pantalla rota: da un conductor cobrando de
 * menos durante semanas sin que nadie lo note.
 */
describe('comisión de la plataforma', () => {
  describe('qué se puede cobrar', () => {
    it('acepta cero — una plaza en lanzamiento puede no cobrar nada', () => {
      expect(tasaValida(0)).toBe(true);
    });

    it('acepta un porcentaje normal', () => {
      expect(tasaValida(0.15)).toBe(true);
      expect(tasaValida(COMISION_MAXIMA)).toBe(true);
    });

    it('rechaza lo imposible', () => {
      expect(tasaValida(-0.1)).toBe(false);
      expect(tasaValida(1.5)).toBe(false);
      expect(tasaValida(Number.NaN)).toBe(false);
      expect(tasaValida('0.15')).toBe(false);
      expect(tasaValida(null)).toBe(false);
    });
  });

  describe('lo que llega de un formulario', () => {
    it('entiende la fracción y el porcentaje humano', () => {
      // En un formulario la gente escribe «12», no «0.12».
      expect(saneaTasa(0.12)).toBe(0.12);
      expect(saneaTasa(12)).toBe(0.12);
      expect(saneaTasa('12,5')).toBe(0.125);
    });

    it('vacío significa «usa la de arriba», no cero', () => {
      // Un 0 sería «esta flota no paga comisión», que es una decisión. Dejar el
      // campo en blanco es otra cosa: heredar.
      expect(saneaTasa(null)).toBeNull();
      expect(saneaTasa(undefined)).toBeNull();
      expect(saneaTasa('')).toBeNull();
    });

    it('RECHAZA el dedazo en vez de guardarlo', () => {
      // «15» queriendo decir 15 % ya se interpreta bien. Pero 150 no puede ser
      // nada razonable, y guardarlo dejaría al conductor debiendo dinero por
      // trabajar. Se rechaza al guardar, que es el único momento en que hay
      // alguien delante para corregirlo.
      expect(() => saneaTasa(150)).toThrow(/no puede pasar/i);
      expect(() => saneaTasa(0.9)).toThrow(/no puede pasar/i);
      expect(() => saneaTasa(-1)).toThrow(/positivo/i);
      expect(() => saneaTasa('hola')).toThrow();
    });

    it('recorta el ruido de decimales', () => {
      expect(saneaTasa(0.15547)).toBe(0.1555);
    });
  });

  describe('precedencia flota → ciudad → global', () => {
    it('la flota manda: es con quien se firma', () => {
      expect(resolverComision(0.10, 0.20)).toEqual({ tasa: 0.10, origen: 'flota' });
    });

    it('sin flota, la de la ciudad', () => {
      expect(resolverComision(null, 0.20)).toEqual({ tasa: 0.20, origen: 'ciudad' });
    });

    it('sin ninguna, la global de siempre', () => {
      expect(resolverComision(null, null)).toEqual({
        tasa: COMISION_GLOBAL,
        origen: 'global',
      });
    });

    it('una tasa corrupta en la base se ignora y se sigue bajando', () => {
      // Una edición a mano en SQL o una fila vieja no deben cobrar una
      // barbaridad: se salta ese nivel en vez de aplicarlo.
      expect(resolverComision(9, 0.20)).toEqual({ tasa: 0.20, origen: 'ciudad' });
      expect(resolverComision(9, -1).origen).toBe('global');
    });

    it('una flota con comisión CERO es una decisión, no un vacío', () => {
      // El caso que un `||` rompería: 0 es falsy y heredaría la de la ciudad,
      // cobrándole a quien se le prometió que no pagaría nada.
      expect(resolverComision(0, 0.20)).toEqual({ tasa: 0, origen: 'flota' });
    });
  });

  describe('reparto', () => {
    it('descuenta la tasa dada', () => {
      expect(repartir(10_000, 0.2)).toEqual({
        grossFare: 10_000, commission: 2_000, netEarning: 8_000,
      });
    });

    it('con comisión cero el conductor se lo lleva todo', () => {
      expect(repartir(10_000, 0)).toEqual({
        grossFare: 10_000, commission: 0, netEarning: 10_000,
      });
    });

    it('sin tasa usa la global', () => {
      const r = repartir(10_000);
      expect(r.commission).toBe(Math.round(10_000 * COMISION_GLOBAL));
    });

    it('una tasa imposible cae a la global en vez de vaciar la billetera', () => {
      expect(repartir(10_000, 9).commission).toBe(Math.round(10_000 * COMISION_GLOBAL));
    });

    it('bruto y neto siempre cuadran con la comisión', () => {
      for (const bruto of [0, 1, 999, 10_000, 123_456]) {
        const r = repartir(bruto, 0.17);
        expect(r.grossFare - r.commission).toBe(r.netEarning);
      }
    });
  });
});
