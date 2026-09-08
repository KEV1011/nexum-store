import { describe, it, expect } from 'vitest';
import { etiquetaDeZona, MARCA } from './municipality.service';

/**
 * Cómo se llama la marca en cada sitio.
 *
 * En Pamplona la app se presenta como «ZIPA/SANTURBÁN» porque el operador de
 * allí quiere que se note que la plataforma es de su tierra. La regla es de una
 * línea, pero es la que aparece en la primera pantalla que ve el usuario, y las
 * dos formas de estropearla —inventar una zona donde no hay ninguna, o dejar un
 * hueco— se ven al instante.
 */
describe('etiqueta de la marca por zona', () => {
  it('con zona, la pega a la marca en mayúsculas', () => {
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
