import { describe, it, expect } from 'vitest';

import { LruCache } from './lru-cache';

/** Reloj manual: las pruebas de caducidad no deben dormir. */
function relojFalso(): { ahora: () => number; avanzar: (ms: number) => void } {
  let t = 1_000_000;
  return { ahora: () => t, avanzar: (ms) => (t += ms) };
}

describe('LruCache', () => {
  it('guarda y devuelve', () => {
    const c = new LruCache<string>(10, 1000);
    c.set('a', 'uno');
    expect(c.get('a')).toBe('uno');
    expect(c.get('noexiste')).toBeNull();
  });

  it('NUNCA pasa del tope (el fallo que sería una fuga de memoria)', () => {
    const c = new LruCache<number>(3, 60_000);
    for (let i = 0; i < 500; i++) c.set(`k${i}`, i);
    expect(c.size).toBe(3);
  });

  it('expulsa lo usado hace más tiempo, no lo que llegó primero', () => {
    const c = new LruCache<string>(3, 60_000);
    c.set('a', 'A');
    c.set('b', 'B');
    c.set('c', 'C');
    // 'a' se vuelve a usar: deja de ser la candidata a salir.
    expect(c.get('a')).toBe('A');
    c.set('d', 'D'); // debe expulsar 'b'
    expect(c.get('a')).toBe('A');
    expect(c.get('b')).toBeNull();
    expect(c.get('c')).toBe('C');
    expect(c.get('d')).toBe('D');
  });

  it('reescribir una clave no la duplica ni ocupa dos huecos', () => {
    const c = new LruCache<string>(2, 60_000);
    c.set('a', 'A1');
    c.set('a', 'A2');
    c.set('b', 'B');
    expect(c.size).toBe(2);
    expect(c.get('a')).toBe('A2');
    expect(c.get('b')).toBe('B');
  });

  it('caduca por tiempo', () => {
    const r = relojFalso();
    const c = new LruCache<string>(10, 5000, r.ahora);
    c.set('a', 'A');
    r.avanzar(4999);
    expect(c.get('a')).toBe('A');
    r.avanzar(2);
    expect(c.get('a')).toBeNull();
  });

  it('lo caducado deja de ocupar sitio al consultarlo', () => {
    const r = relojFalso();
    const c = new LruCache<string>(10, 1000, r.ahora);
    c.set('a', 'A');
    expect(c.size).toBe(1);
    r.avanzar(2000);
    c.get('a');
    expect(c.size).toBe(0);
  });

  it('un tope de 1 sigue funcionando', () => {
    const c = new LruCache<string>(1, 60_000);
    c.set('a', 'A');
    c.set('b', 'B');
    expect(c.size).toBe(1);
    expect(c.get('a')).toBeNull();
    expect(c.get('b')).toBe('B');
  });

  it('rechaza un tope imposible en vez de crecer sin límite', () => {
    expect(() => new LruCache<string>(0, 1000)).toThrow(/al menos 1/);
  });

  it('clear vacía', () => {
    const c = new LruCache<string>(5, 60_000);
    c.set('a', 'A');
    c.clear();
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeNull();
  });
});
