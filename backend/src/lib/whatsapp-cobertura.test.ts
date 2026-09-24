import { describe, it, expect } from 'vitest';
import { esFueraDeCobertura, textoFueraDeCobertura } from './whatsapp-cobertura';

describe('cobertura del punto que manda por WhatsApp', () => {
  it('un punto fuera de toda plaza se bloquea', () => {
    expect(esFueraDeCobertura(true, null)).toBe(true);
  });

  it('un punto dentro de una plaza pasa', () => {
    expect(esFueraDeCobertura(true, 'pamplona')).toBe(false);
  });

  it('SIN plazas cargadas no se bloquea a nadie', () => {
    // Falla abierto a propósito: la tabla vacía o un fallo al leerla deja el
    // resolutor devolviendo null para TODO el mundo, y bloquear con eso sería
    // dejar sin servicio a la ciudad entera por un problema nuestro.
    expect(esFueraDeCobertura(false, null)).toBe(false);
  });
});

describe('el mensaje de fuera de cobertura', () => {
  it('saluda por su nombre cuando Meta lo manda', () => {
    expect(textoFueraDeCobertura('Ana')).toContain('Ana');
  });

  it('y sin nombre no deja un hueco raro', () => {
    const t = textoFueraDeCobertura(null);
    expect(t.startsWith('Hola.')).toBe(true);
    expect(t).not.toContain('null');
  });
});
