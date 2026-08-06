import { describe, it, expect } from 'vitest';
import { evaluarPiloto, PILOT_DEFAULT_DAYS } from './pilot-window';

const AHORA = new Date('2026-08-06T12:00:00.000Z');
const base = { production: true, encendido: true, hasta: undefined as string | undefined, ahora: AHORA };

describe('evaluarPiloto — apagado', () => {
  it('sin encender no aplica ni pide nada', () => {
    const v = evaluarPiloto({ ...base, encendido: false });
    expect(v).toEqual({ activo: false, vencido: false, hasta: null });
  });

  it('sin encender ignora una fecha inválida: no hay nada que validar', () => {
    const v = evaluarPiloto({ ...base, encendido: false, hasta: 'cualquier cosa' });
    expect(v.activo).toBe(false);
    expect('abortar' in v).toBe(false);
  });
});

describe('evaluarPiloto — configuración inválida aborta', () => {
  it('encenderlo en producción sin fecha NO arranca, y sugiere una', () => {
    const v = evaluarPiloto(base);
    expect('abortar' in v && v.abortar).toMatch(/PILOT_SKIP_VERIFICATION_UNTIL/);
    // La sugerencia debe ser una fecha real a 30 días, no un texto genérico.
    expect('abortar' in v && v.abortar).toMatch(/2026-09-05/);
  });

  it('una fecha ilegible NO arranca', () => {
    const v = evaluarPiloto({ ...base, hasta: 'el mes que viene' });
    expect('abortar' in v && v.abortar).toMatch(/no es una fecha válida/);
  });

  it('fuera de producción no exige fecha: ventana por defecto', () => {
    const v = evaluarPiloto({ ...base, production: false });
    expect(v.activo).toBe(true);
    expect(v.activo && v.diasRestantes).toBe(PILOT_DEFAULT_DAYS);
  });
});

describe('evaluarPiloto — vigencia', () => {
  it('fecha futura: activo con los días que faltan', () => {
    const v = evaluarPiloto({ ...base, hasta: '2026-08-16' });
    expect(v.activo).toBe(true);
    expect(v.activo && v.diasRestantes).toBe(10);
  });

  it('la fecha suelta vale hasta el final de ESE día, no desde su medianoche', () => {
    // Escrito "2026-08-06" el piloto debe seguir vivo durante todo el 6.
    const v = evaluarPiloto({ ...base, hasta: '2026-08-06' });
    expect(v.activo).toBe(true);
  });

  it('acepta ISO completa; a 12 h del fin quedan 0 días ("caduca hoy")', () => {
    const v = evaluarPiloto({ ...base, hasta: '2026-08-07T00:00:00.000Z' });
    expect(v.activo).toBe(true);
    expect(v.activo && v.diasRestantes).toBe(0);
  });

  it('quita comillas y espacios pegados desde el panel de Render', () => {
    const v = evaluarPiloto({ ...base, hasta: '  "2026-08-16" ' });
    expect(v.activo).toBe(true);
  });

  it('fecha pasada: NO aborta, solo deja de aplicar', () => {
    const v = evaluarPiloto({ ...base, hasta: '2026-07-01' });
    expect(v.activo).toBe(false);
    expect('abortar' in v).toBe(false);
    expect(!('abortar' in v) && v.vencido).toBe(true);
  });

  it('el día siguiente al vencimiento ya no aplica', () => {
    const v = evaluarPiloto({ ...base, hasta: '2026-08-05' });
    expect(v.activo).toBe(false);
    expect(!('abortar' in v) && v.vencido).toBe(true);
  });
});
