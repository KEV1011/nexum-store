import { describe, it, expect } from 'vitest';
import { etiquetaDeZona, MARCA } from './municipality.service';

/**
 * Cómo se llama la marca en cada sitio.
 *
 * El sufijo de región se retiró: la marca es ZIPA en todas partes y ninguna
 * fila de `municipalities` tiene `zone`, así que en la práctica solo se ejercita
 * el camino de «sin zona». Las pruebas se quedan porque el mecanismo sigue vivo
 * —es lo que hace que las apps ya instaladas olviden la zona que guardaron— y
 * porque las dos formas de estropearlo, inventar una zona donde no hay ninguna
 * o dejar un «ZIPA/» suelto, salen en la primera pantalla que ve el usuario.
 */
describe('etiqueta de la marca por zona', () => {
  it('con zona configurada la pegaría en mayúsculas (hoy no hay ninguna)', () => {
    // Se guarda con su tilde y su capitalización ('Santurbán') porque el mismo
    // dato sirve para leerlo en prosa; el logotipo lo sube a mayúsculas.
    expect(etiquetaDeZona('Santurbán')).toBe('ZIPA/SANTURBÁN');
  });

  it('sin zona, la marca a secas — nunca un hueco ni una barra suelta', () => {
    expect(etiquetaDeZona(null)).toBe(MARCA);
    expect(etiquetaDeZona(undefined)).toBe(MARCA);
    expect(etiquetaDeZona('')).toBe(MARCA);
    // Un espacio en blanco en la base es tan "sin zona" como un null, y sin
    // recortarlo saldría «ZIPA/» en la pantalla principal.
    expect(etiquetaDeZona('   ')).toBe(MARCA);
  });

  it('recorta los espacios de alrededor', () => {
    expect(etiquetaDeZona('  Santurbán  ')).toBe('ZIPA/SANTURBÁN');
  });
});
