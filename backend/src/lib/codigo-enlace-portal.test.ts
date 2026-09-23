import { describe, it, expect } from 'vitest';
import { codigoDesdeHash } from '../../../app/pedir/codigo-enlace';
import { construirEnlace } from './enlace-magico';

/**
 * El enlace que manda WhatsApp tiene que abrir la página de pedir.
 *
 * Esta prueba vive en el backend y lee un archivo de `app/` —igual que
 * `dockerfiles.test.ts` y `moneda-portal.test.ts`— porque lo que vigila es un
 * CONTRATO ENTRE LOS DOS LADOS: el backend construye el enlace y la página lo
 * abre. Cada lado compilaba perfectamente por su cuenta mientras el enlace no
 * funcionaba, que es exactamente el tipo de fallo que ningún compilador ve.
 *
 * El caso que la motiva: `construirEnlace` genera `#/entrar?c=CODIGO` para el
 * router por hash de Flutter, y la página tomaba el hash entero como si fuera
 * el código. Apuntar `CLIENT_WEB_URL` a la página —que es lo que hay que hacer
 * para que WhatsApp no abra la app de Flutter, mucho más pesada— daba «ese
 * enlace no sirve» con un enlace perfectamente válido.
 */
describe('el código del enlace mágico llega a la página de pedir', () => {
  it('entiende el enlace tal como lo construye el backend', () => {
    const enlace = construirEnlace('https://nexum-store.onrender.com/pedir', 'AbC-123_xyz');
    const hash = enlace.slice(enlace.indexOf('#'));

    expect(codigoDesdeHash(hash)).toBe('AbC-123_xyz');
  });

  it('sigue entendiendo el código crudo en el hash', () => {
    // Formato que la página usaba antes. No se rompe a nadie que tenga un
    // enlace viejo abierto.
    expect(codigoDesdeHash('#AbC-123_xyz')).toBe('AbC-123_xyz');
  });

  it('decodifica el porcentaje que mete encodeURIComponent', () => {
    const enlace = construirEnlace('https://x.test/pedir', 'a+b/c=d');
    const hash = enlace.slice(enlace.indexOf('#'));

    expect(codigoDesdeHash(hash)).toBe('a+b/c=d');
  });

  it('sin hash no hay código', () => {
    expect(codigoDesdeHash('')).toBeNull();
    expect(codigoDesdeHash('#')).toBeNull();
    expect(codigoDesdeHash(null)).toBeNull();
  });

  it('una ruta sin código no se confunde con un código', () => {
    // Devolver '/entrar' haría que el backend rechazara algo que nunca fue un
    // código, y el pasajero leería un motivo que no explica nada.
    expect(codigoDesdeHash('#/entrar')).toBeNull();
    expect(codigoDesdeHash('#/entrar?otra=cosa')).toBeNull();
    expect(codigoDesdeHash('#/entrar?c=')).toBeNull();
  });
});
