import { describe, it, expect } from 'vitest';
import { CARACTERES_PROHIBIDOS, nuevaReferencia } from './referencia';

describe('nuevaReferencia', () => {
  it('lleva el prefijo del servicio', () => {
    expect(nuevaReferencia('NXM')).toMatch(/^NXM-/);
    expect(nuevaReferencia('NXE')).toMatch(/^NXE-/);
    expect(nuevaReferencia('NXI')).toMatch(/^NXI-/);
  });

  it('no usa caracteres que se confunden al dictarlos por teléfono', () => {
    // Se comprueba sobre muchas para que no dependa de la suerte de una.
    for (let i = 0; i < 2000; i++) {
      const sufijo = nuevaReferencia('NXM').slice(4);
      for (const c of CARACTERES_PROHIBIDOS) {
        expect(sufijo.includes(c)).toBe(false);
      }
    }
  });

  it('el espacio es lo bastante ancho para no chocar', () => {
    // La versión anterior tenía 8.000 valores posibles: con mil viajes en la
    // tabla, uno de cada ocho pasajeros no podía pedir carro. Diez mil
    // referencias seguidas sin un solo repetido es la prueba de que el espacio
    // ya no es el problema.
    const vistas = new Set<string>();
    for (let i = 0; i < 10000; i++) vistas.add(nuevaReferencia('NXM'));
    expect(vistas.size).toBe(10000);
  });

  it('dos seguidas nunca son iguales', () => {
    expect(nuevaReferencia('NXM')).not.toBe(nuevaReferencia('NXM'));
  });

  it('se puede leer de un vistazo: prefijo y seis caracteres', () => {
    expect(nuevaReferencia('NXM')).toMatch(/^NXM-[A-Z2-9]{6}$/);
  });
});
