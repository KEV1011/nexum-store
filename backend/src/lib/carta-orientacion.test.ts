/**
 * La carta se lee igual aunque la foto esté de lado, al revés o torcida.
 *
 * EL REPORTE: «se sube una carta y no lee nada de manera eficaz», con renglones
 * como «$ $ $ 23.000 23.000 21.000 de SANDWICH toque vegetales…». La lectura por
 * posición daba por hecho que la carta está derecha en la foto; de lado, los
 * renglones de verdad quedaban verticales y se fundían todos en uno.
 *
 * Aquí se arma una respuesta de Vision con la MISMA carta girada de varias
 * maneras —los vértices de cada palabra en el orden en que Vision los manda,
 * que es el de lectura— y se exige que todas den el mismo resultado.
 */
import { describe, expect, it } from 'vitest';

import { altoDelCuerpo, esTituloPorTamano, lineasDeLaFoto, palabrasDeRespuestaVision } from './carta-geometria';
import { calidadDeLectura, mejorLectura, parsearCarta, parsearCartaMedida } from './carta-foto';

/** La carta en su marco: columna, renglón, texto y si es título. */
const CARTA: Array<{ col: number; fila: number; texto: string; titulo?: boolean }> = [
  { col: 0, fila: 0, texto: 'SANDWICHES', titulo: true },
  { col: 0, fila: 1, texto: 'Sandwich criollo $19.000' },
  { col: 0, fila: 2, texto: 'Sandwich vegetal $21.000' },
  { col: 0, fila: 3, texto: 'Sandwich proteína $23.000' },
  { col: 1, fila: 0, texto: 'BEBIDAS', titulo: true },
  { col: 1, fila: 1, texto: 'Jugo natural $6.000' },
  { col: 1, fila: 2, texto: 'Gaseosa $3.500' },
];

/** La respuesta de Vision para esa carta girada `grados` en la foto. */
function respuestaGirada(grados: number) {
  const t = (grados * Math.PI) / 180;
  const girar = (x: number, y: number) => ({
    // Desplazada para que las coordenadas queden positivas, como en una imagen.
    x: Math.round(2000 + x * Math.cos(t) - y * Math.sin(t)),
    y: Math.round(2000 + x * Math.sin(t) + y * Math.cos(t)),
  });
  const words: Array<{ boundingBox: { vertices: Array<{ x: number; y: number }> }; symbols: Array<{ text: string }> }> = [];
  for (const r of CARTA) {
    const alto = r.titulo ? 34 : 22;
    let x = r.col * 700;
    const y = r.fila * 50;
    for (const w of r.texto.split(' ')) {
      const ancho = w.length * 14;
      words.push({
        boundingBox: {
          // Orden de lectura: arriba-izq, arriba-der, abajo-der, abajo-izq.
          vertices: [girar(x, y), girar(x + ancho, y), girar(x + ancho, y + alto), girar(x, y + alto)],
        },
        symbols: w.split('').map((c) => ({ text: c })),
      });
      x += ancho + 12;
    }
  }
  return { responses: [{ fullTextAnnotation: { text: '', pages: [{ blocks: [{ paragraphs: [{ words }] }] }] } }] };
}

function leer(grados: number) {
  const medidas = lineasDeLaFoto(palabrasDeRespuestaVision(respuestaGirada(grados)));
  return parsearCartaMedida(medidas, altoDelCuerpo(medidas), esTituloPorTamano);
}

describe('la orientación de la foto no cambia lo que se lee', () => {
  it.each([0, 90, 180, 270, 4, -6, 93])('girada %i°', (grados) => {
    const c = leer(grados);
    const plato = (n: string) => c.lineas.find((l) => l.nombre.toLowerCase().startsWith(n));
    expect(plato('sandwich criollo')?.precio).toBe(19000);
    expect(plato('sandwich vegetal')?.precio).toBe(21000);
    expect(plato('sandwich proteína')?.precio).toBe(23000);
    expect(plato('jugo natural')?.precio).toBe(6000);
    expect(plato('gaseosa')?.precio).toBe(3500);
    // Cada plato en su sección: las columnas no se mezclaron.
    expect(plato('gaseosa')?.seccion.toLowerCase()).toBe('bebidas');
    expect(plato('sandwich criollo')?.seccion.toLowerCase()).toBe('sandwiches');
    expect(c.lineas).toHaveLength(5);
  });
});

describe('se elige la mejor de las dos lecturas', () => {
  it('la que encontró más platos con precio', () => {
    const buena = parsearCarta('Arepa 8.000\nJugo 5.000');
    const mala = parsearCarta('Arepa Jugo 8.000 5.000 de');
    expect(calidadDeLectura(buena)).toBe(2);
    expect(mejorLectura(mala, buena)).toBe(buena);
  });

  it('en empate, la de posición (la primera)', () => {
    const a = parsearCarta('Arepa 8.000');
    const b = parsearCarta('Arepa 8.000');
    expect(mejorLectura(a, b)).toBe(a);
  });
});
