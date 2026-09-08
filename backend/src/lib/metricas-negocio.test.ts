import { describe, it, expect } from 'vitest';
import {
  porcentaje,
  serieDeDias,
  emparejamiento,
  retencion,
  MINIMO_PARA_FIARSE,
} from './metricas-negocio';

/**
 * Las tres cifras del piloto, y las formas en que mentirían.
 *
 * Son las que se van a mirar para decidir si el negocio existe o no, así que
 * importa menos que estén bien calculadas —son divisiones— que el que NO
 * afirmen cosas que los datos no sostienen.
 */
describe('métricas de negocio', () => {
  describe('porcentaje', () => {
    it('divide y redondea a un decimal', () => {
      expect(porcentaje(80, 100)).toBe(80);
      expect(porcentaje(1, 3)).toBe(33.3);
    });

    it('sin denominador devuelve null, NO cero', () => {
      // Un 0 % de emparejamiento diría «ningún viaje encontró conductor», que
      // es una acusación grave. Lo cierto es que no hubo viajes.
      expect(porcentaje(0, 0)).toBeNull();
    });
  });

  describe('serie diaria', () => {
    it('rellena con cero los días sin actividad', () => {
      // Agrupar por día en SQL solo devuelve los días con datos. Sin rellenar,
      // una semana con dos días muertos se dibuja como una semana entera de
      // actividad: el gráfico sube cuando la realidad se paró.
      const s = serieDeDias('2026-09-01', '2026-09-05', new Map([
        ['2026-09-01', 4],
        ['2026-09-04', 7],
      ]));
      expect(s.map((d) => d.valor)).toEqual([4, 0, 0, 7, 0]);
      expect(s[0]!.dia).toBe('2026-09-01');
      expect(s[4]!.dia).toBe('2026-09-05');
    });

    it('un solo día es un solo punto', () => {
      expect(serieDeDias('2026-09-01', '2026-09-01', new Map())).toEqual([
        { dia: '2026-09-01', valor: 0 },
      ]);
    });

    it('un rango al revés no devuelve nada, en vez de girar el bucle', () => {
      expect(serieDeDias('2026-09-05', '2026-09-01', new Map())).toEqual([]);
    });

    it('una fecha inválida no revienta', () => {
      expect(serieDeDias('no-es-fecha', '2026-09-01', new Map())).toEqual([]);
    });

    it('un rango absurdo se corta en vez de generar cien mil puntos', () => {
      const s = serieDeDias('2000-01-01', '2026-09-01', new Map());
      expect(s.length).toBeLessThanOrEqual(400);
    });
  });

  describe('emparejamiento', () => {
    it('reporta la tasa con sus componentes en crudo', () => {
      // 80 % sobre 5 viajes y 80 % sobre 500 son cosas distintas: quien lo lee
      // tiene derecho a distinguirlas.
      const e = emparejamiento(10, 8, 2);
      expect(e.tasa).toBe(80);
      expect(e.solicitados).toBe(10);
      expect(e.conConductor).toBe(8);
      expect(e.sinConductor).toBe(2);
    });

    it('un día sin solicitudes no es un día con 0 % de éxito', () => {
      expect(emparejamiento(0, 0, 0).tasa).toBeNull();
    });
  });

  describe('retención', () => {
    it('cuenta cuántos volvieron sobre los que había', () => {
      const r = retencion(20, 9);
      expect(r.pct).toBe(45);
      expect(r.base).toBe(20);
      expect(r.fiable).toBe(true);
    });

    it('marca como NO fiable una base diminuta', () => {
      // «50 % de retención» sobre dos personas no es una métrica, es una
      // anécdota — y en un piloto es justo el número que va a salir.
      const r = retencion(2, 1);
      expect(r.pct).toBe(50);
      expect(r.fiable).toBe(false);
    });

    it('el umbral de fiabilidad es el declarado', () => {
      expect(retencion(MINIMO_PARA_FIARSE, 1).fiable).toBe(true);
      expect(retencion(MINIMO_PARA_FIARSE - 1, 1).fiable).toBe(false);
    });

    it('sin nadie la semana pasada no hay retención que calcular', () => {
      const r = retencion(0, 0);
      expect(r.pct).toBeNull();
      expect(r.fiable).toBe(false);
    });
  });
});
