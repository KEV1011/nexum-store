/**
 * La sugerencia del escáner.
 *
 * La prueba que justifica el fichero es la del precio: proponerlo sería ponerle
 * a una tienda el precio de su competencia, y un «Guardar» distraído la dejaría
 * vendiendo a ese precio sin que nadie se entere hasta que alguien compre.
 */
import { describe, it, expect } from 'vitest';
import { claveDeNombre, sugerenciaDeCodigo } from './sugerencia-codigo';

describe('qué se propone', () => {
  it('el nombre, la marca y la unidad: lo que es del PRODUCTO', () => {
    expect(sugerenciaDeCodigo([
      { name: 'Coca-Cola 1.5 L', brand: 'Coca-Cola', unit: 'unidad' },
    ])).toEqual({
      name: 'Coca-Cola 1.5 L', brand: 'Coca-Cola', unit: 'unidad', comercios: 1,
    });
  });

  it('el PRECIO no, ni siquiera cuando todos cobran lo mismo', () => {
    // La guarda vive en el tipo —`SugerenciaDeCodigo` no tiene precio— y se
    // comprueba aquí para que quitarlo del tipo no pase inadvertido.
    const s = sugerenciaDeCodigo([{ name: 'Arroz Diana 500 g' }])!;
    expect(Object.keys(s)).not.toContain('price');
    expect(Object.keys(s)).not.toContain('compareAtPrice');
  });

  it('nadie más lo tiene: no se inventa un nombre a partir del código', () => {
    expect(sugerenciaDeCodigo([])).toBeNull();
  });

  it('una marca suelta sin nombre tampoco es sugerencia', () => {
    // Dejaría el nombre vacío con los demás campos llenos, que se lee como un
    // formulario a medio cargar.
    expect(sugerenciaDeCodigo([{ name: '   ', brand: 'Postobón' }])).toBeNull();
  });
});

describe('el nombre se vota, no se toma el primero', () => {
  it('dos que lo escribieron bien le ganan a uno que lo escribió mal', () => {
    // Sin esto, la errata de un comercio se vuelve el nombre que ve toda la
    // plataforma.
    const s = sugerenciaDeCodigo([
      { name: 'Coca Col 1.5' },
      { name: 'Coca-Cola 1.5 L' },
      { name: 'Coca-Cola 1.5 L' },
    ])!;
    expect(s.name).toBe('Coca-Cola 1.5 L');
    expect(s.comercios).toBe(3);
  });

  it('las tildes, las mayúsculas y los espacios de más no parten el voto', () => {
    const s = sugerenciaDeCodigo([
      { name: 'Jabón   REY' },
      { name: 'jabon rey' },
      { name: 'Otra cosa' },
    ])!;
    expect(claveDeNombre('Jabón   REY')).toBe('jabon rey');
    expect(s.name).toBe('Jabón   REY');
  });

  it('la marca y la unidad se votan igual', () => {
    const s = sugerenciaDeCodigo([
      { name: 'Leche', brand: 'Alpina', unit: 'litro' },
      { name: 'Leche', brand: 'Alpina', unit: 'unidad' },
      { name: 'Leche', brand: 'alpina', unit: 'unidad' },
    ])!;
    expect(s.brand).toBe('Alpina');
    expect(s.unit).toBe('unidad');
  });

  it('un campo que nadie llenó se omite en vez de ir vacío', () => {
    const s = sugerenciaDeCodigo([{ name: 'Pan', brand: null, unit: '' }])!;
    expect(s.brand).toBeUndefined();
    expect(s.unit).toBeUndefined();
  });
});
