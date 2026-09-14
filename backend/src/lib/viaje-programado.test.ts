import { describe, it, expect } from 'vitest';
import {
  ANTELACION_MIN,
  MAXIMO_DIAS,
  MINIMO_ANTELACION_MIN,
  ProgramacionError,
  planificar,
  tocaBuscar,
} from './viaje-programado';

const AHORA = new Date('2026-09-10T12:00:00Z');
const enMin = (m: number) => new Date(AHORA.getTime() + m * 60_000);

describe('planificar', () => {
  it('SE EMPIEZA A BUSCAR ANTES DE LA HORA, no a la hora', () => {
    // Si se buscara a las 8:00 para un viaje de las 8:00, el conductor
    // aceptaría a las 8:01 y llegaría a las 8:10: la reserva no habría
    // servido de nada.
    const { para, buscarDesde } = planificar(enMin(120), AHORA);
    const minutosAntes = (para.getTime() - buscarDesde.getTime()) / 60_000;
    expect(minutosAntes).toBe(ANTELACION_MIN);
  });

  it('rechaza una hora que ya pasó', () => {
    expect(() => planificar(enMin(-10), AHORA)).toThrow(ProgramacionError);
  });

  it('rechaza «dentro de un rato»: para eso está pedir ahora', () => {
    expect(() => planificar(enMin(5), AHORA)).toThrow(ProgramacionError);
    expect(() => planificar(enMin(MINIMO_ANTELACION_MIN - 1), AHORA)).toThrow();
  });

  it('el mensaje dice el mínimo, para que se pueda corregir', () => {
    try {
      planificar(enMin(5), AHORA);
      throw new Error('debería haber fallado');
    } catch (e) {
      expect((e as Error).message).toContain(String(MINIMO_ANTELACION_MIN));
    }
  });

  it('justo en el mínimo se acepta', () => {
    expect(() => planificar(enMin(MINIMO_ANTELACION_MIN), AHORA)).not.toThrow();
  });

  it('LA BÚSQUEDA NUNCA CAE EN EL PASADO', () => {
    // La invariante que sostiene el mínimo: si se pudiera programar más cerca
    // que la antelación, el barrido tendría que haber arrancado hace rato.
    for (const m of [MINIMO_ANTELACION_MIN, 60, 1440, MAXIMO_DIAS * 1440]) {
      const { buscarDesde } = planificar(enMin(m), AHORA);
      expect(buscarDesde.getTime()).toBeGreaterThanOrEqual(AHORA.getTime());
    }
    expect(MINIMO_ANTELACION_MIN).toBeGreaterThan(ANTELACION_MIN);
  });

  it('rechaza más allá del horizonte', () => {
    expect(() => planificar(enMin(MAXIMO_DIAS * 1440 + 60), AHORA)).toThrow(
      ProgramacionError,
    );
  });

  it('redondea al minuto: los segundos no aportan nada', () => {
    const conSegundos = new Date('2026-09-10T14:33:47.500Z');
    const { para } = planificar(conSegundos, AHORA);
    expect(para.getSeconds()).toBe(0);
    expect(para.getMilliseconds()).toBe(0);
  });

  it('una fecha que no se entiende no revienta, se explica', () => {
    expect(() => planificar(new Date('no soy una fecha'), AHORA)).toThrow(
      ProgramacionError,
    );
  });
});

describe('tocaBuscar', () => {
  it('todavía no', () => {
    expect(tocaBuscar(enMin(5), AHORA)).toBe(false);
  });

  it('justo ahora sí', () => {
    expect(tocaBuscar(AHORA, AHORA)).toBe(true);
  });

  it('y si el barrido llegó tarde, también', () => {
    // Un redespliegue puede dejar el barrido parado unos minutos: al volver
    // tiene que recoger lo atrasado, no saltárselo.
    expect(tocaBuscar(enMin(-30), AHORA)).toBe(true);
  });
});
