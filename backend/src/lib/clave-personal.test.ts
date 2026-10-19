/**
 * Clave personal: lo que cierra la llave maestra del piloto.
 */
import { describe, expect, it } from 'vitest';

import {
  CLAVE_BLOQUEO_MS,
  CLAVE_MAX_FALLOS,
  claveCoincide,
  hashClave,
  minutosBloqueo,
  motivoClaveInvalida,
  trasFallo,
} from './clave-personal';

describe('qué clave se acepta', () => {
  it.each(['4827', '90315', '271846', ' 4827 '])('«%s» sí', (c) => {
    expect(motivoClaveInvalida(c)).toBeNull();
  });

  it.each([
    ['123', 'muy corta'],
    ['1234567', 'muy larga'],
    ['12a4', 'con letras'],
    ['0000', 'repetida'],
    ['777777', 'repetida'],
    ['1234', 'seguida hacia arriba'],
    ['6543', 'seguida hacia abajo'],
    ['8901', 'seguida dando la vuelta'],
  ])('«%s» no (%s)', (c) => {
    expect(motivoClaveInvalida(c)).not.toBeNull();
  });

  it('lo que no es texto no es clave', () => {
    expect(motivoClaveInvalida(4827)).not.toBeNull();
    expect(motivoClaveInvalida(undefined)).not.toBeNull();
  });
});

describe('se guarda con hash, no en claro', () => {
  it('el hash no contiene la clave y la comprueba', () => {
    const h = hashClave('4827');
    expect(h).not.toContain('4827');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(claveCoincide(h, '4827')).toBe(true);
    expect(claveCoincide(h, ' 4827')).toBe(true);
    expect(claveCoincide(h, '4828')).toBe(false);
  });

  it('dos hashes de la misma clave son distintos (sal)', () => {
    expect(hashClave('4827')).not.toBe(hashClave('4827'));
  });

  it('un hash vacío o malformado nunca coincide', () => {
    expect(claveCoincide(null, '4827')).toBe(false);
    expect(claveCoincide('4827', '4827')).toBe(false);
    expect(claveCoincide('scrypt$$', '4827')).toBe(false);
  });
});

describe('el bloqueo por intentos', () => {
  const t0 = new Date('2026-10-19T15:00:00Z');

  it('bloquea al llegar al tope y el contador vuelve a cero', () => {
    let e = { fallos: 0, bloqueadaHasta: null as Date | null };
    for (let i = 0; i < CLAVE_MAX_FALLOS - 1; i++) {
      e = trasFallo(e, t0);
      expect(e.bloqueadaHasta).toBeNull();
    }
    e = trasFallo(e, t0);
    expect(e.bloqueadaHasta?.getTime()).toBe(t0.getTime() + CLAVE_BLOQUEO_MS);
    expect(e.fallos).toBe(0);
    expect(minutosBloqueo(e, t0)).toBe(15);
  });

  it('pasado el bloqueo se cuenta desde cero', () => {
    const vencido = { fallos: 3, bloqueadaHasta: new Date(t0.getTime() - 1000) };
    expect(minutosBloqueo(vencido, t0)).toBe(0);
    expect(trasFallo(vencido, t0)).toEqual({ fallos: 1, bloqueadaHasta: null });
  });
});
