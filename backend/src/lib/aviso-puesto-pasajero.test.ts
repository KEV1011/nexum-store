import { describe, it, expect } from 'vitest';
import { avisoAPasajeroDePuesto, horaColombia } from './aviso-puesto-pasajero';

describe('avisoAPasajeroDePuesto', () => {
  it('la hora es la de COLOMBIA, no la del servidor', () => {
    // 22:11 UTC son las 17:11 en Colombia: el fallo que se vio en la app.
    const salida = new Date('2026-11-17T22:11:00Z');
    expect(horaColombia(salida)).toBe('17:11');
    expect(avisoAPasajeroDePuesto('tomado', { conductor: 'Steve', salida }).body)
      .toContain('17:11');
  });

  it('sin nombre del conductor no deja un hueco', () => {
    const a = avisoAPasajeroDePuesto('iniciado', { conductor: null, salida: new Date() });
    expect(a.body.startsWith('El taxista')).toBe(true);
  });

  it('la cancelación dice que no se cobró', () => {
    const a = avisoAPasajeroDePuesto('cancelado', { salida: new Date() });
    expect(a.body).toMatch(/no se te cobró/);
  });

  it('al terminar invita a calificar', () => {
    expect(avisoAPasajeroDePuesto('terminado', { conductor: 'Steve', salida: new Date() }).body)
      .toMatch(/Califícalo/);
  });
});
