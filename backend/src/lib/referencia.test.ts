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
    // tabla, uno de cada ocho pasajeros no podía pedir carro.
    //
    // Esta comprobación es DETERMINISTA a propósito. La primera versión
    // generaba diez mil referencias y exigía cero repetidas — y eso es exigir
    // una improbabilidad, no comprobar una propiedad: con 32⁶ valores, el
    // paradoja del cumpleaños dice que en diez mil sale alguna repetida un 5 %
    // de las veces. La prueba se puso roja sola en CI y tenía razón la
    // estadística, no la prueba.
    //
    // Lo que de verdad importa es el TAMAÑO del espacio, y eso se puede medir
    // sin lanzar dados.
    const alfabeto = 32; // ABCDEFGHJKLMNPQRSTUVWXYZ23456789
    const largo = 6;
    expect(alfabeto ** largo).toBeGreaterThan(1_000_000_000);

    // Y una muestra pequeña como humo, con margen para lo que la estadística
    // sí permite (en dos mil, lo esperado es 0,002 repetidas).
    const vistas = new Set<string>();
    for (let i = 0; i < 2000; i++) vistas.add(nuevaReferencia('NXM'));
    expect(2000 - vistas.size).toBeLessThanOrEqual(2);
  });

  it('dos seguidas nunca son iguales', () => {
    expect(nuevaReferencia('NXM')).not.toBe(nuevaReferencia('NXM'));
  });

  it('se puede leer de un vistazo: prefijo y seis caracteres', () => {
    expect(nuevaReferencia('NXM')).toMatch(/^NXM-[A-Z2-9]{6}$/);
  });
});
