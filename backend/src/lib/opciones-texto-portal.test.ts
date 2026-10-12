import { describe, expect, it } from 'vitest';

import { etiquetaDeGrupo as enElServidor } from './texto-opciones';
import { etiquetaDeGrupo as enElPortal } from '../../../app/opciones-texto';

/**
 * El portal y el servidor describen un grupo con la MISMA frase.
 *
 * Hay dos copias porque el portal es otro servicio y no puede importar de
 * `backend/src`, y el editor necesita la frase mientras el dueño mueve los
 * números. Se prueba desde aquí porque es donde corre vitest y el fichero de
 * `app/` es TypeScript puro — igual que `moneda-portal.test.ts`.
 *
 * Lo que impide: que el dueño configure el grupo leyendo «Opcional · hasta 3»
 * y el cliente vea otra cosa en el teléfono y en la carta del QR.
 */
describe('la frase del grupo es la misma en las dos superficies', () => {
  const casos: Array<[boolean, number, number]> = [
    [true, 1, 1],
    [true, 1, 3],
    [true, 2, 4],
    [true, 3, 3],
    [false, 0, 1],
    [false, 0, 10],
    [false, 1, 2],
    [false, 0, 2],
    [true, 0, 1],
  ];

  for (const [required, minSelect, maxSelect] of casos) {
    it(`coinciden: required=${required} min=${minSelect} max=${maxSelect}`, () => {
      const g = { required, minSelect, maxSelect };
      expect(enElPortal(g)).toBe(enElServidor(g));
    });
  }

  it('y dicen lo que el dueño espera leer', () => {
    // Las dos pantallas de las capturas del usuario.
    expect(enElPortal({ required: true, minSelect: 1, maxSelect: 1 }))
      .toBe('Obligatorio · elige 1');
    expect(enElPortal({ required: false, minSelect: 0, maxSelect: 10 }))
      .toBe('Opcional · hasta 10');
  });
});
