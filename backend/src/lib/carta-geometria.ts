// ── Dónde está cada palabra en la foto de la carta ───────────────────────────
//
// EL REPORTE: «cada restaurante tiene sección de hamburguesas, bebidas, etc., y
// la IA no reconoce de manera efectiva cuando el cliente sube el menú».
//
// LA CAUSA, medida: el lector solo usaba `fullTextAnnotation.text`, o sea el
// texto PLANO, y una carta impresa casi nunca es una columna. En una carta a dos
// columnas ese texto trae el renglón de la izquierda y el de la derecha pegados
// en la misma línea —«Hamburguesas            Bebidas», «Sencilla 12.000
// Gaseosa 4.000»— y entonces pasan las dos cosas que el dueño ve: el título de
// sección desaparece (la línea trae dos títulos y ninguno parece un título) y
// un plato se queda con el precio del de al lado.
//
// Y FALTABA EL OTRO DATO QUE LA CARTA SÍ DA: el TAMAÑO de la letra. En papel un
// título no se reconoce por ser corto, se reconoce por ser más grande. Con el
// texto plano eso no existe, y por eso la única pista disponible era la
// longitud — que falla con «PLATOS FUERTES Y ESPECIALES DE LA CASA» (largo, y
// es un título) y con «Pechuga» (corta, y es un plato al que no se le leyó el
// precio).
//
// LO QUE ESTO HACE: agrupa las palabras en columnas por los huecos verticales
// de la página, arma los renglones DENTRO de cada columna, y mide el alto de
// cada renglón. Nada más: decidir qué es título sigue siendo de `carta-foto.ts`,
// y nada de esto publica un producto — la vista previa obligatoria no se toca.
//
// LAS COLUMNAS SALEN DE LOS HUECOS, no de un número fijo de columnas: hay
// cartas a una, a dos y a tres, y suponer dos partiría en dos una carta a una
// sola columna con los precios alineados a la derecha, que es el caso más
// frecuente de todos.

/** Una palabra leída, con su rectángulo en píxeles de la imagen. */
export interface PalabraOcr {
  texto: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Un renglón ya armado, con lo que hace falta para juzgarlo. */
export interface LineaMedida {
  texto: string;
  /** Alto de la letra en píxeles. El dato que el texto plano no tiene. */
  alto: number;
  /** 0 = la columna más a la izquierda. */
  columna: number;
}

/** La mediana, que es lo que se usa para «el cuerpo de la carta». */
function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[m - 1]! + orden[m]!) / 2 : orden[m]!;
}

/**
 * Las bandas horizontales que ocupan las columnas de la página.
 *
 * Se juntan los rectángulos de todas las palabras y se corta donde queda un
 * hueco vertical ancho. El umbral va en proporción al ancho de la página Y al
 * alto de la letra: en una carta el espacio entre dos columnas es siempre mucho
 * mayor que el que hay entre dos palabras de la misma frase, pero cuánto es
 * «mucho» depende del tamaño al que esté escaneada la foto.
 */
export function bandasDeColumna(palabras: PalabraOcr[]): Array<{ x0: number; x1: number }> {
  if (palabras.length === 0) return [];
  const alto = mediana(palabras.map((p) => p.y1 - p.y0));
  const ancho = Math.max(...palabras.map((p) => p.x1)) - Math.min(...palabras.map((p) => p.x0));
  // Tres veces el alto de la letra es más que cualquier espacio entre palabras
  // y menos que cualquier canal entre columnas. El 6 % del ancho es el piso
  // para fotos muy grandes, donde el alto de la letra es pequeño en
  // proporción.
  const umbral = Math.max(alto * 3, ancho * 0.06);

  const trozos = [...palabras]
    .map((p) => ({ x0: p.x0, x1: p.x1 }))
    .sort((a, b) => a.x0 - b.x0);

  const bandas: Array<{ x0: number; x1: number }> = [];
  for (const t of trozos) {
    const ultima = bandas[bandas.length - 1];
    if (ultima && t.x0 - ultima.x1 <= umbral) {
      ultima.x1 = Math.max(ultima.x1, t.x1);
    } else {
      bandas.push({ x0: t.x0, x1: t.x1 });
    }
  }
  return bandas;
}

/**
 * Los renglones de la foto, columna por columna y de arriba abajo.
 *
 * Dos palabras son del mismo renglón cuando sus franjas verticales se solapan
 * en más de la mitad: comparar el centro a secas junta la línea de un título
 * grande con la del plato de debajo, y comparar los bordes exactos parte un
 * renglón en dos en cuanto una tilde sube un píxel.
 */
export function lineasDeLaFoto(palabras: PalabraOcr[]): LineaMedida[] {
  const limpias = palabras.filter((p) => (p.texto ?? '').trim() !== '');
  if (limpias.length === 0) return [];

  const bandas = bandasDeColumna(limpias);
  const columnaDe = (p: PalabraOcr): number => {
    const centro = (p.x0 + p.x1) / 2;
    const i = bandas.findIndex((b) => centro >= b.x0 && centro <= b.x1);
    // Una palabra que cae en un hueco (un título centrado que cruza el canal)
    // se queda en la columna más cercana por la izquierda: así se lee donde
    // empieza, que es por donde la leería una persona.
    if (i >= 0) return i;
    let cerca = 0;
    for (let j = 0; j < bandas.length; j++) if (bandas[j]!.x0 <= centro) cerca = j;
    return cerca;
  };

  const salida: LineaMedida[] = [];
  for (let c = 0; c < Math.max(1, bandas.length); c++) {
    const dela = limpias.filter((p) => columnaDe(p) === c).sort((a, b) => a.y0 - b.y0);
    const renglones: PalabraOcr[][] = [];
    for (const p of dela) {
      const ultimo = renglones[renglones.length - 1];
      if (ultimo) {
        const alto = Math.max(1, mediana(ultimo.map((w) => w.y1 - w.y0)));
        const cima = Math.min(...ultimo.map((w) => w.y0));
        const pie = Math.max(...ultimo.map((w) => w.y1));
        const solape = Math.min(pie, p.y1) - Math.max(cima, p.y0);
        if (solape > alto * 0.5) { ultimo.push(p); continue; }
      }
      renglones.push([p]);
    }
    for (const r of renglones) {
      const orden = [...r].sort((a, b) => a.x0 - b.x0);
      salida.push({
        texto: orden.map((w) => w.texto.trim()).filter(Boolean).join(' ').replace(/\s{2,}/g, ' '),
        alto: mediana(orden.map((w) => w.y1 - w.y0)),
        columna: c,
      });
    }
  }
  return salida;
}

/** El alto de la letra del cuerpo de la carta: la mediana de los renglones. */
export function altoDelCuerpo(lineas: LineaMedida[]): number {
  return mediana(lineas.map((l) => l.alto).filter((a) => a > 0));
}

/**
 * ¿Este renglón está escrito más grande que el cuerpo de la carta?
 *
 * El 18 % es el margen que distingue un título de la variación normal entre
 * renglones del mismo tamaño (una línea con tildes o con paréntesis mide unos
 * píxeles más). Por debajo de eso, decidirlo por tamaño sería marcar como
 * título cualquier plato con una «ñ».
 */
export const MARGEN_TITULO = 1.18;

export function esTituloPorTamano(alto: number, altoCuerpo: number): boolean {
  if (!(alto > 0) || !(altoCuerpo > 0)) return false;
  return alto >= altoCuerpo * MARGEN_TITULO;
}

/**
 * Las palabras de una respuesta de Google Vision (`DOCUMENT_TEXT_DETECTION`).
 *
 * Vision entrega páginas → bloques → párrafos → palabras → símbolos, y el
 * rectángulo de cada palabra en `boundingBox.vertices`. Un vértice puede venir
 * SIN una de sus coordenadas cuando vale cero —así viene en la respuesta real, y
 * leerlo con `v.x!` daría `NaN` y tiraría la geometría de toda esa palabra—, por
 * eso se trata la ausencia como 0.
 */
export function palabrasDeRespuestaVision(cuerpo: unknown): PalabraOcr[] {
  const raiz = (cuerpo ?? {}) as {
    responses?: Array<{
      fullTextAnnotation?: {
        pages?: Array<{
          blocks?: Array<{
            paragraphs?: Array<{
              words?: Array<{
                boundingBox?: { vertices?: Array<{ x?: number; y?: number }> };
                symbols?: Array<{ text?: string }>;
              }>;
            }>;
          }>;
        }>;
      };
    }>;
  };

  const salida: PalabraOcr[] = [];
  for (const pagina of raiz.responses?.[0]?.fullTextAnnotation?.pages ?? []) {
    for (const bloque of pagina.blocks ?? []) {
      for (const parrafo of bloque.paragraphs ?? []) {
        for (const palabra of parrafo.words ?? []) {
          const texto = (palabra.symbols ?? []).map((s) => s.text ?? '').join('');
          const v = palabra.boundingBox?.vertices ?? [];
          if (!texto.trim() || v.length === 0) continue;
          const xs = v.map((p) => p.x ?? 0);
          const ys = v.map((p) => p.y ?? 0);
          salida.push({
            texto,
            x0: Math.min(...xs), x1: Math.max(...xs),
            y0: Math.min(...ys), y1: Math.max(...ys),
          });
        }
      }
    }
  }
  return salida;
}
