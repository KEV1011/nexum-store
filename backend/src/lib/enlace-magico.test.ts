import { describe, it, expect } from 'vitest';
import {
  nuevoCodigo,
  codigoBienFormado,
  construirEnlace,
  motivoParaNoCanjear,
  venceEn,
  VIGENCIA_MIN,
} from './enlace-magico';

describe('el código del enlace', () => {
  it('es largo, aleatorio y seguro en una URL', () => {
    const a = nuevoCodigo();
    expect(codigoBienFormado(a)).toBe(true);
    // base64url no lleva +, / ni =: en una URL habría que escaparlos y al
    // copiarlos a mano desde un chat se rompen.
    expect(a).not.toMatch(/[+/=]/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('no se repite', () => {
    const vistos = new Set(Array.from({ length: 500 }, () => nuevoCodigo()));
    expect(vistos.size).toBe(500);
  });

  it('rechaza lo que no tiene su forma, antes de ir a la base', () => {
    expect(codigoBienFormado('')).toBe(false);
    expect(codigoBienFormado('corto')).toBe(false);
    expect(codigoBienFormado('a'.repeat(200))).toBe(false);
    expect(codigoBienFormado("' OR 1=1 --")).toBe(false);
  });
});

describe('armar el enlace', () => {
  it('el código va DETRÁS del #, que no viaja al servidor', () => {
    // Así ni el hosting ni el robot que arma la vista previa del chat lo ven.
    const url = construirEnlace('https://kev1011.github.io/nexum-store/cliente', 'ABC123');
    expect(url).toBe('https://kev1011.github.io/nexum-store/cliente/#/entrar?c=ABC123');
  });

  it('tolera la barra final de más o de menos', () => {
    const conBarra = construirEnlace('https://x.test/cliente/', 'K');
    const sinBarra = construirEnlace('https://x.test/cliente', 'K');
    expect(conBarra).toBe(sinBarra);
    expect(conBarra).not.toContain('//#');
  });

  it('escapa el código', () => {
    expect(construirEnlace('https://x.test', 'a b')).toContain('c=a%20b');
  });
});

describe('canjear el código', () => {
  const ahora = new Date('2026-09-17T15:00:00Z');
  const vivo = { expiresAt: new Date('2026-09-17T15:10:00Z'), usedAt: null };

  it('uno vivo y sin usar, sí', () => {
    expect(motivoParaNoCanjear(vivo, ahora)).toBeNull();
  });

  it('los tres rechazos se distinguen: al usuario se le dice cosas distintas', () => {
    expect(motivoParaNoCanjear(null, ahora)).toBe('enlace-inexistente');
    expect(motivoParaNoCanjear({ ...vivo, usedAt: new Date() }, ahora)).toBe('enlace-ya-usado');
    expect(
      motivoParaNoCanjear({ expiresAt: new Date('2026-09-17T14:59:59Z'), usedAt: null }, ahora),
    ).toBe('enlace-vencido');
  });

  it('el instante exacto del vencimiento ya NO vale', () => {
    expect(motivoParaNoCanjear({ expiresAt: ahora, usedAt: null }, ahora)).toBe('enlace-vencido');
  });

  it('usado manda sobre vencido: un enlace gastado no revive', () => {
    const gastado = { expiresAt: new Date('2026-09-17T14:00:00Z'), usedAt: new Date() };
    expect(motivoParaNoCanjear(gastado, ahora)).toBe('enlace-ya-usado');
  });
});

describe('la vigencia', () => {
  it('son minutos desde ahora', () => {
    const ahora = new Date('2026-09-17T15:00:00Z');
    expect(venceEn(ahora).toISOString()).toBe('2026-09-17T15:15:00.000Z');
    expect(VIGENCIA_MIN).toBe(15);
  });
});
