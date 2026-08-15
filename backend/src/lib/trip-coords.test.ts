import { describe, it, expect } from 'vitest';

import {
  CoordenadaFaltante,
  exigirPuntoDestino,
  exigirPuntoRecogida,
} from './trip-coords';

describe('coordenadas del viaje', () => {
  it('acepta un punto real de Pamplona', () => {
    expect(exigirPuntoRecogida(7.3754, -72.6486)).toEqual({
      lat: 7.3754,
      lng: -72.6486,
    });
  });

  it('acepta un punto de otra ciudad (no se acota a Pamplona)', () => {
    expect(exigirPuntoDestino(4.711, -74.0721)).toEqual({
      lat: 4.711,
      lng: -74.0721,
    });
  });

  it('rechaza la recogida sin coordenadas y dice qué hacer', () => {
    expect(() => exigirPuntoRecogida(undefined, undefined)).toThrow(
      CoordenadaFaltante,
    );
    expect(() => exigirPuntoRecogida(null, null)).toThrow(
      /Usar mi ubicación actual/,
    );
  });

  it('rechaza el destino sin coordenadas con su propio mensaje', () => {
    expect(() => exigirPuntoDestino(undefined, undefined)).toThrow(
      /Elígelo en el mapa/,
    );
  });

  it('rechaza media coordenada (lat sin lng)', () => {
    expect(() => exigirPuntoRecogida(7.3754, undefined)).toThrow(
      CoordenadaFaltante,
    );
    expect(() => exigirPuntoRecogida(undefined, -72.6486)).toThrow(
      CoordenadaFaltante,
    );
  });

  it('rechaza (0, 0): es el cero por defecto de alguien, no un viaje', () => {
    expect(() => exigirPuntoRecogida(0, 0)).toThrow(CoordenadaFaltante);
  });

  it('rechaza valores fuera del planeta', () => {
    expect(() => exigirPuntoRecogida(91, 0)).toThrow(CoordenadaFaltante);
    expect(() => exigirPuntoRecogida(0, 181)).toThrow(CoordenadaFaltante);
    expect(() => exigirPuntoRecogida(NaN, NaN)).toThrow(CoordenadaFaltante);
  });

  it('acepta un cero legítimo cuando el otro eje no lo es', () => {
    // El ecuador y el meridiano existen: solo el par (0,0) es sospechoso.
    expect(exigirPuntoRecogida(0, -72.6486)).toEqual({
      lat: 0,
      lng: -72.6486,
    });
  });
});
