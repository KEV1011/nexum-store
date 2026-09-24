import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { BUZON_ZIPA } from './contacto';
import { BUZON_ZIPA as BUZON_PORTAL, correoSoporte } from '../../../app/contacto';

/**
 * El canal de atención al titular, el mismo en los dos servicios.
 *
 * La política de privacidad la sirve el backend y la página de «eliminar tu
 * cuenta» la sirve el portal Next, que se despliega aparte. Si las direcciones
 * divergen, el mismo trámite ofrece dos canales distintos: el titular escribe
 * al que encontró primero y puede acabar en un buzón que nadie lee.
 *
 * Se prueba desde aquí porque es donde corre vitest, y `app/contacto.ts` es
 * TypeScript puro sin nada de Next — mismo patrón que `moneda-portal.test.ts`.
 */
describe('el correo de contacto, uno solo para los dos servicios', () => {
  it('backend y portal publican el MISMO buzón', () => {
    expect(BUZON_PORTAL).toBe(BUZON_ZIPA);
  });

  it('es un correo con forma de correo', () => {
    // Una dirección rota dentro de un documento legal es peor que ninguna.
    expect(BUZON_ZIPA).toMatch(/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/);
  });

  it('sin la variable del portal, se publica el buzón igualmente', () => {
    // El fallo que esto evita: el portal desplegado sin
    // `NEXT_PUBLIC_SUPPORT_EMAIL` servía la página que lee el revisor de Play
    // sin ningún canal de contacto.
    delete process.env['NEXT_PUBLIC_SUPPORT_EMAIL'];
    expect(correoSoporte()).toBe(BUZON_ZIPA);
  });

  it('la página de eliminar cuenta usa el helper, no una copia', () => {
    // Copiar la dirección en el JSX siempre será más rápido que importar el
    // helper, y así fue como el formateador de pesos acabó en dieciocho sitios.
    const pagina = readFileSync(
      join(__dirname, '../../../app/legal/eliminar-cuenta/page.tsx'),
      'utf8',
    );
    expect(pagina).toContain('correoSoporte()');
    expect(pagina).not.toContain('@gmail.com');
  });
});
