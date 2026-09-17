import { describe, it, expect } from 'vitest';
import {
  saneaCorte,
  proximoDespacho,
  estimaLlegada,
  corteEnTexto,
  avisoDeCorte,
} from './corte-bodega';
import type { Franja } from './horario-tienda';

/** Un instante de hora colombiana, expresado en UTC (Colombia es UTC-5). */
function enColombia(iso: string): Date {
  return new Date(`${iso}-05:00`);
}

const TODOS_LOS_DIAS: Franja[] = [];
// Lunes a sábado; el domingo el comercio no opera.
const LUNES_A_SABADO: Franja[] = [1, 2, 3, 4, 5, 6].map((dia) => ({
  dia,
  abre: '08:00',
  cierra: '18:00',
}));

describe('sanear la hora de corte', () => {
  it('acepta lo que escribe la gente', () => {
    expect(saneaCorte('16:00')).toBe('16:00');
    expect(saneaCorte('9:30')).toBe('09:30');
    expect(saneaCorte(' 07:05 ')).toBe('07:05');
  });

  it('rechaza lo que no es una hora', () => {
    expect(saneaCorte('')).toBeNull();
    expect(saneaCorte('tarde')).toBeNull();
    expect(saneaCorte('25:00')).toBeNull();
    expect(saneaCorte('16:70')).toBeNull();
    expect(saneaCorte(1600)).toBeNull();
    expect(saneaCorte(null)).toBeNull();
  });
});

describe('cuándo sale el próximo despacho', () => {
  it('sin corte declarado sale ya: es el comportamiento de siempre', () => {
    const ahora = enColombia('2026-09-17T17:00:00');
    expect(proximoDespacho(ahora, null).getTime()).toBe(ahora.getTime());
  });

  it('antes del corte, sale hoy a esa hora', () => {
    const ahora = enColombia('2026-09-17T09:00:00'); // jueves
    expect(proximoDespacho(ahora, '16:00', TODOS_LOS_DIAS).toISOString()).toBe(
      enColombia('2026-09-17T16:00:00').toISOString(),
    );
  });

  it('pasado el corte, sale mañana', () => {
    // Este es el caso que motivó la pieza: a las cinco de la tarde el bus de
    // las cuatro ya se fue, y prometer «12 horas» sería mentir.
    const ahora = enColombia('2026-09-17T17:00:00');
    expect(proximoDespacho(ahora, '16:00', TODOS_LOS_DIAS).toISOString()).toBe(
      enColombia('2026-09-18T16:00:00').toISOString(),
    );
  });

  it('justo EN el corte ya no alcanza: «antes de las 4» significa antes', () => {
    const ahora = enColombia('2026-09-17T16:00:00');
    expect(proximoDespacho(ahora, '16:00', TODOS_LOS_DIAS).toISOString()).toBe(
      enColombia('2026-09-18T16:00:00').toISOString(),
    );
    // Un minuto antes sí.
    const casi = enColombia('2026-09-17T15:59:00');
    expect(proximoDespacho(casi, '16:00', TODOS_LOS_DIAS).toISOString()).toBe(
      enColombia('2026-09-17T16:00:00').toISOString(),
    );
  });

  it('se salta los días en que el comercio no opera', () => {
    // Sábado pasado el corte ⇒ no es domingo (cerrado), es el lunes.
    const sabadoTarde = enColombia('2026-09-19T18:00:00');
    expect(sabadoTarde.getUTCDay()).toBe(6);
    expect(proximoDespacho(sabadoTarde, '16:00', LUNES_A_SABADO).toISOString()).toBe(
      enColombia('2026-09-21T16:00:00').toISOString(),
    );
  });

  it('sin horario declarado opera todos los días', () => {
    // Misma regla que `tiendaRecibiendo`: la lista vacía no cierra a nadie.
    const sabadoTarde = enColombia('2026-09-19T18:00:00');
    expect(proximoDespacho(sabadoTarde, '16:00', TODOS_LOS_DIAS).toISOString()).toBe(
      enColombia('2026-09-20T16:00:00').toISOString(),
    );
  });

  it('un horario sin ningún día abierto no cuelga el checkout', () => {
    // Tope de seguridad: sin él el bucle no terminaría nunca.
    const roto: Franja[] = [{ dia: 99, abre: '08:00', cierra: '18:00' }];
    const ahora = enColombia('2026-09-17T17:00:00');
    const salida = proximoDespacho(ahora, '16:00', roto);
    expect(salida.getTime()).toBeGreaterThan(ahora.getTime());
  });

  it('usa la hora de COLOMBIA, no la del servidor', () => {
    // 02:00 UTC del viernes son las 21:00 del jueves en Colombia. Con la hora
    // del servidor el corte de las 16:00 ya habría pasado «mañana».
    const utc = new Date('2026-09-18T02:00:00Z'); // jueves 21:00 en Colombia
    expect(proximoDespacho(utc, '16:00', TODOS_LOS_DIAS).toISOString()).toBe(
      enColombia('2026-09-18T16:00:00').toISOString(),
    );
  });
});

describe('la fecha prometida', () => {
  it('es la salida más las horas que declaró el comercio', () => {
    const ahora = enColombia('2026-09-17T09:00:00');
    expect(estimaLlegada(ahora, '16:00', 12, TODOS_LOS_DIAS).toISOString()).toBe(
      enColombia('2026-09-18T04:00:00').toISOString(),
    );
  });

  it('pasado el corte, se corre un día entero', () => {
    const antes = estimaLlegada(enColombia('2026-09-17T15:00:00'), '16:00', 12, TODOS_LOS_DIAS);
    const despues = estimaLlegada(enColombia('2026-09-17T17:00:00'), '16:00', 12, TODOS_LOS_DIAS);
    expect(despues.getTime() - antes.getTime()).toBe(24 * 3_600_000);
  });

  it('sin corte se cuenta desde ahora, como antes', () => {
    const ahora = enColombia('2026-09-17T17:00:00');
    expect(estimaLlegada(ahora, null, 12).getTime()).toBe(ahora.getTime() + 12 * 3_600_000);
  });

  it('unas horas negativas no adelantan la entrega al pasado', () => {
    const ahora = enColombia('2026-09-17T09:00:00');
    expect(estimaLlegada(ahora, null, -5).getTime()).toBe(ahora.getTime());
  });
});

describe('decírselo a una persona', () => {
  it('la hora en formato de doce', () => {
    expect(corteEnTexto('16:00')).toBe('4:00 p. m.');
    expect(corteEnTexto('09:30')).toBe('9:30 a. m.');
    expect(corteEnTexto('00:15')).toBe('12:15 a. m.');
    expect(corteEnTexto('12:00')).toBe('12:00 p. m.');
  });

  it('el aviso cambia según si todavía alcanza', () => {
    expect(avisoDeCorte(enColombia('2026-09-17T09:00:00'), '16:00', TODOS_LOS_DIAS))
      .toBe('Pide antes de las 4:00 p. m. y sale hoy mismo.');
    expect(avisoDeCorte(enColombia('2026-09-17T17:00:00'), '16:00', TODOS_LOS_DIAS))
      .toContain('ya salió');
  });

  it('sin corte no se dice nada: mejor callarse que inventar un plazo', () => {
    expect(avisoDeCorte(new Date(), null)).toBeNull();
  });

  it('en un día que el comercio no opera, tampoco promete que sale hoy', () => {
    const domingo = enColombia('2026-09-20T09:00:00');
    expect(domingo.getUTCDay()).toBe(0);
    expect(avisoDeCorte(domingo, '16:00', LUNES_A_SABADO)).toContain('ya salió');
  });
});
