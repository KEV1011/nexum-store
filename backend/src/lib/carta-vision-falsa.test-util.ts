/**
 * Arma una respuesta de Google Vision (`DOCUMENT_TEXT_DETECTION`) a partir de
 * una carta descrita en su propio marco: dónde va cada frase, de qué tamaño es
 * la letra, y si alguna va de lado (las etiquetas verticales del borde).
 *
 * Sirve para reproducir cartas reales sin la foto: los vértices de cada palabra
 * van en el ORDEN DE LECTURA (arriba-izq, arriba-der, abajo-der, abajo-izq
 * según el texto), que es como los manda Vision y de lo que depende
 * `enderezar`. Solo lo importan las pruebas.
 */

export interface FraseFalsa {
  texto: string;
  /** Posición de la esquina superior izquierda, en el marco de la carta. */
  x: number;
  y: number;
  /** Alto de la letra en píxeles. El cuerpo de una carta va en 22. */
  alto?: number;
  /**
   * Dirección de lectura en grados respecto a la carta: 0 = normal,
   * -90 = de abajo arriba (la etiqueta vertical típica del borde).
   */
  angulo?: number;
  /** Confianza que Vision le daría a cada palabra (0–1). */
  confianza?: number;
}

type Vertice = { x: number; y: number };

/**
 * La respuesta de Vision para la carta, toda ella girada `inclinacion` grados
 * en la foto (el teléfono nunca está perfectamente derecho).
 */
export function respuestaDeVision(frases: FraseFalsa[], inclinacion = 0) {
  const t = (inclinacion * Math.PI) / 180;
  const foto = (p: Vertice): Vertice => ({
    x: Math.round(3000 + p.x * Math.cos(t) - p.y * Math.sin(t)),
    y: Math.round(3000 + p.x * Math.sin(t) + p.y * Math.cos(t)),
  });
  const words: Array<{
    boundingBox: { vertices: Vertice[] };
    symbols: Array<{ text: string }>;
    confidence?: number;
  }> = [];
  for (const f of frases) {
    const alto = f.alto ?? 22;
    const a = ((f.angulo ?? 0) * Math.PI) / 180;
    // Dirección de lectura y la perpendicular (hacia abajo del texto).
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const paso = (alto / 22) * 14;
    let avance = 0;
    for (const w of f.texto.split(' ').filter(Boolean)) {
      const largo = w.length * paso;
      const o = { x: f.x + dx * avance, y: f.y + dy * avance };
      const v0 = o;
      const v1 = { x: o.x + dx * largo, y: o.y + dy * largo };
      const v2 = { x: v1.x + nx * alto, y: v1.y + ny * alto };
      const v3 = { x: o.x + nx * alto, y: o.y + ny * alto };
      words.push({
        boundingBox: { vertices: [foto(v0), foto(v1), foto(v2), foto(v3)] },
        symbols: w.split('').map((c) => ({ text: c })),
        ...(f.confianza !== undefined ? { confidence: f.confianza } : {}),
      });
      avance += largo + paso;
    }
  }
  return {
    responses: [{
      fullTextAnnotation: { text: '', pages: [{ blocks: [{ paragraphs: [{ words }] }] }] },
    }],
  };
}

// ── Las cartas reales del usuario (octubre de 2026), reconstruidas ──────────
//
// Reconstruidas de las fotos que mandó el dueño con su disposición: lo que se
// reproduce es DÓNDE va cada cosa (columnas, etiqueta de lado, precio a la
// derecha, nota al pie), que es lo que rompía la lectura.

/**
 * SHOTS: dos columnas de tragos sin precio, la etiqueta «SHOTS» de lado en el
 * borde izquierdo, y al pie, centrado y cruzando las dos columnas, el precio
 * de TODA la sección: «BAJOS $8.000 / ALTOS $10.000».
 */
export const CARTA_SHOTS: FraseFalsa[] = [
  { texto: 'SHOTS', x: -90, y: 330, alto: 48, angulo: -90 },
  { texto: 'Tequila', x: 0, y: 0 },
  { texto: 'Aguardiente', x: 0, y: 60 },
  { texto: 'Ron blanco', x: 0, y: 120 },
  { texto: 'Ginebra', x: 0, y: 180 },
  { texto: 'Whisky', x: 560, y: 0 },
  { texto: 'Vodka', x: 560, y: 60 },
  { texto: 'Jagermeister', x: 560, y: 120 },
  { texto: 'Brandy', x: 560, y: 180 },
  { texto: 'BAJOS $8.000 / ALTOS $10.000', x: 200, y: 270, alto: 26 },
];

/**
 * MICHELADAS: nombre y precio en el mismo renglón (el precio alineado a la
 * derecha), los ingredientes debajo —en dos casos separados con guiones y
 * partidos en dos renglones—, la etiqueta «MICHELADAS» de lado y una nota
 * entre paréntesis al final.
 */
export const CARTA_MICHELADAS: FraseFalsa[] = [
  { texto: 'MICHELADAS', x: -90, y: 520, alto: 48, angulo: -90 },
  { texto: 'Michelada clásica', x: 0, y: 0 },
  { texto: '$12.000', x: 620, y: 0 },
  { texto: 'Limón, sal y hielo', x: 0, y: 30, alto: 18 },
  { texto: 'Michelada de mango', x: 0, y: 80 },
  { texto: '$14.000', x: 620, y: 80 },
  { texto: 'Mango biche - sal - limón - zumo', x: 0, y: 110, alto: 18 },
  { texto: 'de naranja - tajín - chamoy', x: 0, y: 136, alto: 18 },
  { texto: 'Michelada de cereza', x: 0, y: 190 },
  { texto: '$15.000', x: 620, y: 190 },
  { texto: 'Cereza macerada - limón - sal', x: 0, y: 220, alto: 18 },
  { texto: 'Michelada maracuyá', x: 0, y: 270 },
  { texto: '$14.000', x: 620, y: 270 },
  { texto: 'Maracuyá salteada en azúcar - limón', x: 0, y: 300, alto: 18 },
  { texto: '(No olvides sumar esta michelada', x: 0, y: 370, alto: 18 },
  { texto: 'a tu soda o cerveza preferida)', x: 0, y: 396, alto: 18 },
];
