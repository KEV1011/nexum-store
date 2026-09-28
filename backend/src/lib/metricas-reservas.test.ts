import { describe, expect, it } from 'vitest';
import {
  armarMetricasReservas,
  mediana,
  MINIMO_PARA_TASA,
  tasa,
  type ConteosReserva,
} from './metricas-reservas';

const vacio: ConteosReserva = {
  creadas: 0, apartadas: 0, cumplidas: 0,
  incumplidasSinSenal: 0, incumplidasDocumentos: 0, canceladas: 0,
  minutosHastaApartar: [],
};

describe('una tasa sin denominador no es cero, es nada', () => {
  it('sin reservas no hay porcentaje de apartado', () => {
    // Un «0 % encuentran conductor» sin reservas acusa al tablero de algo que
    // no hizo. Es la misma regla que ya se pagó en las métricas de negocio.
    const m = armarMetricasReservas(vacio);
    expect(m.tasaApartado.pct).toBeNull();
    expect(m.tasaApartado.total).toBe(0);
    expect(m.tasaApartado.fiable).toBe(false);
  });

  it('sin reservas apartadas no hay tasa de incumplimiento', () => {
    const m = armarMetricasReservas({ ...vacio, creadas: 30 });
    expect(m.tasaIncumplimiento.pct).toBeNull();
    expect(m.tasaCumplimiento.pct).toBeNull();
  });
});

describe('una muestra diminuta enseña la fracción, no el porcentaje', () => {
  it('con pocas reservas se calla el porcentaje pero se ve el conteo', () => {
    const t = tasa(2, 2);
    expect(t.pct).toBeNull();
    expect(t.parte).toBe(2);
    expect(t.total).toBe(2);
    expect(t.fiable).toBe(false);
  });

  it('a partir del mínimo sí se publica', () => {
    const t = tasa(5, MINIMO_PARA_TASA);
    expect(t.pct).toBe(50);
    expect(t.fiable).toBe(true);
  });
});

describe('el denominador del incumplimiento es lo apartado, no lo creado', () => {
  it('una reserva que nadie tomó no la incumplió nadie', () => {
    // Contarla repartiría la culpa de un problema de OFERTA entre los
    // conductores que sí aparecieron.
    const m = armarMetricasReservas({
      ...vacio,
      creadas: 100,
      apartadas: 20,
      cumplidas: 18,
      incumplidasSinSenal: 2,
    });
    expect(m.tasaIncumplimiento.total).toBe(20);
    expect(m.tasaIncumplimiento.pct).toBe(10);
    expect(m.tasaApartado.pct).toBe(20);
  });
});

describe('los dos motivos de incumplimiento se cuentan aparte', () => {
  it('sumados dan el total, y se pueden leer por separado', () => {
    // Seis por papeles vencidos es un trámite; seis por no aparecer es dejar
    // tirada a seis personas. Un solo número las confundiría.
    const m = armarMetricasReservas({
      ...vacio, creadas: 50, apartadas: 40, cumplidas: 30,
      incumplidasSinSenal: 7, incumplidasDocumentos: 3,
    });
    expect(m.incumplidas).toBe(10);
    expect(m.incumplidasSinSenal).toBe(7);
    expect(m.incumplidasDocumentos).toBe(3);
  });
});

describe('cuánto tarda en apartarse la reserva típica', () => {
  it('es la MEDIANA, no el promedio', () => {
    // Una sola reserva que nadie tocó en tres días arrastra el promedio hasta
    // dejarlo sin significado; lo que se quiere saber es la típica.
    const minutos = [5, 6, 7, 8, 4320];
    expect(mediana(minutos)).toBe(7);
    const promedio = minutos.reduce((a, b) => a + b, 0) / minutos.length;
    expect(Math.round(promedio)).toBe(869);
  });

  it('con un número par de casos promedia los dos del medio', () => {
    expect(mediana([10, 20, 30, 40])).toBe(25);
  });

  it('si ninguna se apartó no se inventa un tiempo', () => {
    expect(mediana([])).toBeNull();
    expect(armarMetricasReservas(vacio).medianaMinutosHastaApartar).toBeNull();
  });
});
