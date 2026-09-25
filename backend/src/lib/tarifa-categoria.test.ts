import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  tablaTarifas,
  tarifaDe,
  tarifaTaxiDelDecreto,
  modoTarifaTaxi,
  categoriaDeServicio,
  precioCategoria,
  marcarMasBarata,
} from './tarifa-categoria';

const CLAVES = [
  'TAXI_BANDERAZO_COP',
  'TAXI_POR_KM_COP',
  'TAXI_POR_MIN_COP',
  'TAXI_CARRERA_MINIMA_COP',
];

function limpiarEnv(): void {
  for (const k of CLAVES) delete process.env[k];
}

function cargarDecreto(v: Partial<Record<string, string>> = {}): void {
  process.env['TAXI_BANDERAZO_COP'] = v['TAXI_BANDERAZO_COP'] ?? '4800';
  process.env['TAXI_POR_KM_COP'] = v['TAXI_POR_KM_COP'] ?? '1200';
  process.env['TAXI_CARRERA_MINIMA_COP'] = v['TAXI_CARRERA_MINIMA_COP'] ?? '7000';
  if (v['TAXI_POR_MIN_COP'] != null) process.env['TAXI_POR_MIN_COP'] = v['TAXI_POR_MIN_COP'];
}

afterEach(limpiarEnv);

describe('tarifa del taxi cargada desde el decreto', () => {
  it('sin variables de entorno no hay decreto y el modo lo dice', () => {
    limpiarEnv();
    expect(tarifaTaxiDelDecreto()).toBeNull();
    expect(modoTarifaTaxi()).toBe('generica');
    expect(tablaTarifas().TAXI.regulada).toBe(false);
  });

  it('con el juego completo cargado, la tarifa es la del decreto', () => {
    cargarDecreto();
    const taxi = tablaTarifas().TAXI;
    expect(taxi.banderazo).toBe(4800);
    expect(taxi.porKm).toBe(1200);
    expect(taxi.minimo).toBe(7000);
    expect(taxi.regulada).toBe(true);
    expect(modoTarifaTaxi()).toBe('decreto-por-km');
  });

  it('sin decreto NO se dice «tarifa autorizada» al pasajero', () => {
    // Es la afirmación que hace legal al servicio. Decirla mientras el precio
    // lo pone nuestra tabla genérica es exactamente lo contrario de lo que
    // dice: el número no es el oficial del municipio.
    delete process.env['TAXI_BANDERAZO_COP'];
    delete process.env['TAXI_POR_KM_COP'];
    delete process.env['TAXI_CARRERA_MINIMA_COP'];
    expect(tablaTarifas().TAXI.descripcion).not.toMatch(/autorizada/i);
  });

  it('con el decreto cargado sí se dice', () => {
    process.env['TAXI_BANDERAZO_COP'] = '4200';
    process.env['TAXI_POR_KM_COP'] = '1800';
    process.env['TAXI_CARRERA_MINIMA_COP'] = '7000';
    expect(tablaTarifas().TAXI.descripcion).toMatch(/autorizada/i);
  });

  it('media tarifa cargada NO cuenta como decreto', () => {
    // Cargar solo el banderazo del decreto y dejar el resto genérico produce un
    // número que no es ni el oficial ni el nuestro. Se exige el juego completo.
    limpiarEnv();
    process.env['TAXI_BANDERAZO_COP'] = '4800';
    expect(tarifaTaxiDelDecreto()).toBeNull();
    expect(tablaTarifas().TAXI.regulada).toBe(false);
  });

  it('un valor ilegible se ignora en vez de dejar la tarifa en NaN', () => {
    cargarDecreto({ TAXI_POR_KM_COP: 'mil doscientos' });
    expect(tarifaTaxiDelDecreto()).toBeNull();
    expect(Number.isFinite(tablaTarifas().TAXI.porKm)).toBe(true);
  });

  it('el precio por minuto es opcional: hay decretos que solo tarifan distancia', () => {
    cargarDecreto();
    expect(tarifaTaxiDelDecreto()?.porMin).toBe(0);
  });
});

describe('la tarifa regulada no admite multiplicador por demanda', () => {
  it('el taxi cobra igual con surge 2×', () => {
    cargarDecreto();
    const taxi = tablaTarifas().TAXI;
    const tranquilo = precioCategoria(taxi, 5, 15, 1);
    const enHoraPico = precioCategoria(taxi, 5, 15, 2);
    expect(enHoraPico.fare).toBe(tranquilo.fare);
    expect(enHoraPico.surgeAplicado).toBe(1);
  });

  it('el particular sí lo admite', () => {
    const p = tablaTarifas().PARTICULAR;
    const tranquilo = precioCategoria(p, 5, 15, 1);
    const pico = precioCategoria(p, 5, 15, 1.5);
    expect(pico.fare).toBeGreaterThan(tranquilo.fare);
    expect(pico.surgeAplicado).toBe(1.5);
  });

  it('un surge por debajo de 1 nunca abarata la carrera', () => {
    const p = tablaTarifas().PARTICULAR;
    expect(precioCategoria(p, 5, 15, 0.5).fare).toBe(precioCategoria(p, 5, 15, 1).fare);
  });
});

describe('cálculo del precio', () => {
  it('la carrera mínima es un piso', () => {
    cargarDecreto();
    const taxi = tablaTarifas().TAXI;
    // 300 m y 2 min: la fórmula daría menos que el mínimo del decreto.
    expect(precioCategoria(taxi, 0.3, 2).fare).toBe(7000);
  });

  it('el total se redondea al múltiplo de 50 (no hay monedas de $7)', () => {
    cargarDecreto({ TAXI_BANDERAZO_COP: '4837', TAXI_POR_KM_COP: '1207' });
    const precio = precioCategoria(tablaTarifas().TAXI, 3.3, 0);
    expect(precio.fare % 50).toBe(0);
  });

  it('la moto es más barata que el carro en el mismo trayecto', () => {
    const t = tablaTarifas();
    expect(precioCategoria(t.MOTO, 6, 18).fare)
      .toBeLessThan(precioCategoria(t.PARTICULAR, 6, 18).fare);
  });

  it('distancia o tiempo ausentes no revientan: cobra el mínimo', () => {
    const t = tablaTarifas();
    expect(precioCategoria(t.PARTICULAR, NaN, NaN).fare).toBeGreaterThanOrEqual(t.PARTICULAR.minimo);
    expect(precioCategoria(t.PARTICULAR, -5, -3).fare).toBeGreaterThanOrEqual(t.PARTICULAR.minimo);
  });
});

describe('la más barata solo se marca si hay con qué comparar', () => {
  it('con una sola opción no se marca nada', () => {
    const r = marcarMasBarata([{ fare: 9000 }]);
    expect(r[0]!.cheapest).toBe(false);
  });

  it('con varias, marca la de menor precio', () => {
    const r = marcarMasBarata([{ fare: 12000 }, { fare: 7000 }, { fare: 9000 }]);
    expect(r.map((o) => o.cheapest)).toEqual([false, true, false]);
  });

  it('en empate no se marca ninguna', () => {
    const r = marcarMasBarata([{ fare: 9000 }, { fare: 9000 }]);
    expect(r.every((o) => o.cheapest === false)).toBe(true);
  });
});

describe('correspondencia categoría ↔ servicio', () => {
  it('mapea los tres servicios de pasajero', () => {
    expect(categoriaDeServicio('TAXI')).toBe('TAXI');
    expect(categoriaDeServicio('moto')).toBe('MOTO');
    expect(categoriaDeServicio('PARTICULAR')).toBe('PARTICULAR');
  });

  it('envíos y mandados no son categorías de pasajero', () => {
    expect(categoriaDeServicio('ENVIOS')).toBeNull();
    expect(categoriaDeServicio('MANDADO')).toBeNull();
    expect(categoriaDeServicio(null)).toBeNull();
  });

  it('cada categoría pide su propio tipo de vehículo', () => {
    const t = tablaTarifas();
    expect(t.TAXI.tiposVehiculo).toEqual(['TAXI']);
    expect(t.MOTO.tiposVehiculo).toEqual(['MOTO']);
    // Un pasajero que pide taxi no puede acabar en un particular: la empresa
    // que se presenta es de taxis y esa distinción es su razón de ser.
    expect(t.TAXI.tiposVehiculo).not.toContain('PARTICULAR');
  });

  it('tarifaDe acepta el nombre en cualquier caja y rechaza lo desconocido', () => {
    expect(tarifaDe('taxi')?.categoria).toBe('TAXI');
    expect(tarifaDe('helicoptero')).toBeNull();
    expect(tarifaDe(null)).toBeNull();
  });
});

describe('decretos que tarifan por SECTORES y no por kilómetro', () => {
  // El de Pamplona (049 de 2023) es así: no tiene banderazo ni valor por km,
  // solo una tabla de barrios con precios fijos, la carrera mínima y dos
  // recargos. Con el modelo anterior esa tarifa NO se podía cargar y el taxi
  // se cotizaba con la fórmula genérica, o sea con un precio de Nexum.
  const VARS_SOBRE = ['TAXI_CARRERA_MINIMA_COP', 'TAXI_CARRERA_MAXIMA_COP'];
  const previo: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const v of VARS_SOBRE) { previo[v] = process.env[v]; delete process.env[v]; }
    delete process.env['TAXI_BANDERAZO_COP'];
    delete process.env['TAXI_POR_KM_COP'];
  });
  afterEach(() => {
    for (const v of VARS_SOBRE) {
      if (previo[v] === undefined) delete process.env[v];
      else process.env[v] = previo[v];
    }
  });

  function pamplona() {
    process.env['TAXI_CARRERA_MINIMA_COP'] = '5000';
    process.env['TAXI_CARRERA_MAXIMA_COP'] = '9500';
  }

  it('se reconoce como tarifa del decreto, no como genérica', () => {
    pamplona();
    expect(modoTarifaTaxi()).toBe('decreto-por-zonas');
    expect(tablaTarifas().TAXI.regulada).toBe(true);
  });

  it('el precio no puede pasar de la fila más cara de la tabla', () => {
    pamplona();
    const taxi = tablaTarifas().TAXI;
    // Un trayecto urbano largo que la fórmula genérica cotizaría muy por
    // encima de lo que autoriza cualquier sector.
    expect(precioCategoria(taxi, 25, 50).fare).toBe(9500);
  });

  it('ni bajar de la carrera mínima', () => {
    pamplona();
    expect(precioCategoria(tablaTarifas().TAXI, 0.3, 2).fare).toBe(5000);
  });

  it('los recargos van POR ENCIMA del techo, no dentro', () => {
    pamplona();
    const taxi = tablaTarifas().TAXI;
    // Carrera tope + recargo nocturno + dominical.
    const r = precioCategoria(taxi, 25, 50, 1, 2000);
    expect(r.fare).toBe(11500);
    expect(r.recargos).toBe(2000);
  });

  it('sin el par completo se sigue cayendo a la genérica', () => {
    process.env['TAXI_CARRERA_MINIMA_COP'] = '5000';
    expect(modoTarifaTaxi()).toBe('generica');
  });
});
