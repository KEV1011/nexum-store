/**
 * «Se leyó mal»: lo que se guarda de la respuesta del lector y de quién es.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { altoDelCuerpo, esTituloPorTamano, lineasDeLaFoto, palabrasDeRespuestaVision } from './carta-geometria';
import { parsearCartaMedida } from './carta-foto';
import { compactarRespuestaVision, guardarLectura, lecturaDe, olvidarLecturas } from './carta-reporte';
import { CARTA_SHOTS, respuestaDeVision } from './carta-vision-falsa.test-util';

afterEach(() => olvidarLecturas());

/** La respuesta de Vision con lo que de verdad trae y el lector NO usa. */
function conPesoDeMas(r: ReturnType<typeof respuestaDeVision>) {
  const copia = JSON.parse(JSON.stringify(r));
  for (const w of copia.responses[0].fullTextAnnotation.pages[0].blocks[0].paragraphs[0].words) {
    w.property = { detectedLanguages: [{ languageCode: 'es' }] };
    w.confidence = 0.97;
    w.symbols = w.symbols.map((s: { text: string }) => ({
      ...s,
      boundingBox: { vertices: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }] },
      confidence: 0.99,
    }));
  }
  copia.responses[0].textAnnotations = [{ description: 'todo el texto otra vez' }];
  return copia;
}

describe('la respuesta que se guarda se lee igual que la de verdad', () => {
  it('el lector da EXACTAMENTE lo mismo con la compactada', () => {
    const real = conPesoDeMas(respuestaDeVision(CARTA_SHOTS, 1.5));
    const guardada = compactarRespuestaVision(real);
    expect(palabrasDeRespuestaVision(guardada)).toEqual(palabrasDeRespuestaVision(real));
    const leer = (r: unknown) => {
      const m = lineasDeLaFoto(palabrasDeRespuestaVision(r));
      return parsearCartaMedida(m, altoDelCuerpo(m), esTituloPorTamano);
    };
    expect(leer(guardada)).toEqual(leer(real));
  });

  it('y pesa menos: sin el rectángulo de cada letra', () => {
    const real = conPesoDeMas(respuestaDeVision(CARTA_SHOTS));
    const guardada = JSON.stringify(compactarRespuestaVision(real));
    expect(guardada.length).toBeLessThan(JSON.stringify(real).length / 2);
    expect(guardada).not.toContain('detectedLanguages');
  });

  it('sin respuesta no hay nada que guardar', () => {
    expect(compactarRespuestaVision(null)).toBeNull();
    expect(compactarRespuestaVision({ responses: [{}] })).toBeNull();
  });
});

describe('la lectura en memoria es del negocio que la hizo', () => {
  it('otro negocio con el mismo código no se la lleva', () => {
    guardarLectura('abc', { businessId: 'b1', crudo: { x: 1 }, lectura: { lineas: [] } });
    expect(lecturaDe('abc', 'b1')?.crudo).toEqual({ x: 1 });
    expect(lecturaDe('abc', 'b2')).toBeNull();
  });

  it('se olvida pasadas dos horas', () => {
    const t0 = 1_000_000;
    guardarLectura('abc', { businessId: 'b1', crudo: null, lectura: null }, t0);
    expect(lecturaDe('abc', 'b1', t0 + 60 * 60 * 1000)).not.toBeNull();
    expect(lecturaDe('abc', 'b1', t0 + 3 * 60 * 60 * 1000)).toBeNull();
  });
});
