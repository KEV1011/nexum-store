/**
 * El doble registro del mismo negocio.
 *
 * La prueba que justifica el fichero es la última: «Pieros» y «Pieros Pizza»
 * son dos locales distintos del mismo dueño y tienen que poder convivir. Una
 * comparación más laxa —por parecido, o quitando palabras— se comería el
 * segundo local y el dueño no podría registrarlo nunca.
 */
import { describe, it, expect } from 'vitest';
import { esElMismoNegocio, nombreComparable } from './negocio-duplicado';

describe('el mismo negocio escrito dos veces', () => {
  it('mayúsculas, tildes y espacios de sobra no lo cambian', () => {
    expect(esElMismoNegocio('BETOS', 'Betos')).toBe(true);
    expect(esElMismoNegocio('Betos  ', ' betos')).toBe(true);
    expect(esElMismoNegocio('Café Pamplona', 'CAFE PAMPLONA')).toBe(true);
    expect(nombreComparable('  Café   Pamplona ')).toBe('cafe pamplona');
  });

  it('dos locales distintos del mismo dueño NO son el mismo', () => {
    // Es lo que impide que la guarda contra el doble toque le bloquee al
    // dueño su segundo local.
    expect(esElMismoNegocio('Pieros', 'Pieros Pizza')).toBe(false);
    expect(esElMismoNegocio('Betos', 'Betos Centro')).toBe(false);
  });

  it('un nombre vacío no casa con nada', () => {
    // Si no, un registro con el nombre en blanco se «reutilizaría» a sí mismo
    // y devolvería un negocio ajeno.
    expect(esElMismoNegocio('', '')).toBe(false);
    expect(esElMismoNegocio('   ', 'Betos')).toBe(false);
  });
});
