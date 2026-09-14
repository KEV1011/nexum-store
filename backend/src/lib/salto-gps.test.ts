import { describe, it, expect } from 'vitest';
import {
  esSaltoImposible,
  segundosEntreLecturas,
  velocidadKmh,
  MOVIMIENTO_MIN_M,
  VELOCIDAD_MAX_KMH,
  type Fix,
} from './salto-gps';

// El caso que motiva todo esto: un conductor con 444 marcas de fraude y 16
// viajes. Nadie teletransporta un Picanto 444 veces; lo que fallaba era la
// medición.

const AHORA = Date.parse('2026-09-14T15:00:00.000Z');
const fix = (tomadoEn: number | null): Fix => ({ lat: 0, lng: 0, tomadoEn });

describe('segundosEntreLecturas', () => {
  it('usa el reloj del TELÉFONO cuando manda las marcas', () => {
    // Cuatro segundos entre lecturas, aunque los mensajes llegaran pegados.
    const s = segundosEntreLecturas(
      fix(AHORA - 4000), fix(AHORA), AHORA, 0.3,
    );
    expect(s).toBe(4);
  });

  it('cae al reloj del servidor si la app no manda marca', () => {
    // Las apps ya instaladas no la mandan: tienen que seguir funcionando.
    expect(segundosEntreLecturas(fix(null), fix(null), AHORA, 4)).toBe(4);
  });

  it('descarta una marca del futuro', () => {
    // Un teléfono con el reloj adelantado daría huecos enormes o negativos.
    const s = segundosEntreLecturas(
      fix(AHORA), fix(AHORA + 600_000), AHORA, 4,
    );
    expect(s).toBe(4);
  });

  it('descarta una lectura rancia que estuvo en cola', () => {
    const s = segundosEntreLecturas(
      fix(AHORA - 3_600_000), fix(AHORA - 1_800_000), AHORA, 4,
    );
    expect(s).toBe(4);
  });

  it('descarta marcas en orden inverso', () => {
    expect(segundosEntreLecturas(fix(AHORA), fix(AHORA - 5000), AHORA, 4)).toBe(4);
  });

  it('un hueco por debajo de un segundo NO se cree', () => {
    // Ni por reloj del teléfono ni por el del servidor. Dos lecturas del mismo
    // segundo no miden velocidad, miden el redondeo del reloj — y es
    // exactamente el caso que inflaba el contador.
    expect(segundosEntreLecturas(fix(AHORA - 300), fix(AHORA), AHORA, 0.3)).toBeNull();
    expect(segundosEntreLecturas(fix(null), fix(null), AHORA, 0.2)).toBeNull();
  });
});

describe('esSaltoImposible', () => {
  it('el ruido en reposo nunca se marca', () => {
    expect(esSaltoImposible(MOVIMIENTO_MIN_M - 1, 0.001)).toBe(false);
  });

  it('sin tiempo creíble no se marca nada', () => {
    // «No sé» no es «culpable». Preferimos dejar pasar un salto a marcar a
    // alguien con una cuenta que no se sostiene.
    expect(esSaltoImposible(50_000, null)).toBe(false);
    expect(esSaltoImposible(50_000, 0)).toBe(false);
    expect(esSaltoImposible(50_000, -3)).toBe(false);
  });

  it('un teletransporte de verdad sí se marca', () => {
    // 10 km en 5 segundos = 7.200 km/h.
    expect(esSaltoImposible(10_000, 5)).toBe(true);
  });

  it('el límite es estricto, no inclusivo', () => {
    const metros = (VELOCIDAD_MAX_KMH / 3.6) * 10; // justo el máximo en 10 s
    expect(velocidadKmh(metros, 10)).toBeCloseTo(VELOCIDAD_MAX_KMH, 6);
    expect(esSaltoImposible(metros, 10)).toBe(false);
    expect(esSaltoImposible(metros * 1.01, 10)).toBe(true);
  });
});

describe('conducción normal, con la red portándose mal', () => {
  // Estos son los que habrían cazado el fallo. Cada caso es un conductor real
  // haciendo su trabajo; ninguno puede acabar marcado.

  const casos: Array<{ nombre: string; kmh: number; segundosEntreFixes: number }> = [
    { nombre: 'ciudad, 40 km/h', kmh: 40, segundosEntreFixes: 4 },
    { nombre: 'avenida, 80 km/h', kmh: 80, segundosEntreFixes: 4 },
    { nombre: 'vía a Cúcuta, 120 km/h', kmh: 120, segundosEntreFixes: 4 },
    { nombre: 'intermunicipal con latido lento', kmh: 100, segundosEntreFixes: 12 },
  ];

  for (const c of casos) {
    it(`${c.nombre}: no se marca aunque los mensajes lleguen pegados`, () => {
      const metros = (c.kmh / 3.6) * c.segundosEntreFixes;
      const anterior = fix(AHORA - c.segundosEntreFixes * 1000);
      const nueva = fix(AHORA);

      // La red entrega los dos mensajes con 0,2 s de diferencia: el reloj del
      // servidor mediría una velocidad absurda.
      const segundos = segundosEntreLecturas(anterior, nueva, AHORA, 0.2);
      expect(esSaltoImposible(metros, segundos)).toBe(false);

      // Y esto es lo que pasaba ANTES, sin marcas de tiempo: la prueba lo deja
      // escrito para que se vea por qué el contador llegó a 444.
      if (metros >= MOVIMIENTO_MIN_M) {
        expect(velocidadKmh(metros, 0.2)).toBeGreaterThan(VELOCIDAD_MAX_KMH);
      }
    });
  }

  it('a 120 km/h la distancia YA supera el umbral: por eso el reloj importa', () => {
    // Si no lo superara, el fallo de medición no habría tenido consecuencias.
    // Este es el dato que convierte un detalle en un problema.
    const metros = (120 / 3.6) * 4;
    expect(metros).toBeGreaterThan(MOVIMIENTO_MIN_M);
  });
});
