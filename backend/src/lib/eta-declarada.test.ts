import { describe, it, expect } from 'vitest';
import {
  ETA_MAXIMO_MIN,
  ETA_MINIMO_MIN,
  saneaEtaDeclarada,
  textoEtaDeclarada,
} from './eta-declarada';

describe('el tiempo que promete el repartidor', () => {
  it('un minutaje normal pasa tal cual', () => {
    expect(saneaEtaDeclarada(20)).toBe(20);
    expect(saneaEtaDeclarada(45)).toBe(45);
  });

  it('acepta el número como texto: llega de un formulario', () => {
    expect(saneaEtaDeclarada('30')).toBe(30);
  });

  it('redondea los decimales', () => {
    expect(saneaEtaDeclarada(19.6)).toBe(20);
  });

  it('lo que no se entiende devuelve null, NO un número cercano', () => {
    // Un ETA inventado es peor que ninguno: el cliente baja a la portería a
    // esperar algo que nadie prometió.
    for (const malo of ['pronto', null, undefined, Number.NaN, {}, '']) {
      expect(saneaEtaDeclarada(malo)).toBeNull();
    }
  });

  it('un «3 minutos» en una compra que no ha empezado no es creíble', () => {
    expect(saneaEtaDeclarada(ETA_MINIMO_MIN - 1)).toBeNull();
    expect(saneaEtaDeclarada(0)).toBeNull();
    expect(saneaEtaDeclarada(-10)).toBeNull();
  });

  it('y por encima de tres horas lo honesto es cancelar, no prometer', () => {
    expect(saneaEtaDeclarada(ETA_MAXIMO_MIN)).toBe(ETA_MAXIMO_MIN);
    expect(saneaEtaDeclarada(ETA_MAXIMO_MIN + 1)).toBeNull();
    expect(saneaEtaDeclarada(600)).toBeNull();
  });
});

describe('cómo se le dice al cliente', () => {
  it('por debajo de una hora, en minutos', () => {
    expect(textoEtaDeclarada(25)).toBe('en ~25 min');
    expect(textoEtaDeclarada(59)).toBe('en ~59 min');
  });

  it('a partir de una hora, en horas: «95 min» se lee peor que «1 h 35»', () => {
    expect(textoEtaDeclarada(60)).toBe('en ~1 h');
    expect(textoEtaDeclarada(95)).toBe('en ~1 h 35 min');
    expect(textoEtaDeclarada(120)).toBe('en ~2 h');
  });
});
