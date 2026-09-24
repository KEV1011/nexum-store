import { describe, it, expect } from 'vitest';
import {
  PUESTOS_MAX,
  PUESTOS_MIN,
  ahorroDelPasajero,
  motivoParaNoPublicarPuesto,
  sugeridoPorPuesto,
  topePorPuesto,
  type PublicacionDePuesto,
} from './puesto-urbano';

/** Una publicación válida a la que cada prueba le rompe una sola cosa. */
function base(cambios: Partial<PublicacionDePuesto> = {}): PublicacionDePuesto {
  return {
    ciudadOrigen: 'pamplona',
    ciudadDestino: 'pamplona',
    origenTexto: 'Terminal de transportes',
    destinoTexto: 'Universidad de Pamplona',
    puestos: 4,
    tarifaPorPuesto: 2000,
    tarifaSolo: 6000,
    ...cambios,
  };
}

describe('topePorPuesto', () => {
  it('reparte una vez y media la carrera entre los puestos', () => {
    // 6000 × 1,5 = 9000 entre 4 = 2250.
    expect(topePorPuesto(6000, 4)).toBe(2250);
    expect(topePorPuesto(6000, 3)).toBe(3000);
    expect(topePorPuesto(6000, 2)).toBe(4500);
  });

  it('redondea a $50 hacia abajo: el efectivo no tiene monedas de $7', () => {
    // 5300 × 1,5 = 7950 entre 4 = 1987,5 → 1950.
    expect(topePorPuesto(5300, 4)).toBe(1950);
    expect(topePorPuesto(5300, 4) % 50).toBe(0);
  });

  it('un puesto SIEMPRE cuesta menos que el carro entero', () => {
    // Es la consecuencia que importa: con el mínimo de dos sillas el tope ya
    // es tres cuartos de la carrera. Si esto dejara de cumplirse, compartir
    // sería más caro que ir solo.
    for (const solo of [4000, 6000, 12500, 30000]) {
      for (let puestos = PUESTOS_MIN; puestos <= PUESTOS_MAX; puestos++) {
        expect(topePorPuesto(solo, puestos)).toBeLessThan(solo);
      }
    }
  });

  it('sin carrera medida devuelve cero en vez de un techo inventado', () => {
    expect(topePorPuesto(0, 4)).toBe(0);
    expect(topePorPuesto(Number.NaN, 4)).toBe(0);
    expect(topePorPuesto(-6000, 4)).toBe(0);
    expect(topePorPuesto(6000, 0)).toBe(0);
  });
});

describe('sugeridoPorPuesto', () => {
  it('propone por debajo del tope, no en el tope', () => {
    const sugerido = sugeridoPorPuesto(6000, 4);
    expect(sugerido).toBeLessThan(topePorPuesto(6000, 4));
    expect(sugerido % 50).toBe(0);
  });

  it('nunca se pasa del tope', () => {
    for (const solo of [3000, 6000, 20000]) {
      for (let p = PUESTOS_MIN; p <= PUESTOS_MAX; p++) {
        expect(sugeridoPorPuesto(solo, p)).toBeLessThanOrEqual(topePorPuesto(solo, p));
      }
    }
  });
});

describe('motivoParaNoPublicarPuesto', () => {
  it('deja publicar el caso real: cuatro puestos a $2.000 sobre una carrera de $6.000', () => {
    expect(motivoParaNoPublicarPuesto(base())).toBeNull();
  });

  it('RECHAZA otra ciudad: es la puerta de atrás al intermunicipal', () => {
    // Sin esto, «urbano» sería la forma de correr una troncal saltándose la
    // ruta, el tope de gasto compartido y la exigencia de habilitación.
    const motivo = motivoParaNoPublicarPuesto(base({ ciudadDestino: 'cucuta' }));
    expect(motivo).toContain('misma ciudad');
    expect(motivo).toContain('intermunicipal');
  });

  it('no le importa cómo venga escrita la ciudad', () => {
    expect(
      motivoParaNoPublicarPuesto(base({ ciudadOrigen: ' Pamplona ', ciudadDestino: 'pamplona' })),
    ).toBeNull();
  });

  it('rechaza un solo puesto: eso es una carrera, no compartir', () => {
    const motivo = motivoParaNoPublicarPuesto(base({ puestos: 1 }));
    expect(motivo).toContain('al menos 2');
  });

  it('rechaza más puestos de los que caben en un taxi', () => {
    const motivo = motivoParaNoPublicarPuesto(base({ puestos: 5 }));
    expect(motivo).toContain('habilitada');
  });

  it('rechaza el puesto por encima del tope DICIENDO el número', () => {
    // Que diga la cifra es la mitad del arreglo: el conductor corrige en vez
    // de probar a ciegas.
    const motivo = motivoParaNoPublicarPuesto(base({ tarifaPorPuesto: 3000 }));
    expect(motivo).toContain('2.250');
    expect(motivo).toContain('6.000');
  });

  it('acepta exactamente el tope', () => {
    expect(motivoParaNoPublicarPuesto(base({ tarifaPorPuesto: 2250 }))).toBeNull();
  });

  it('rechaza sin precio y sin carrera de referencia', () => {
    expect(motivoParaNoPublicarPuesto(base({ tarifaPorPuesto: 0 }))).toContain('cuánto cuesta');
    expect(motivoParaNoPublicarPuesto(base({ tarifaSolo: 0 }))).toContain('No pudimos calcular');
  });

  it('exige los dos extremos y que sean distintos', () => {
    expect(motivoParaNoPublicarPuesto(base({ origenTexto: '  ' }))).toContain('de dónde sale');
    expect(motivoParaNoPublicarPuesto(base({ destinoTexto: '' }))).toContain('a dónde llega');
    expect(
      motivoParaNoPublicarPuesto(base({ destinoTexto: 'terminal de TRANSPORTES' })),
    ).toContain('no pueden ser el mismo');
  });

  it('exige ciudad', () => {
    expect(motivoParaNoPublicarPuesto(base({ ciudadOrigen: '', ciudadDestino: '' })))
      .toContain('Falta la ciudad');
  });
});

describe('ahorroDelPasajero', () => {
  it('dice cuánto se ahorra frente a ir solo', () => {
    expect(ahorroDelPasajero(6000, 2000)).toBe(4000);
  });

  it('nunca enseña un ahorro negativo como si fuera un descuento', () => {
    expect(ahorroDelPasajero(2000, 6000)).toBe(0);
    expect(ahorroDelPasajero(0, 2000)).toBe(0);
  });
});
