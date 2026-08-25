import { describe, it, expect } from 'vitest';
import { variacionPct, rangoAnterior, mediaMinutos, duracionMin } from './analitica';

/**
 * Las reglas del tablero de la torre.
 *
 * Un tablero miente de formas silenciosas: comparando períodos de distinta
 * longitud, inventando un «+100 %» donde antes no había nada, o promediando un
 * cero como si fuera un dato. Esto fija las cuatro que importan.
 */
describe('analítica de la flota', () => {
  describe('variación contra el período anterior', () => {
    it('sube y baja como es debido', () => {
      expect(variacionPct(150, 100)).toBe(50);
      expect(variacionPct(50, 100)).toBe(-50);
      expect(variacionPct(100, 100)).toBe(0);
    });

    it('de cero a algo NO es +100 %, es null', () => {
      // Es un estreno, no un crecimiento. Fingir un porcentaje aquí es la
      // forma más fácil de que un tablero mienta con cara de precisión.
      expect(variacionPct(80_000, 0)).toBeNull();
      expect(variacionPct(0, 0)).toBeNull();
    });

    it('un decimal, no quince', () => {
      expect(variacionPct(1234, 1000)).toBe(23.4);
    });
  });

  describe('el período anterior', () => {
    it('tiene EXACTAMENTE los mismos días', () => {
      const { desde, hasta, dias } = rangoAnterior('2026-08-01', '2026-08-07');
      expect(dias).toBe(7);
      expect(hasta).toBe('2026-07-31');
      expect(desde).toBe('2026-07-25');
    });

    it('un solo día se compara con el día anterior', () => {
      const { desde, hasta, dias } = rangoAnterior('2026-08-10', '2026-08-10');
      expect(dias).toBe(1);
      expect(desde).toBe('2026-08-09');
      expect(hasta).toBe('2026-08-09');
    });

    it('cruza el cambio de mes sin descuadrarse', () => {
      const { desde, hasta } = rangoAnterior('2026-03-01', '2026-03-31');
      expect(hasta).toBe('2026-02-28');
      expect(desde).toBe('2026-01-29');
    });
  });

  describe('media de minutos', () => {
    it('sin muestras devuelve null, no cero', () => {
      // Un 0 se leería como «se acepta al instante», que es justo lo contrario
      // de «no tenemos ni un dato».
      expect(mediaMinutos([])).toBeNull();
    });

    it('promedia y redondea', () => {
      expect(mediaMinutos([2, 3, 4])).toBe(3);
      expect(mediaMinutos([1, 2])).toBe(2);
    });
  });

  describe('duración entre dos sellos', () => {
    const t = (iso: string) => new Date(iso);

    it('mide los minutos', () => {
      expect(duracionMin(t('2026-08-01T10:00:00Z'), t('2026-08-01T10:09:00Z'))).toBe(9);
    });

    it('con un sello ausente devuelve null', () => {
      expect(duracionMin(null, t('2026-08-01T10:09:00Z'))).toBeNull();
      expect(duracionMin(t('2026-08-01T10:00:00Z'), null)).toBeNull();
    });

    it('descarta un negativo (reloj mal puesto), no lo cuenta como cero', () => {
      expect(duracionMin(t('2026-08-01T10:09:00Z'), t('2026-08-01T10:00:00Z'))).toBeNull();
    });

    it('descarta lo que no puede ser un viaje urbano', () => {
      // Más de un día: es un dato corrupto o un servicio de otra naturaleza.
      expect(duracionMin(t('2026-08-01T10:00:00Z'), t('2026-08-03T10:00:00Z'))).toBeNull();
    });
  });
});
