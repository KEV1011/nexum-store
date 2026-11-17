import { describe, it, expect } from 'vitest';
import {
  RECOGIDA_FALTA,
  etiquetaDePagoDePuesto,
  metodoDePuesto,
  recogidaDePuesto,
} from './reserva-puesto-urbano';

const PAMPLONA = { origenLat: 7.3754, origenLng: -72.6486 };

describe('recogidaDePuesto', () => {
  it('exige dirección Y punto: era opcional y el taxista no sabía a dónde ir', () => {
    expect(recogidaDePuesto({ direccion: '', lat: 7.37, lng: -72.64, ...PAMPLONA }))
      .toEqual({ motivo: RECOGIDA_FALTA });
    expect(recogidaDePuesto({ direccion: 'Parque', lat: undefined, lng: undefined, ...PAMPLONA }))
      .toEqual({ motivo: RECOGIDA_FALTA });
    expect(recogidaDePuesto({ direccion: 'Parque', lat: '7.37', lng: '-72.64', ...PAMPLONA }))
      .toEqual({ motivo: RECOGIDA_FALTA });
  });

  it('(0,0) es «falta el dato», no un punto', () => {
    expect(recogidaDePuesto({ direccion: 'Parque', lat: 0, lng: 0, ...PAMPLONA }))
      .toEqual({ motivo: RECOGIDA_FALTA });
  });

  it('un punto en otra ciudad se rechaza diciendo que revise el pin', () => {
    // Cúcuta queda a ~70 km del centro de Pamplona.
    const r = recogidaDePuesto({ direccion: 'Centro', lat: 7.8939, lng: -72.5078, ...PAMPLONA });
    expect('motivo' in r && r.motivo).toMatch(/lejos/);
  });

  it('un punto válido sale saneado', () => {
    expect(recogidaDePuesto({ direccion: '  Parque de los Enamorados ', lat: 7.37, lng: -72.645, ...PAMPLONA }))
      .toEqual({ recogida: { direccion: 'Parque de los Enamorados', lat: 7.37, lng: -72.645 } });
  });

  it('sin el origen del viaje no se inventa una distancia', () => {
    expect('recogida' in recogidaDePuesto({ direccion: 'X', lat: 7.8939, lng: -72.5078 })).toBe(true);
  });
});

describe('metodoDePuesto', () => {
  it('sin método se acepta (apps viejas) y queda NULL, no «efectivo» inventado', () => {
    expect(metodoDePuesto(undefined)).toEqual({ metodo: null });
    expect(metodoDePuesto('')).toEqual({ metodo: null });
    expect(etiquetaDePagoDePuesto(null)).toBe('Pago no indicado');
  });

  it('los métodos que cobra el conductor pasan', () => {
    expect(metodoDePuesto('efectivo')).toEqual({ metodo: 'efectivo' });
    expect(metodoDePuesto('NEQUI')).toEqual({ metodo: 'nequi' });
    expect(etiquetaDePagoDePuesto('nequi')).toBe('Nequi');
  });

  it('el pago en línea NO: el puesto se paga en la mano', () => {
    expect('motivo' in metodoDePuesto('en_linea')).toBe(true);
    expect('motivo' in metodoDePuesto('bitcoin')).toBe(true);
  });
});
