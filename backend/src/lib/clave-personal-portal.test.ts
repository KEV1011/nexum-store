/**
 * El portal avisa con las MISMAS reglas que el servidor aplica a la clave
 * personal. Si divergieran, el portal dejaría pasar una clave que el servidor
 * rechaza (o al revés, bloquearía una buena). Mismo patrón que `moneda-portal`.
 */
import { describe, expect, it } from 'vitest';

import { motivoClaveInvalida as delServidor } from './clave-personal';
import { motivoClaveInvalida as delPortal } from '../../../app/clave-personal';

describe('portal y servidor juzgan igual una clave', () => {
  it.each([
    '4827', '90315', '271846', ' 4827 ', '123', '1234567', '12a4', '0000',
    '777777', '1234', '6543', '8901', '', '4 82', '0987',
  ])('«%s»', (c) => {
    expect(delPortal(c)).toBe(delServidor(c));
  });

  it('lo que no es texto', () => {
    expect(delPortal(4827)).toBe(delServidor(4827));
    expect(delPortal(undefined)).toBe(delServidor(undefined));
  });
});
