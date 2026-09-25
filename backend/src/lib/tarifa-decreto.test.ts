import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  acotarAlSobre,
  configRecargos,
  domingoDePascua,
  esDomingoOFestivo,
  festivosDeColombia,
  recargosDeCarrera,
  sobreDelDecreto,
} from './tarifa-decreto';

const VARS = [
  'TAXI_CARRERA_MINIMA_COP',
  'TAXI_CARRERA_MAXIMA_COP',
  'TAXI_TARIFAS_SECTOR_COP',
  'TAXI_RECARGO_NOCTURNO_COP',
  'TAXI_RECARGO_NOCTURNO_DESDE',
  'TAXI_RECARGO_DOMINICAL_COP',
];
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) {
    original[v] = process.env[v];
    delete process.env[v];
  }
});
afterEach(() => {
  for (const v of VARS) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
});

/** Los valores reales del Decreto 049 de 2023 de Pamplona. */
function cargarPamplona() {
  process.env['TAXI_CARRERA_MINIMA_COP'] = '5000';
  process.env['TAXI_CARRERA_MAXIMA_COP'] = '9500';
  process.env['TAXI_RECARGO_NOCTURNO_COP'] = '1000';
  process.env['TAXI_RECARGO_DOMINICAL_COP'] = '1000';
  process.env['TAXI_TARIFAS_SECTOR_COP'] = '5000,5500,6000,7500,8500,9500';
}

describe('domingo de Pascua', () => {
  it('coincide con los años conocidos', () => {
    expect(domingoDePascua(2023)).toEqual({ mes: 4, dia: 9 });
    expect(domingoDePascua(2024)).toEqual({ mes: 3, dia: 31 });
    expect(domingoDePascua(2025)).toEqual({ mes: 4, dia: 20 });
    expect(domingoDePascua(2026)).toEqual({ mes: 4, dia: 5 });
  });
});

describe('festivos de Colombia', () => {
  it('los fijos NO se mueven aunque caigan entre semana', () => {
    // 1 de mayo de 2026 cae viernes y se queda donde está.
    expect(festivosDeColombia(2026).has('05-01')).toBe(true);
    expect(festivosDeColombia(2026).has('05-04')).toBe(false);
  });

  it('la Ley Emiliani corre los trasladables al lunes siguiente', () => {
    // Reyes 2026 cae martes 6 de enero ⇒ se celebra el lunes 12.
    const f = festivosDeColombia(2026);
    expect(f.has('01-06')).toBe(false);
    expect(f.has('01-12')).toBe(true);
  });

  it('Jueves y Viernes Santo se quedan donde caen', () => {
    // Pascua 2026 = 5 de abril ⇒ jueves 2 y viernes 3.
    const f = festivosDeColombia(2026);
    expect(f.has('04-02')).toBe(true);
    expect(f.has('04-03')).toBe(true);
  });

  it('cuadra CASILLA POR CASILLA con el calendario publicado de 2025', () => {
    // Contrastado contra la lista oficial. Es la comprobación que de verdad
    // vale: un recuento a secas pasaría con las fechas corridas.
    expect([...festivosDeColombia(2025)].sort()).toEqual([
      '01-01', '01-06', '03-24', '04-17', '04-18', '05-01', '06-02', '06-23',
      '06-30', '07-20', '08-07', '08-18', '10-13', '11-03', '11-17', '12-08',
      '12-25',
    ]);
  });

  it('dos festivos móviles que caen el mismo día cuentan UNA vez', () => {
    // 2025 es el caso: San Pedro y San Pablo (29 de junio, domingo) se corre al
    // lunes 30, que es justo el Sagrado Corazón. Por eso ese año Colombia tuvo
    // 17 festivos y no 18 — y por eso esto se comprobó contra el calendario
    // publicado en vez de dar 18 por sentado, que fue mi primera suposición.
    expect(festivosDeColombia(2025).size).toBe(17);
    expect(festivosDeColombia(2024).size).toBe(18);
    expect(festivosDeColombia(2026).size).toBe(18);
  });
});

describe('esDomingoOFestivo', () => {
  it('reconoce el domingo en HORA DE COLOMBIA, no en UTC', () => {
    // 2026-05-04T02:30:00Z son las 21:30 del DOMINGO 3 en Colombia. Leerlo en
    // UTC diría «lunes» y el pasajero del domingo por la noche no pagaría el
    // recargo que el decreto sí autoriza.
    expect(esDomingoOFestivo(new Date('2026-05-04T02:30:00Z'))).toBe(true);
    // Y a las 10 de la mañana del lunes ya no.
    expect(esDomingoOFestivo(new Date('2026-05-04T15:00:00Z'))).toBe(false);
  });

  it('un festivo entre semana cuenta igual que un domingo', () => {
    expect(esDomingoOFestivo(new Date('2026-05-01T15:00:00Z'))).toBe(true);
  });
});

describe('recargosDeCarrera', () => {
  it('sin recargos configurados NO inventa ninguno', () => {
    // Domingo a medianoche: el peor caso, y aun así cero.
    const r = recargosDeCarrera(new Date('2026-05-04T02:30:00Z'));
    expect(r.total).toBe(0);
    expect(r.lineas).toEqual([]);
  });

  it('el nocturno entra a las 21:00 de Colombia, ni un minuto antes', () => {
    cargarPamplona();
    // 2026-05-05T01:59Z = 20:59 del lunes 4 en Colombia.
    expect(recargosDeCarrera(new Date('2026-05-05T01:59:00Z')).total).toBe(0);
    // 2026-05-05T02:00Z = 21:00 clavadas.
    const r = recargosDeCarrera(new Date('2026-05-05T02:00:00Z'));
    expect(r.total).toBe(1000);
    expect(r.lineas[0]?.concepto).toContain('nocturno');
  });

  it('la madrugada NO lo lleva: el decreto solo dice desde cuándo empieza', () => {
    cargarPamplona();
    // Las 2 de la mañana del martes en Colombia.
    expect(recargosDeCarrera(new Date('2026-05-05T07:00:00Z')).total).toBe(0);
  });

  it('domingo de día: solo el dominical', () => {
    cargarPamplona();
    const r = recargosDeCarrera(new Date('2026-05-03T15:00:00Z'));
    expect(r.total).toBe(1000);
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]?.concepto).toContain('dominical');
  });

  it('domingo por la noche: LOS DOS se suman', () => {
    // El decreto dice que el nocturno es «todos los días», que sería
    // redundante si los domingos estuvieran excluidos.
    cargarPamplona();
    const r = recargosDeCarrera(new Date('2026-05-04T02:30:00Z'));
    expect(r.total).toBe(2000);
    expect(r.lineas).toHaveLength(2);
  });

  it('la hora de inicio se puede correr sin tocar código', () => {
    cargarPamplona();
    process.env['TAXI_RECARGO_NOCTURNO_DESDE'] = '19';
    // 2026-05-05T00:30Z = 19:30 del lunes 4.
    expect(recargosDeCarrera(new Date('2026-05-05T00:30:00Z'), configRecargos()).total)
      .toBe(1000);
  });
});

describe('sobre del decreto', () => {
  it('exige el par completo: con medio sobre no hay sobre', () => {
    process.env['TAXI_CARRERA_MINIMA_COP'] = '5000';
    expect(sobreDelDecreto()).toBeNull();
    delete process.env['TAXI_CARRERA_MINIMA_COP'];
    process.env['TAXI_CARRERA_MAXIMA_COP'] = '9500';
    expect(sobreDelDecreto()).toBeNull();
  });

  it('carga el rango y los escalones de Pamplona', () => {
    cargarPamplona();
    expect(sobreDelDecreto()).toEqual({
      minimo: 5000,
      maximo: 9500,
      escalones: [5000, 5500, 6000, 7500, 8500, 9500],
      kmTope: null,
    });
  });

  it('sin tabla de sectores quedan solo el mínimo y el máximo', () => {
    process.env['TAXI_CARRERA_MINIMA_COP'] = '5000';
    process.env['TAXI_CARRERA_MAXIMA_COP'] = '9500';
    expect(sobreDelDecreto()?.escalones).toEqual([5000, 9500]);
  });

  it('descarta basura y valores fuera del sobre', () => {
    process.env['TAXI_CARRERA_MINIMA_COP'] = '5000';
    process.env['TAXI_CARRERA_MAXIMA_COP'] = '9500';
    process.env['TAXI_TARIFAS_SECTOR_COP'] = '5500, ochomil, 99000, 6000, 100';
    expect(sobreDelDecreto()?.escalones).toEqual([5000, 5500, 6000, 9500]);
  });

  it('un rango al revés se ignora en vez de adivinar', () => {
    process.env['TAXI_CARRERA_MINIMA_COP'] = '9500';
    process.env['TAXI_CARRERA_MAXIMA_COP'] = '5000';
    expect(sobreDelDecreto()).toBeNull();
  });

  it('posa el precio en un escalón REAL de la tabla, bajando nunca subiendo', () => {
    cargarPamplona();
    const sobre = sobreDelDecreto();
    // $5.350 no existe en el decreto: la fila más cercana por debajo es 5.000.
    expect(acotarAlSobre(5350, sobre)).toBe(5000);
    // Y $7.400 baja a 6.000, no sube a 7.500: subir cobraría más de lo que la
    // estimación justifica, y en tarifa regulada ese es el error caro.
    expect(acotarAlSobre(7400, sobre)).toBe(6000);
    expect(acotarAlSobre(7500, sobre)).toBe(7500);
  });

  it('acota por arriba y por abajo', () => {
    const sobre = { minimo: 5000, maximo: 9500, escalones: [5000, 9500] };
    // La fórmula genérica cotizando una carrera urbana larga en $13.000:
    // ninguna fila de la tabla del decreto autoriza tanto.
    expect(acotarAlSobre(13000, sobre)).toBe(9500);
    // Y una corta por debajo de la carrera mínima.
    expect(acotarAlSobre(3200, sobre)).toBe(5000);
    // Con solo dos escalones declarados, $6.000 baja al mínimo: no hay ninguna
    // casilla intermedia que el municipio haya publicado.
    expect(acotarAlSobre(6000, sobre)).toBe(5000);
    expect(acotarAlSobre(9500, sobre)).toBe(9500);
  });

  it('sin sobre cargado el precio pasa intacto', () => {
    expect(acotarAlSobre(13000, null)).toBe(13000);
  });

  it('con el tamaño de la plaza declarado, el sobre se reparte por distancia', () => {
    // El caso que lo motivó: la pendiente genérica está calibrada para una
    // ciudad grande y a los 6 km ya saturaba el techo, así que en Pamplona
    // casi toda carrera se habría cotizado en el sector MÁS CARO.
    cargarPamplona();
    process.env['TAXI_KM_CARRERA_MAXIMA'] = '7';
    const sobre = sobreDelDecreto();
    expect(sobre?.kmTope).toBe(7);
    // Solo la carrera que cruza el municipio llega al escalón más caro.
    expect(acotarAlSobre(99_999, sobre, 7)).toBe(9500);
    expect(acotarAlSobre(99_999, sobre, 20)).toBe(9500);
    expect(acotarAlSobre(99_999, sobre, 2)).toBeLessThan(9500);

    // El precio que entra deja de mandar: lo que manda es la distancia. Es lo
    // que impide que la pendiente genérica sature el techo.
    expect(acotarAlSobre(1, sobre, 7)).toBe(9500);
    expect(acotarAlSobre(99_999, sobre, 0.5)).toBe(5000);

    // Monótono y siempre sobre una casilla que existe en el decreto: no se
    // fija a qué km cambia cada escalón porque eso depende de la geografía de
    // la plaza, y el operador lo calibra con `TAXI_KM_CARRERA_MAXIMA`.
    const escalones = sobre!.escalones;
    let previo = 0;
    for (const km of [0.5, 1, 2, 3, 4, 5, 6, 7, 10]) {
      const precio = acotarAlSobre(99_999, sobre, km);
      expect(escalones).toContain(precio);
      expect(precio).toBeGreaterThanOrEqual(previo);
      previo = precio;
    }
  });
});
