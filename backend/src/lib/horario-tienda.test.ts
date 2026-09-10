import { describe, it, expect } from 'vitest';
import {
  saneaHorario,
  estaDentroDelHorario,
  proximaApertura,
  horarioEnTexto,
  saneaPausa,
  enPausa,
  promoVigente,
  saneaVigencia,
  PAUSA_MAXIMA_MIN,
} from './horario-tienda';

/**
 * Un horario que se equivoca no da un error: deja entrar un pedido a las 3 de
 * la mañana con la cocina apagada, o cierra un negocio que estaba trabajando.
 * Las dos cosas las paga la plataforma, que es la que parece responsable.
 */

/** Un instante en hora COLOMBIANA (UTC-5), que es como razona el negocio. */
function enColombia(dia: string, hhmm: string): Date {
  return new Date(`${dia}T${hhmm}:00.000-05:00`);
}
// 2026-09-07 es LUNES; 2026-09-08 martes; 2026-09-12 sábado; 2026-09-13 domingo.
const LUNES = '2026-09-07';
const MARTES = '2026-09-08';
const SABADO = '2026-09-12';
const DOMINGO = '2026-09-13';

describe('el horario de la tienda', () => {
  describe('lo que el dueño escribe', () => {
    it('normaliza y ordena las franjas', () => {
      const h = saneaHorario([
        { dia: 3, abre: '9:00', cierra: '18:00' },
        { dia: 1, abre: '08:00', cierra: '14:00' },
      ]);
      expect(h).toEqual([
        { dia: 1, abre: '08:00', cierra: '14:00' },
        { dia: 3, abre: '09:00', cierra: '18:00' },
      ]);
    });

    it('sin horario devuelve lista vacía, no un error', () => {
      expect(saneaHorario(null)).toEqual([]);
      expect(saneaHorario('')).toEqual([]);
      expect(saneaHorario([])).toEqual([]);
    });

    it('RECHAZA una hora que no se entiende, diciendo el día', () => {
      expect(() => saneaHorario([{ dia: 2, abre: '25:00', cierra: '18:00' }]))
        .toThrow(/martes/);
      expect(() => saneaHorario([{ dia: 0, abre: 'mañana', cierra: '18:00' }]))
        .toThrow(/HH:MM/);
    });

    it('RECHAZA abrir y cerrar a la misma hora', () => {
      // Sería un intervalo vacío: la tienda saldría cerrada todo el día con un
      // horario que se ve bien escrito.
      expect(() => saneaHorario([{ dia: 1, abre: '08:00', cierra: '08:00' }]))
        .toThrow(/misma hora/);
    });
  });

  describe('si está abierta AHORA', () => {
    const lunesAViernes = saneaHorario(
      [1, 2, 3, 4, 5].map((dia) => ({ dia, abre: '08:00', cierra: '18:00' })),
    );

    it('dentro de la franja, abierta', () => {
      expect(estaDentroDelHorario(lunesAViernes, enColombia(LUNES, '12:00'))).toBe(true);
    });

    it('antes de abrir y después de cerrar, cerrada', () => {
      expect(estaDentroDelHorario(lunesAViernes, enColombia(LUNES, '07:59'))).toBe(false);
      expect(estaDentroDelHorario(lunesAViernes, enColombia(LUNES, '18:00'))).toBe(false);
      expect(estaDentroDelHorario(lunesAViernes, enColombia(LUNES, '03:00'))).toBe(false);
    });

    it('un día sin franja está cerrado', () => {
      expect(estaDentroDelHorario(lunesAViernes, enColombia(SABADO, '12:00'))).toBe(false);
      expect(estaDentroDelHorario(lunesAViernes, enColombia(DOMINGO, '12:00'))).toBe(false);
    });

    it('SIN horario declarado se considera abierta', () => {
      // Los negocios ya registrados no tienen horario. Cerrarlos a todos al
      // desplegar sería un apagón, no una mejora.
      expect(estaDentroDelHorario([], enColombia(DOMINGO, '03:00'))).toBe(true);
    });

    it('una franja que CRUZA LA MEDIANOCHE cuenta en los dos días', () => {
      // El bar que abre el sábado a las 18:00 y cierra a las 02:00 del domingo.
      const bar = saneaHorario([{ dia: 6, abre: '18:00', cierra: '02:00' }]);
      expect(estaDentroDelHorario(bar, enColombia(SABADO, '20:00'))).toBe(true);
      expect(estaDentroDelHorario(bar, enColombia(SABADO, '17:59'))).toBe(false);
      // La 01:00 del DOMINGO sigue siendo la noche del sábado.
      expect(estaDentroDelHorario(bar, enColombia(DOMINGO, '01:00'))).toBe(true);
      expect(estaDentroDelHorario(bar, enColombia(DOMINGO, '02:00'))).toBe(false);
    });

    it('la hora es la de COLOMBIA, no la del servidor', () => {
      // Un servidor en UTC cree que a las 02:00 UTC del martes ya es martes;
      // en Colombia son las 21:00 del lunes y el negocio sigue abierto.
      const soloLunes = saneaHorario([{ dia: 1, abre: '18:00', cierra: '23:00' }]);
      expect(estaDentroDelHorario(soloLunes, new Date('2026-09-08T02:00:00.000Z'))).toBe(true);
    });

    it('dos franjas el mismo día (con cierre al mediodía)', () => {
      const partido = saneaHorario([
        { dia: 1, abre: '08:00', cierra: '12:00' },
        { dia: 1, abre: '14:00', cierra: '20:00' },
      ]);
      expect(estaDentroDelHorario(partido, enColombia(LUNES, '10:00'))).toBe(true);
      expect(estaDentroDelHorario(partido, enColombia(LUNES, '13:00'))).toBe(false);
      expect(estaDentroDelHorario(partido, enColombia(LUNES, '15:00'))).toBe(true);
    });
  });

  describe('cuándo vuelve a abrir', () => {
    const lunesAViernes = saneaHorario(
      [1, 2, 3, 4, 5].map((dia) => ({ dia, abre: '08:00', cierra: '18:00' })),
    );

    it('lo dice en palabras, no con un «cerrado» a secas', () => {
      expect(proximaApertura(lunesAViernes, enColombia(LUNES, '06:00'))).toBe('Abre hoy a las 08:00');
      expect(proximaApertura(lunesAViernes, enColombia(LUNES, '19:00'))).toBe('Abre mañana a las 08:00');
      // El sábado por la tarde, la próxima es el lunes.
      expect(proximaApertura(lunesAViernes, enColombia(SABADO, '15:00'))).toBe('Abre el lunes a las 08:00');
    });

    it('sin horario no inventa una hora', () => {
      expect(proximaApertura([], enColombia(LUNES, '06:00'))).toBeNull();
    });

    it('el resumen en texto se lee', () => {
      expect(horarioEnTexto(lunesAViernes)).toContain('lun 08:00-18:00');
      expect(horarioEnTexto([])).toBe('');
    });
  });
});

describe('la pausa temporal', () => {
  const ahora = new Date('2026-09-07T15:00:00.000Z');

  it('se levanta SOLA a los minutos pedidos', () => {
    // Es la diferencia con apagar el interruptor: la cocina copada quiere
    // parar media hora, no acordarse de volver a encender.
    const hasta = saneaPausa(30, ahora)!;
    expect(hasta.getTime()).toBe(ahora.getTime() + 30 * 60_000);
    expect(enPausa(hasta, ahora)).toBe(true);
    expect(enPausa(hasta, new Date(ahora.getTime() + 31 * 60_000))).toBe(false);
  });

  it('cero o vacío = sin pausa', () => {
    expect(saneaPausa(0, ahora)).toBeNull();
    expect(saneaPausa('', ahora)).toBeNull();
    expect(saneaPausa(null, ahora)).toBeNull();
    expect(enPausa(null, ahora)).toBe(false);
  });

  it('RECHAZA una pausa que en realidad es un cierre', () => {
    expect(() => saneaPausa(PAUSA_MAXIMA_MIN + 1, ahora)).toThrow(/24 horas/);
    expect(() => saneaPausa(-5, ahora)).toThrow(/positivo/);
  });
});

describe('la vigencia de la promoción', () => {
  const ahora = new Date('2026-09-07T15:00:00.000Z');

  it('sin fechas, vigente siempre', () => {
    expect(promoVigente(null, null, ahora)).toBe(true);
  });

  it('se apaga SOLA al pasar la fecha', () => {
    // Es lo que pide un «solo este fin de semana»: si hubiera que acordarse de
    // quitarla el lunes, seguiría puesta en marzo.
    expect(promoVigente(null, new Date('2026-09-06T00:00:00Z'), ahora)).toBe(false);
    expect(promoVigente(null, new Date('2026-09-08T00:00:00Z'), ahora)).toBe(true);
  });

  it('y no se enciende antes de tiempo', () => {
    expect(promoVigente(new Date('2026-09-08T00:00:00Z'), null, ahora)).toBe(false);
    expect(promoVigente(new Date('2026-09-01T00:00:00Z'), null, ahora)).toBe(true);
  });

  it('RECHAZA un rango al revés', () => {
    expect(() => saneaVigencia('2026-09-10', '2026-09-01')).toThrow(/antes de empezar/);
    expect(() => saneaVigencia('no es fecha', null)).toThrow(/inválida/);
    expect(saneaVigencia('', '')).toEqual({ desde: null, hasta: null });
  });
});
