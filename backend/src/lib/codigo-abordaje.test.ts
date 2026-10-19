/**
 * Código de abordaje: el conductor no inicia el viaje sin los cuatro dígitos
 * que solo tiene el pasajero.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  _reiniciarIntentosAbordaje,
  comprobarCodigoAbordaje,
  llevaCodigoAbordaje,
  NOTA_MAX,
  sanearNotaConductor,
} from './codigo-abordaje';
import { CustodyPinError } from './custody-pin';
import { avisoDeEstado } from './avisos-viaje';

beforeEach(() => _reiniciarIntentosAbordaje());

describe('qué viajes llevan código', () => {
  it.each(['TAXI', 'PARTICULAR', 'MOTO'])('%s sí', (t) => {
    expect(llevaCodigoAbordaje(t)).toBe(true);
  });
  it('un ENVÍO no: ya tiene su PIN de entrega', () => {
    expect(llevaCodigoAbordaje('ENVIOS')).toBe(false);
    expect(llevaCodigoAbordaje(null)).toBe(false);
  });
});

describe('comprobar el código', () => {
  it('el correcto pasa', () => {
    expect(() => comprobarCodigoAbordaje('t1', '0427', '0427', true)).not.toThrow();
    // Con espacios alrededor, como lo deja un teclado.
    expect(() => comprobarCodigoAbordaje('t1', '0427', ' 0427 ', true)).not.toThrow();
  });

  it('uno equivocado se rechaza SIEMPRE, esté o no encendida la exigencia', () => {
    expect(() => comprobarCodigoAbordaje('t1', '0427', '1111', false)).toThrow(CustodyPinError);
    expect(() => comprobarCodigoAbordaje('t2', '0427', '1111', true)).toThrow(/no coincide/);
  });

  it('sin código: pasa con la exigencia apagada (apps viejas), no con ella encendida', () => {
    expect(() => comprobarCodigoAbordaje('t1', '0427', undefined, false)).not.toThrow();
    expect(() => comprobarCodigoAbordaje('t1', '0427', '   ', true)).toThrow(/código de abordaje/);
  });

  it('un viaje sin código guardado (anterior a esto) no se bloquea', () => {
    expect(() => comprobarCodigoAbordaje('t1', null, undefined, true)).not.toThrow();
    expect(() => comprobarCodigoAbordaje('t1', null, '1234', true)).not.toThrow();
  });

  it('cinco intentos fallidos bloquean, aunque el sexto sea el bueno', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(() => comprobarCodigoAbordaje('t9', '0427', String(1000 + i), true, t0)).toThrow(/no coincide/);
    }
    expect(() => comprobarCodigoAbordaje('t9', '0427', '0427', true, t0 + 1000)).toThrow(/Demasiados intentos/);
    // Pasada la pausa, el código bueno vuelve a valer.
    expect(() => comprobarCodigoAbordaje('t9', '0427', '0427', true, t0 + 6 * 60_000)).not.toThrow();
  });

  it('el bloqueo es POR viaje: otro viaje del mismo conductor no se ve afectado', () => {
    for (let i = 0; i < 5; i++) {
      try { comprobarCodigoAbordaje('a', '0427', '9999', true); } catch { /* esperado */ }
    }
    expect(() => comprobarCodigoAbordaje('b', '5555', '5555', true)).not.toThrow();
  });
});

describe('el aviso de «tu conductor llegó» trae el código', () => {
  it('con código, lo dice', () => {
    const a = avisoDeEstado('arrived', { codigoAbordaje: '0427' });
    expect(a?.body).toContain('0427');
  });
  it('en un envío no (no hay código, hay PIN de entrega)', () => {
    const a = avisoDeEstado('arrived', { esEnvio: true, codigoAbordaje: '0427' });
    expect(a?.body).not.toContain('0427');
  });
});

describe('nota para el conductor', () => {
  it('se limpia a un renglón', () => {
    expect(sanearNotaConductor('  Portería\n\n edificio   azul ')).toBe('Portería edificio azul');
  });
  it('vacía o no-texto es null', () => {
    expect(sanearNotaConductor('   ')).toBeNull();
    expect(sanearNotaConductor(42)).toBeNull();
    expect(sanearNotaConductor(undefined)).toBeNull();
  });
  it('se recorta al máximo', () => {
    expect(sanearNotaConductor('a'.repeat(300))!.length).toBe(NOTA_MAX);
  });
});
