import { describe, it, expect } from 'vitest';
import {
  MUESTRA_MINIMA_PICO,
  bucketsPorHora,
  diaColombiaDe,
  etiquetaHora,
  horaColombiaDe,
  horaPico,
  motivoLegible,
  serviciosPorDiaActivo,
  tasaCancelacion,
} from './analitica-operacion';

/** Un instante UTC cómodo de leer. */
const utc = (iso: string) => new Date(iso);

describe('horaColombiaDe', () => {
  it('resta las cinco horas', () => {
    // 11:00 UTC son las 06:00 en Pamplona: la hora punta de los estudiantes.
    expect(horaColombiaDe(utc('2026-09-24T11:00:00.000Z'))).toBe(6);
  });

  it('cruza al día anterior en la madrugada UTC', () => {
    // Éste es el que rompe un tablero: leído en UTC, un servicio de las 9 de
    // la noche del lunes se contaría a las 2 de la madrugada del martes, y el
    // turno de noche parecería no existir.
    expect(horaColombiaDe(utc('2026-09-25T02:00:00.000Z'))).toBe(21);
  });

  it('medianoche de Colombia es la hora cero, no las cinco', () => {
    expect(horaColombiaDe(utc('2026-09-25T05:00:00.000Z'))).toBe(0);
  });
});

describe('diaColombiaDe', () => {
  it('un servicio de las 9 p. m. pertenece a ESE día, no al siguiente', () => {
    expect(diaColombiaDe(utc('2026-09-25T02:00:00.000Z'))).toBe('2026-09-24');
  });

  it('un servicio de mediodía cae en su propio día', () => {
    expect(diaColombiaDe(utc('2026-09-24T17:00:00.000Z'))).toBe('2026-09-24');
  });
});

describe('tasaCancelacion', () => {
  it('reparte sobre el total terminado', () => {
    expect(tasaCancelacion(8, 2)).toBe(20);
  });

  it('un decimal, sin arrastrar cifras que no se pueden defender', () => {
    expect(tasaCancelacion(2, 1)).toBe(33.3);
  });

  it('sin denominador devuelve null, no cero', () => {
    // Un «0 % de cancelación» para quien no cerró ni un servicio es una
    // felicitación falsa, y es la que más fácil se cuela en un tablero.
    expect(tasaCancelacion(0, 0)).toBeNull();
  });

  it('todo cancelado es el 100 %', () => {
    expect(tasaCancelacion(0, 5)).toBe(100);
  });

  it('nada cancelado es un cero honesto: hubo denominador', () => {
    expect(tasaCancelacion(7, 0)).toBe(0);
  });
});

describe('bucketsPorHora', () => {
  it('siempre devuelve las veinticuatro, incluidas las vacías', () => {
    const b = bucketsPorHora([6, 6, 18]);
    expect(b).toHaveLength(24);
    expect(b[6]).toEqual({ hora: 6, servicios: 2 });
    expect(b[18]).toEqual({ hora: 18, servicios: 1 });
    // La madrugada en blanco es la respuesta a «¿monto turno de noche?».
    expect(b[3]).toEqual({ hora: 3, servicios: 0 });
  });

  it('ignora lo que no es una hora del día', () => {
    const b = bucketsPorHora([-1, 24, 7.5, NaN, 7]);
    expect(b.reduce((s, x) => s + x.servicios, 0)).toBe(1);
    expect(b[7]!.servicios).toBe(1);
  });

  it('sin datos da veinticuatro ceros', () => {
    expect(bucketsPorHora([]).every((b) => b.servicios === 0)).toBe(true);
  });
});

describe('horaPico', () => {
  /** `n` servicios a la hora `h`. */
  const aLas = (h: number, n: number) => Array<number>(n).fill(h);

  it('señala la hora más alta con muestra suficiente', () => {
    const horas = [...aLas(6, 15), ...aLas(12, 8)];
    expect(horas.length).toBeGreaterThanOrEqual(MUESTRA_MINIMA_PICO);
    expect(horaPico(bucketsPorHora(horas))).toBe(6);
  });

  it('con muestra corta se calla aunque haya una hora destacada', () => {
    const horas = [...aLas(6, 4), ...aLas(12, 1)];
    expect(horaPico(bucketsPorHora(horas))).toBeNull();
  });

  it('justo en el mínimo ya se puede afirmar', () => {
    const horas = [...aLas(6, MUESTRA_MINIMA_PICO - 1), 12];
    expect(horaPico(bucketsPorHora(horas))).toBe(6);
  });

  it('en empate no hay «una» hora pico', () => {
    // Elegir la primera sería nombrar ganador por el orden del reloj.
    const horas = [...aLas(6, 12), ...aLas(18, 12)];
    expect(horaPico(bucketsPorHora(horas))).toBeNull();
  });

  it('sin servicios no hay pico', () => {
    expect(horaPico(bucketsPorHora([]))).toBeNull();
  });
});

describe('serviciosPorDiaActivo', () => {
  it('distingue al que trabajó dos días del que trabajó veinte', () => {
    expect(serviciosPorDiaActivo(40, 2)).toBe(20);
    expect(serviciosPorDiaActivo(40, 20)).toBe(2);
  });

  it('un decimal', () => {
    expect(serviciosPorDiaActivo(7, 3)).toBe(2.3);
  });

  it('sin días trabajados no se divide', () => {
    expect(serviciosPorDiaActivo(0, 0)).toBeNull();
  });
});

describe('motivoLegible', () => {
  it('traduce los códigos del sistema', () => {
    expect(motivoLegible('CANCELLED_BY_PASSENGER')).toBe('El pasajero canceló');
  });

  it('un motivo escrito a mano por el admin se muestra tal cual', () => {
    // Meterlo en «Otro» escondería justo el caso que alguien querría leer.
    expect(motivoLegible('Vehículo accidentado en la vía')).toBe('Vehículo accidentado en la vía');
  });

  it('sin motivo lo dice en vez de dejar un hueco', () => {
    expect(motivoLegible(null)).toBe('Sin motivo registrado');
  });
});

describe('etiquetaHora', () => {
  it('rellena con cero a la izquierda', () => {
    expect(etiquetaHora(6)).toBe('06:00');
    expect(etiquetaHora(18)).toBe('18:00');
    expect(etiquetaHora(0)).toBe('00:00');
  });
});
