import { describe, it, expect } from 'vitest';
import { hitosDeConductor } from './hitos';

const claves = (servicios: number, km: number | null) =>
  hitosDeConductor(servicios, km).map((h) => h.clave);

describe('hitosDeConductor', () => {
  it('un conductor nuevo no tiene ninguno', () => {
    // Nada de premio por participar: un hito que se da solo no significa nada.
    expect(hitosDeConductor(0, null)).toEqual([]);
    expect(hitosDeConductor(3, 20)).toEqual([]);
  });

  it('SOLO el escalón más alto de cada familia', () => {
    // «10+, 25+, 100+» juntos es ruido: «100+ servicios» ya lo dice todo.
    expect(claves(150, null)).toEqual(['servicios_100']);
    expect(claves(1200, null)).toEqual(['servicios_1000']);
  });

  it('justo en el escalón cuenta', () => {
    expect(claves(10, null)).toEqual(['servicios_10']);
    expect(claves(9, null)).toEqual([]);
  });

  it('SIN KILÓMETROS MEDIDOS no hay hito de kilómetros', () => {
    // Los viajes anteriores a que el servidor midiera el trayecto tienen la
    // distancia en null. Estimarla sería inventar un dato en un perfil que
    // alguien lee para decidir si se sube a un carro.
    expect(claves(100, null)).toEqual(['servicios_100']);
  });

  it('cero kilómetros tampoco es un hito', () => {
    expect(claves(100, 0)).toEqual(['servicios_100']);
  });

  it('los kilómetros dan su propio hito', () => {
    expect(claves(100, 750)).toEqual(['servicios_100', 'km_500']);
  });

  it('escribe los miles con punto, como en Colombia', () => {
    const h = hitosDeConductor(1200, 6000);
    expect(h[0]!.etiqueta).toBe('1.000+ servicios');
    expect(h[1]!.etiqueta).toBe('5.000+ km recorridos');
  });

  it('nunca inventa un escalón por encima de lo alcanzado', () => {
    // La invariante: lo que se enseña es siempre menor o igual a lo real.
    for (const servicios of [0, 1, 9, 10, 24, 25, 99, 100, 499, 1500]) {
      for (const h of hitosDeConductor(servicios, null)) {
        const escalon = Number(h.clave.split('_')[1]);
        expect(escalon).toBeLessThanOrEqual(servicios);
      }
    }
  });

  it('un número negativo o roto no rompe nada', () => {
    expect(hitosDeConductor(-5, -100)).toEqual([]);
    expect(claves(10.9, 100.9)).toEqual(['servicios_10', 'km_100']);
  });
});
