import { describe, it, expect, afterEach } from 'vitest';
import {
  PUESTOS_MAX,
  PUESTOS_MIN,
  ahorroDelPasajero,
  motivoParaNoPublicarPuesto,
  precioDelPuesto,
  repartoDeCarrera,
  sugeridoPorPuesto,
  tarifaDeCarrera,
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

  it('ya NO pide precio: lo pone la plataforma', () => {
    // Antes esta guarda rechazaba el precio por encima del tope. Esas tres
    // pruebas se retiraron a propósito, no se perdieron: el precio dejó de
    // ser un dato que alguien escribe, así que no hay nada que rechazar. Lo
    // que lo vigila ahora es `precioDelPuesto`.
    expect(motivoParaNoPublicarPuesto(base())).toBeNull();
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

describe('el precio lo pone la plataforma', () => {
  it('reparte la carrera entre los puestos publicados', () => {
    // Lo que dijo el usuario: la carrera vale $8.000 y con cuatro arriba cada
    // uno paga $2.000 — menos que la buseta, que es el argumento del servicio.
    expect(precioDelPuesto(4)).toBe(2000);
    expect(precioDelPuesto(2)).toBe(4000);
  });

  it('redondea hacia ABAJO, para no cobrar más de lo anunciado', () => {
    // 8000 / 3 = 2666,67. Hacia arriba serían $2.700 × 3 = $8.100: cien pesos
    // más de la carrera publicada. Por cien pesos se discute a bordo, que es
    // justo lo que este servicio viene a evitar.
    expect(precioDelPuesto(3)).toBe(2650);
    expect(precioDelPuesto(3) * 3).toBeLessThanOrEqual(tarifaDeCarrera());
  });

  it('un puesto nunca cuesta más que la carrera entera', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(precioDelPuesto(n)).toBeLessThanOrEqual(tarifaDeCarrera());
    }
  });

  it('con un número de puestos imposible devuelve cero, no un precio inventado', () => {
    expect(precioDelPuesto(0)).toBe(0);
    expect(precioDelPuesto(-2)).toBe(0);
    expect(precioDelPuesto(2.5)).toBe(0);
  });
});

describe('tarifaDeCarrera', () => {
  const previo = process.env['PUESTO_URBANO_CARRERA_COP'];
  afterEach(() => {
    if (previo === undefined) delete process.env['PUESTO_URBANO_CARRERA_COP'];
    else process.env['PUESTO_URBANO_CARRERA_COP'] = previo;
  });

  it('sin configurar vale lo acordado', () => {
    delete process.env['PUESTO_URBANO_CARRERA_COP'];
    expect(tarifaDeCarrera()).toBe(8000);
  });

  it('se puede subir sin desplegar código', () => {
    process.env['PUESTO_URBANO_CARRERA_COP'] = '10000';
    expect(tarifaDeCarrera()).toBe(10000);
    expect(precioDelPuesto(4)).toBe(2500);
  });

  it('un valor inservible NO deja el puesto en cero', () => {
    // Un puesto a $0 se cobraría a $0 y nadie lo notaría hasta cerrar el mes.
    for (const malo of ['', 'gratis', '0', '-5000', '300']) {
      process.env['PUESTO_URBANO_CARRERA_COP'] = malo;
      expect(tarifaDeCarrera(), malo).toBe(8000);
    }
  });
});

describe('repartoDeCarrera', () => {
  it('con el carro lleno son los $6.000 y $2.000 acordados', () => {
    expect(repartoDeCarrera(8000)).toEqual({ neto: 6000, comision: 2000 });
  });

  it('si el carro NO se llena, la app se lleva su cuarta parte de lo que entró', () => {
    // Ésta es la razón de que sea tasa y no $2.000 fijos: con dos pasajeros se
    // recaudan $4.000, y $2.000 fijos serían la mitad — el conductor ganaría
    // lo mismo que la app por manejar.
    expect(repartoDeCarrera(4000)).toEqual({ neto: 3000, comision: 1000 });
    expect(repartoDeCarrera(2000)).toEqual({ neto: 1500, comision: 500 });
  });

  it('lo que se reparte siempre suma lo recaudado', () => {
    // Si no sumara, la diferencia sería plata que no es de nadie y que nadie
    // echaría de menos hasta cuadrar el mes.
    for (const bruto of [8000, 7950, 4000, 2650, 1]) {
      const r = repartoDeCarrera(bruto);
      expect(r.neto + r.comision, String(bruto)).toBe(Math.round(bruto));
    }
  });

  it('sin recaudo no hay nada que repartir', () => {
    expect(repartoDeCarrera(0)).toEqual({ neto: 0, comision: 0 });
    expect(repartoDeCarrera(-100)).toEqual({ neto: 0, comision: 0 });
  });
});
