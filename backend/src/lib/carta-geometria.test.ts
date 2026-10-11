/**
 * La geometría de la foto de la carta.
 *
 * LA PRUEBA QUE JUSTIFICA EL FICHERO es la de las dos columnas: con el texto
 * plano de Vision, «Hamburguesas  Bebidas» llega como UNA línea con dos títulos
 * —y entonces ninguno parece un título— y «Sencilla 12.000  Gaseosa 4.000» como
 * una línea con dos precios, que el parser deja sin precio y con aviso. Eso es
 * exactamente lo que el dueño reportó: que no reconoce las secciones.
 */
import { describe, it, expect } from 'vitest';
import {
  altoDelCuerpo,
  bandasDeColumna,
  esTituloPorTamano,
  lineasDeLaFoto,
  palabrasDeRespuestaVision,
  type PalabraOcr,
} from './carta-geometria';

/** Una palabra, con su rectángulo. `alto` por defecto = letra del cuerpo. */
function p(texto: string, x: number, y: number, ancho = 80, alto = 20): PalabraOcr {
  return { texto, x0: x, x1: x + ancho, y0: y, y1: y + alto };
}

describe('las columnas salen de los huecos de la página', () => {
  it('una carta a dos columnas da dos bandas', () => {
    const bandas = bandasDeColumna([
      p('Hamburguesas', 40, 100), p('Bebidas', 600, 100),
      p('Sencilla', 40, 140), p('Gaseosa', 600, 140),
    ]);
    expect(bandas).toHaveLength(2);
    expect(bandas[0]!.x0).toBe(40);
    expect(bandas[1]!.x0).toBe(600);
  });

  it('una carta a UNA columna con precios a la derecha NO se parte', () => {
    // Es el caso más frecuente de todos, y suponer dos columnas lo rompería:
    // el nombre quedaría en una columna y su precio en otra.
    const bandas = bandasDeColumna([
      p('Pechuga', 40, 100, 120), p('a', 170, 100, 20), p('la', 200, 100, 25),
      p('plancha', 235, 100, 110), p('19.000', 360, 100, 70),
      p('Churrasco', 40, 140, 150), p('25.000', 360, 140, 70),
    ]);
    expect(bandas).toHaveLength(1);
  });
});

describe('los renglones se arman DENTRO de cada columna', () => {
  const palabras = [
    // Izquierda
    p('HAMBURGUESAS', 40, 100, 240, 28),
    p('Sencilla', 40, 160, 100), p('12.000', 250, 160, 70),
    p('Doble', 40, 200, 80), p('18.000', 250, 200, 70),
    // Derecha
    p('BEBIDAS', 600, 100, 150, 28),
    p('Gaseosa', 600, 160, 100), p('4.000', 790, 160, 60),
  ];

  it('la carta se lee columna por columna, no renglón cruzado', () => {
    const lineas = lineasDeLaFoto(palabras);
    expect(lineas.map((l) => l.texto)).toEqual([
      'HAMBURGUESAS',
      'Sencilla 12.000',
      'Doble 18.000',
      'BEBIDAS',
      'Gaseosa 4.000',
    ]);
    expect(lineas.map((l) => l.columna)).toEqual([0, 0, 0, 1, 1]);
  });

  it('y cada renglón trae el alto de su letra', () => {
    const lineas = lineasDeLaFoto(palabras);
    expect(lineas[0]!.alto).toBe(28);
    expect(lineas[1]!.alto).toBe(20);
    expect(altoDelCuerpo(lineas)).toBe(20);
  });

  it('una tilde que sube unos píxeles no parte el renglón en dos', () => {
    const lineas = lineasDeLaFoto([
      { texto: 'Patacón', x0: 40, x1: 160, y0: 96, y1: 120 },
      { texto: 'pisao', x0: 170, x1: 240, y0: 100, y1: 120 },
      { texto: '14.000', x0: 300, x1: 370, y0: 100, y1: 120 },
    ]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]!.texto).toBe('Patacón pisao 14.000');
  });

  it('las palabras vacías no cuentan', () => {
    expect(lineasDeLaFoto([p('  ', 40, 100), p('Arepa', 40, 100)])).toHaveLength(1);
  });

  it('sin palabras no hay renglones ni se revienta', () => {
    expect(lineasDeLaFoto([])).toEqual([]);
    expect(altoDelCuerpo([])).toBe(0);
  });
});

describe('el título se reconoce por el TAMAÑO', () => {
  it('un 40 % más grande que el cuerpo es un título', () => {
    expect(esTituloPorTamano(28, 20)).toBe(true);
  });

  it('unos píxeles de más NO lo son', () => {
    // Una línea con tildes o paréntesis mide algo más que sus vecinas; si eso
    // bastara, cualquier plato con «ñ» se volvería una sección.
    expect(esTituloPorTamano(21, 20)).toBe(false);
  });

  it('sin medida no se decide por tamaño', () => {
    expect(esTituloPorTamano(0, 20)).toBe(false);
    expect(esTituloPorTamano(28, 0)).toBe(false);
  });
});

describe('leer la respuesta de Google Vision', () => {
  const respuesta = {
    responses: [{
      fullTextAnnotation: {
        text: 'HAMBURGUESAS\nSencilla 12.000',
        pages: [{
          blocks: [{
            paragraphs: [{
              words: [
                {
                  // Vision OMITE la coordenada cuando vale cero: leerla con
                  // `v.x!` daría NaN y tiraría la geometría de esta palabra.
                  boundingBox: { vertices: [{ y: 10 }, { x: 240, y: 10 }, { x: 240, y: 38 }, { y: 38 }] },
                  symbols: [{ text: 'H' }, { text: 'A' }, { text: 'M' }],
                },
                {
                  boundingBox: {
                    vertices: [{ x: 40, y: 60 }, { x: 140, y: 60 }, { x: 140, y: 80 }, { x: 40, y: 80 }],
                  },
                  symbols: [{ text: 'S' }, { text: 'e' }, { text: 'n' }],
                },
              ],
            }],
          }],
        }],
      },
    }],
  };

  it('saca cada palabra con su rectángulo', () => {
    const palabras = palabrasDeRespuestaVision(respuesta);
    expect(palabras).toHaveLength(2);
    expect(palabras[0]).toEqual({ texto: 'HAM', x0: 0, x1: 240, y0: 10, y1: 38 });
    expect(palabras[1]!.texto).toBe('Sen');
  });

  it('una respuesta sin geometría devuelve lista vacía, no un error', () => {
    // Pasa con el proveedor `fake` y pasaría si Vision cambiara el formato: el
    // lector tiene que caer al texto plano, no romperse.
    expect(palabrasDeRespuestaVision({ responses: [{ fullTextAnnotation: { text: 'x' } }] })).toEqual([]);
    expect(palabrasDeRespuestaVision({})).toEqual([]);
    expect(palabrasDeRespuestaVision(null)).toEqual([]);
  });
});
