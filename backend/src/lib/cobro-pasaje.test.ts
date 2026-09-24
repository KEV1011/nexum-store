import { describe, it, expect } from 'vitest';
import {
  CobroInvalido, MAX_DETALLE, cobroGuardado, lineasDeCobro, resumenDeCobro, saneaCobro,
} from './cobro-pasaje';

describe('saneaCobro', () => {
  it('acepta un medio suelto', () => {
    expect(saneaCobro({ medios: ['efectivo'] })).toEqual({ medios: ['efectivo'] });
  });

  it('guarda el detalle de la transferencia', () => {
    expect(saneaCobro({ medios: ['transferencia'], detalle: 'Nequi 300 123 4567' })).toEqual({
      medios: ['transferencia'],
      detalle: 'Nequi 300 123 4567',
    });
  });

  it('ordena por el catálogo, no por el formulario', () => {
    // Dos empresas con los mismos medios tienen que leerse igual.
    const c = saneaCobro({ medios: ['taquilla', 'efectivo'] });
    expect(c?.medios).toEqual(['efectivo', 'taquilla']);
  });

  it('quita el repetido', () => {
    expect(saneaCobro({ medios: ['efectivo', 'efectivo'] })?.medios).toEqual(['efectivo']);
  });

  it('sin declarar nada devuelve null, que NO es «no cobra»', () => {
    expect(saneaCobro(null)).toBeNull();
    expect(saneaCobro(undefined)).toBeNull();
    expect(saneaCobro({ medios: [] })).toBeNull();
  });

  it('un detalle suelto sin medio no dice cómo se paga', () => {
    expect(saneaCobro({ detalle: 'Nequi 300 123 4567' })).toBeNull();
  });

  it('RECHAZA transferencia sin decir a qué cuenta', () => {
    // Es el caso caro: el pasajero reserva, le dicen «transfiere» y no hay a
    // dónde. Lo descubre con la silla ya tomada.
    expect(() => saneaCobro({ medios: ['transferencia'] })).toThrow(CobroInvalido);
    expect(() => saneaCobro({ medios: ['transferencia'], detalle: '   ' })).toThrow(/a qué cuenta/);
  });

  it('acepta transferencia junto a otro medio SI hay detalle', () => {
    const c = saneaCobro({ medios: ['efectivo', 'transferencia'], detalle: 'Nequi 300' });
    expect(c?.medios).toEqual(['efectivo', 'transferencia']);
  });

  it('nombra el medio desconocido en vez de tragárselo', () => {
    expect(() => saneaCobro({ medios: ['bitcoin'] })).toThrow(/bitcoin/);
  });

  it('rechaza un detalle kilométrico', () => {
    expect(() => saneaCobro({ medios: ['efectivo'], detalle: 'x'.repeat(MAX_DETALLE + 1) }))
      .toThrow(CobroInvalido);
  });

  it('rechaza una forma que no es objeto', () => {
    expect(() => saneaCobro('efectivo')).toThrow(CobroInvalido);
    expect(() => saneaCobro(['efectivo'])).toThrow(CobroInvalido);
  });

  it('rechaza medios que no vienen en lista', () => {
    expect(() => saneaCobro({ medios: 'efectivo' })).toThrow(CobroInvalido);
  });
});

describe('cobroGuardado', () => {
  it('no tumba una consulta por un dato viejo o corrupto', () => {
    expect(cobroGuardado({ medios: ['pichirilo'] })).toBeNull();
    expect(cobroGuardado('vaya cosa')).toBeNull();
  });

  it('lee lo que sí es válido', () => {
    expect(cobroGuardado({ medios: ['datafono'] })?.medios).toEqual(['datafono']);
  });
});

describe('lineasDeCobro', () => {
  it('sin declarar lo DICE en vez de inventar «efectivo»', () => {
    const l = lineasDeCobro(null);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatch(/no ha publicado/i);
  });

  it('escribe cada medio y el detalle', () => {
    const l = lineasDeCobro({ medios: ['transferencia'], detalle: 'Nequi 300 123 4567' });
    expect(l[0]).toMatch(/Transferencia/);
    expect(l[1]).toBe('Nequi 300 123 4567');
  });

  it('siempre aclara que ZIPA no cobra el pasaje', () => {
    // Es lo que separa esto de una compra dentro de la app, y si no se dice el
    // pasajero asume que ya pagó.
    const l = lineasDeCobro({ medios: ['efectivo'] });
    expect(l.some((x) => /ZIPA no cobra/.test(x))).toBe(true);
  });
});

describe('resumenDeCobro', () => {
  it('con un solo medio lo nombra', () => {
    expect(resumenDeCobro({ medios: ['efectivo'] })).toMatch(/Efectivo/);
  });

  it('con varios cuenta, para no romper la tarjeta', () => {
    expect(resumenDeCobro({ medios: ['efectivo', 'datafono'] })).toBe('2 formas de pago');
  });

  it('sin declarar no pinta nada', () => {
    expect(resumenDeCobro(null)).toBeNull();
  });
});
