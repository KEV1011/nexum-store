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
  /**
   * Cuántos grados se aparta su dirección de lectura de la de la carta. Solo
   * viene en las que se apartan más de `GIRO_MAX`: las etiquetas verticales
   * del borde («SHOTS», «MICHELADAS») y lo decorativo. No entran en los
   * renglones (ver `lineasDeLaFoto`).
   */
  giro?: number;
  /** Lo segura que está Vision de haber leído bien la palabra (0–1). */
  confianza?: number;
}

/** Un renglón ya armado, con lo que hace falta para juzgarlo. */
export interface LineaMedida {
  texto: string;
  /** Alto de la letra en píxeles. El dato que el texto plano no tiene. */
  alto: number;
  /** 0 = la columna más a la izquierda. */
  columna: number;
  /**
   * Las palabras que Vision leyó con DUDA (confianza baja). Solo esas se
   * pueden corregir como errata: «cereza» leída con seguridad es cereza, no
   * «cerveza» mal escrita. Ausente = Vision no mandó confianza.
   */
  dudosas?: string[];
}

/** La mediana, que es lo que se usa para «el cuerpo de la carta». */
function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[m - 1]! + orden[m]!) / 2 : orden[m]!;
}

/**
 * Por debajo de esta confianza una palabra se trata como «leída con duda».
 * Vision da 0,95–0,99 a lo que lee limpio; por debajo de 0,8 ya suele ser una
 * letra confundida.
 */
export const CONFIANZA_DUDOSA = 0.8;

/**
 * La palabra es un precio o parte de uno: «$», «12.000», «$12.000», «8mil».
 * Vision a veces manda el signo y el número como dos palabras.
 */
export function esFichaDePrecio(texto: string): boolean {
  const t = texto.trim();
  return /^\$$/.test(t)
    || /^\$?\s?\d{1,3}(?:[.,]\d{3})+$/.test(t)
    || /^\$\d{3,7}$/.test(t)
    || /^\d{4,7}$/.test(t)
    || /^\$?\d{1,3}(?:mil|k)$/i.test(t);
}

/** Puntuación suelta («/», «-», «|»): no dice nada de qué es la columna. */
function esNeutra(texto: string): boolean {
  return !/[\p{L}\p{N}]/u.test(texto);
}

/**
 * Agrupa en renglones lo que está a la misma altura.
 *
 * Dos palabras son del mismo renglón cuando sus franjas verticales se solapan
 * en más de la mitad: comparar el centro a secas junta la línea de un título
 * grande con la del plato de debajo, y comparar los bordes exactos parte un
 * renglón en dos en cuanto una tilde sube un píxel.
 */
function agruparEnRenglones<T extends { y0: number; y1: number }>(items: T[]): T[][] {
  const renglones: T[][] = [];
  for (const p of [...items].sort((a, b) => a.y0 - b.y0)) {
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
  return renglones;
}

/** El hueco mínimo entre dos columnas, para la letra y la página de la foto. */
function huecoDeColumna(palabras: PalabraOcr[]): number {
  const alto = mediana(palabras.map((p) => p.y1 - p.y0));
  const ancho = Math.max(...palabras.map((p) => p.x1)) - Math.min(...palabras.map((p) => p.x0));
  // Tres veces el alto de la letra es más que cualquier espacio entre palabras
  // y menos que cualquier canal entre columnas. El 6 % del ancho es el piso
  // para fotos muy grandes, donde el alto de la letra es pequeño en
  // proporción.
  return Math.max(alto * 3, ancho * 0.06);
}

interface Reparto {
  bandas: Array<{ x0: number; x1: number }>;
  /** La columna de cada palabra, en el mismo orden que la entrada. */
  columna: number[];
}

/**
 * Las columnas de la página y a cuál pertenece cada palabra.
 *
 * Se corta donde hay un CANAL vertical: una franja ancha que casi ningún
 * renglón cruza. «Casi», y no «ninguno», es la diferencia con la versión
 * anterior y la que importa: el pie centrado de una carta a dos columnas
 * («BAJOS $8.000 / ALTOS $10.000») o el nombre del restaurante arriba
 * atraviesan el canal, y con una sola palabra cruzándolo las dos columnas se
 * fundían en una — los tragos de la izquierda y los de la derecha salían
 * intercalados, renglón por renglón. Ahora un renglón que cruza no tapa el
 * canal; se queda entero en la columna donde empieza.
 *
 * Y UNA COLUMNA DE SOLO PRECIOS NO ES UNA COLUMNA. En la carta más común de
 * todas el precio va alineado a la derecha, lejos del nombre; si el hueco es
 * ancho, los precios quedaban en «otra columna» que se leía DESPUÉS de todos
 * los platos — y cada precio salía como un producto llamado «$12.000». Esa
 * banda se devuelve a la columna de su izquierda, donde cada precio encuentra
 * su renglón por la altura.
 */
function repartirEnColumnas(palabras: PalabraOcr[]): Reparto {
  if (palabras.length === 0) return { bandas: [], columna: [] };
  const umbral = huecoDeColumna(palabras);
  const minX = Math.min(...palabras.map((p) => p.x0));
  const maxX = Math.max(...palabras.map((p) => p.x1));

  // Los renglones de TODA la página, partidos en tramos donde hay un hueco.
  const indices = palabras.map((p, i) => ({ ...p, i }));
  const globales = agruparEnRenglones(indices);
  const tramos: Array<{ x0: number; x1: number; renglon: number; idx: number[] }> = [];
  globales.forEach((r, ri) => {
    const orden = [...r].sort((a, b) => a.x0 - b.x0);
    let actual: { x0: number; x1: number; renglon: number; idx: number[] } | null = null;
    for (const w of orden) {
      if (actual && w.x0 - actual.x1 <= umbral) {
        actual.x1 = Math.max(actual.x1, w.x1);
        actual.idx.push(w.i);
      } else {
        actual = { x0: w.x0, x1: w.x1, renglon: ri, idx: [w.i] };
        tramos.push(actual);
      }
    }
  });

  // Cuántos renglones pueden cruzar un canal sin taparlo: uno o el 15 %, y
  // nunca un tercio o más (entonces no es un canal, es el texto).
  const n = globales.length;
  const tope = Math.max(1, Math.floor(n * 0.15));
  const cruzan = (x: number) => tramos.filter((t) => t.x0 < x && t.x1 > x).length;

  // Las franjas donde cruzan pocos: se recorren los bordes de los tramos.
  const bordes = [...new Set(tramos.flatMap((t) => [t.x0, t.x1]))].sort((a, b) => a - b);
  const canales: Array<{ x0: number; x1: number }> = [];
  for (let k = 0; k + 1 < bordes.length; k++) {
    const a = bordes[k]!;
    const b = bordes[k + 1]!;
    const c = cruzan((a + b) / 2);
    if (c > tope || c * 3 >= n) continue;
    const ultimo = canales[canales.length - 1];
    if (ultimo && ultimo.x1 === a) ultimo.x1 = b;
    else canales.push({ x0: a, x1: b });
  }
  const renglonesA = (lado: (p: PalabraOcr) => boolean) =>
    new Set(globales.flatMap((r, ri) => (r.some(lado) ? [ri] : []))).size;
  const cortes = canales.filter((c) => c.x1 - c.x0 > umbral
    && c.x0 > minX && c.x1 < maxX
    && renglonesA((p) => p.x1 <= c.x0) >= 2
    && renglonesA((p) => p.x0 >= c.x1) >= 2);

  let bandas: Array<{ x0: number; x1: number }> = [];
  let desde = minX;
  for (const c of cortes) {
    bandas.push({ x0: desde, x1: c.x0 });
    desde = c.x1;
  }
  bandas.push({ x0: desde, x1: maxX });

  // Cada tramo va a la columna donde EMPIEZA: un renglón que cruza el canal
  // se lee entero, en la columna por la que una persona empezaría a leerlo.
  const bandaDe = (x: number) => {
    let b = 0;
    for (let j = 0; j < bandas.length; j++) if (bandas[j]!.x0 <= x + 0.5) b = j;
    return b;
  };
  const columna = new Array<number>(palabras.length).fill(0);
  for (const t of tramos) for (const i of t.idx) columna[i] = bandaDe(t.x0);

  // Las bandas de solo precios vuelven a la columna de su izquierda.
  for (let b = bandas.length - 1; b >= 1; b--) {
    const suyas = palabras.filter((p, i) => columna[i] === b && !esNeutra(p.texto));
    if (suyas.length === 0) continue;
    const precios = suyas.filter((p) => esFichaDePrecio(p.texto)).length;
    if (precios / suyas.length < 0.7) continue;
    for (let i = 0; i < columna.length; i++) {
      if (columna[i]! >= b) columna[i] = columna[i]! - 1;
    }
    bandas[b - 1] = { x0: bandas[b - 1]!.x0, x1: bandas[b]!.x1 };
    bandas = bandas.filter((_, j) => j !== b);
  }
  return { bandas, columna };
}

/**
 * Las bandas horizontales que ocupan las columnas de la página.
 *
 * Una banda de solo precios no cuenta como columna: es la columna de precios
 * de la de su izquierda (ver `repartirEnColumnas`).
 */
export function bandasDeColumna(palabras: PalabraOcr[]): Array<{ x0: number; x1: number }> {
  return repartirEnColumnas(palabras).bandas;
}

/**
 * ¿Este renglón tiene forma de NOMBRE de plato? Sin coma, sin la raya de una
 * lista de ingredientes, empezando en mayúscula y corto.
 */
function formaDeNombre(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (/^[-–—(,;.]/.test(t)) return false;
  if (/\p{Ll}/u.test(t.charAt(0))) return false;
  if (t.includes(',') || /\s[-–—]\s/.test(t)) return false;
  return t.split(/\s+/).length <= 6;
}

/** Una etiqueta escrita de lado en el borde de la carta. */
interface EtiquetaLateral {
  texto: string;
  /** El alto de su letra (su grosor, puesta de lado). */
  grosor: number;
  y0: number;
  y1: number;
  xc: number;
}

/**
 * Las etiquetas verticales del borde: «SHOTS», «MICHELADAS».
 *
 * En la carta son el NOMBRE de la sección, escrito de lado junto a sus platos.
 * Antes entraban al cálculo del ángulo —una palabra larga de lado bastaba para
 * torcer la lectura unos grados y mezclar los renglones— y después se colaban
 * en un renglón cualquiera, partiendo la sección por la mitad. Ahora se
 * reconocen aparte: casi perpendiculares a la lectura, solo letras, cortas.
 * Lo demás que va torcido (sellos, garabatos) se descarta.
 */
function etiquetasLaterales(palabras: PalabraOcr[]): EtiquetaLateral[] {
  const candidatas = palabras.filter((p) => p.giro !== undefined
    && Math.abs(Math.abs(p.giro) - 90) <= 20
    && /^[\p{L}][\p{L}'’&.-]*$/u.test(p.texto.trim()));
  const grupos: PalabraOcr[][] = [];
  for (const p of [...candidatas].sort((a, b) => a.y0 - b.y0)) {
    const grosor = p.x1 - p.x0;
    const g = grupos.find((gr) => gr.some((q) => q.x0 < p.x1 && p.x0 < q.x1
      && Math.max(q.y0, p.y0) - Math.min(q.y1, p.y1) <= grosor * 2));
    if (g) g.push(p); else grupos.push([p]);
  }
  const salida: EtiquetaLateral[] = [];
  for (const g of grupos) {
    // De abajo arriba (giro negativo) se lee empezando por la de más abajo.
    const orden = [...g].sort((a, b) => ((a.giro ?? 0) < 0 ? b.y0 - a.y0 : a.y0 - b.y0));
    const texto = orden.map((p) => p.texto.trim()).join(' ');
    const letras = texto.replace(/[^\p{L}]/gu, '');
    if (letras.length < 3 || orden.length > 4) continue;
    salida.push({
      texto,
      grosor: mediana(g.map((p) => p.x1 - p.x0)),
      y0: Math.min(...g.map((p) => p.y0)),
      y1: Math.max(...g.map((p) => p.y1)),
      xc: (Math.min(...g.map((p) => p.x0)) + Math.max(...g.map((p) => p.x1))) / 2,
    });
  }
  return salida;
}

/**
 * Los renglones de la foto, columna por columna y de arriba abajo.
 *
 * LOS PRECIOS SE REPARTEN APARTE. Se arman los renglones con las palabras que
 * no son precio, y después cada precio va al renglón que se le solapa y tiene
 * FORMA DE NOMBRE. Así un precio un poco más bajo que su plato —porque va en
 * letra más grande, o porque la foto está algo torcida— no se le pega a la
 * línea de ingredientes de debajo: antes «Limón, sal y hielo $12.000» salía
 * como un plato y la michelada se quedaba sin precio.
 */
export function lineasDeLaFoto(palabras: PalabraOcr[]): LineaMedida[] {
  const todas = palabras.filter((p) => (p.texto ?? '').trim() !== '');
  // Lo que va de lado no es un renglón: o es una etiqueta (que se vuelve
  // título más abajo) o es decoración.
  const limpias = todas.filter((p) => p.giro === undefined);
  if (limpias.length === 0) return [];

  const { bandas, columna } = repartirEnColumnas(limpias);

  type Renglon = { palabras: PalabraOcr[]; cima: number; pie: number };
  const porColumna: Renglon[][] = [];
  for (let c = 0; c < Math.max(1, bandas.length); c++) {
    const dela = limpias.filter((_, i) => columna[i] === c);
    const fichas = dela.filter((p) => esFichaDePrecio(p.texto) || esNeutra(p.texto));
    const texto = dela.filter((p) => !fichas.includes(p));
    const renglones: Renglon[] = agruparEnRenglones(texto).map((r) => ({
      palabras: r,
      cima: Math.min(...r.map((w) => w.y0)),
      pie: Math.max(...r.map((w) => w.y1)),
    }));
    const texto0 = (r: Renglon) => [...r.palabras].sort((a, b) => a.x0 - b.x0).map((w) => w.texto).join(' ');
    const sueltas: PalabraOcr[] = [];
    for (const p of fichas) {
      const solapes = renglones
        .map((r, k) => ({ r, k, s: Math.min(r.pie, p.y1) - Math.max(r.cima, p.y0) }))
        .filter((x) => x.s > 0);
      if (solapes.length === 0) { sueltas.push(p); continue; }
      const nombres = solapes.filter((x) => formaDeNombre(texto0(x.r)));
      let elegido = (nombres.length > 0 ? nombres : solapes).sort((a, b) => b.s - a.s)[0]!;
      // Solapa solo con los ingredientes: si justo encima está el nombre del
      // plato, el precio es suyo («un poco más abajo» de su renglón).
      if (nombres.length === 0) {
        const arriba = renglones[elegido.k - 1];
        const alto = Math.max(1, p.y1 - p.y0);
        if (arriba && formaDeNombre(texto0(arriba))
          && !arriba.palabras.some((w) => esFichaDePrecio(w.texto))
          && p.y0 - arriba.pie <= alto * 1.5) {
          elegido = { r: arriba, k: elegido.k - 1, s: 0 };
        }
      }
      elegido.r.palabras.push(p);
      elegido.r.pie = Math.max(elegido.r.pie, p.y1);
      elegido.r.cima = Math.min(elegido.r.cima, p.y0);
    }
    for (const r of agruparEnRenglones(sueltas)) {
      renglones.push({ palabras: r, cima: Math.min(...r.map((w) => w.y0)), pie: Math.max(...r.map((w) => w.y1)) });
    }
    porColumna.push(renglones.sort((a, b) => a.cima - b.cima));
  }

  const salida: LineaMedida[] = [];
  const medir = (r: PalabraOcr[], c: number): LineaMedida => {
    const orden = [...r].sort((a, b) => a.x0 - b.x0);
    // El alto se mide con las palabras de texto: un signo «$» o una raya
    // miden otra cosa.
    const conLetra = orden.filter((w) => /\p{L}/u.test(w.texto));
    const dudosas = orden
      .filter((w) => w.confianza !== undefined && w.confianza < CONFIANZA_DUDOSA)
      .map((w) => w.texto.trim());
    const hayConfianza = orden.some((w) => w.confianza !== undefined);
    return {
      texto: orden.map((w) => w.texto.trim()).filter(Boolean).join(' ').replace(/\s{2,}/g, ' '),
      alto: mediana((conLetra.length > 0 ? conLetra : orden).map((w) => w.y1 - w.y0)),
      columna: c,
      ...(hayConfianza && { dudosas }),
    };
  };
  porColumna.forEach((renglones, c) => {
    for (const r of renglones) salida.push(medir(r.palabras, c));
  });

  return conEtiquetas(salida, porColumna, todas, bandas);
}

/**
 * Pone cada etiqueta lateral como TÍTULO al principio de los renglones que
 * acompaña: los que le quedan más cerca en altura, en cada columna.
 */
function conEtiquetas(
  lineas: LineaMedida[],
  porColumna: Array<Array<{ cima: number; pie: number }>>,
  todas: PalabraOcr[],
  bandas: Array<{ x0: number; x1: number }>,
): LineaMedida[] {
  const etiquetas = etiquetasLaterales(todas);
  if (etiquetas.length === 0) return lineas;
  const cuerpo = mediana(lineas.map((l) => l.alto).filter((a) => a > 0));
  const salida: LineaMedida[] = [];
  let k = 0;
  porColumna.forEach((renglones, c) => {
    const banda = bandas[c] ?? { x0: 0, x1: 0 };
    let vigente: EtiquetaLateral | null = null;
    for (const r of renglones) {
      const centro = (r.cima + r.pie) / 2;
      const cerca = etiquetas
        .map((e) => ({
          e,
          d: (centro < e.y0 ? e.y0 - centro : centro > e.y1 ? centro - e.y1 : 0)
            + 0.001 * Math.min(Math.abs(e.xc - banda.x0), Math.abs(e.xc - banda.x1)),
        }))
        .sort((a, b) => a.d - b.d)[0]!.e;
      if (cerca !== vigente) {
        vigente = cerca;
        salida.push({
          texto: cerca.texto,
          // Un título: aunque la etiqueta vaya en letra del cuerpo, lo que es
          // es el nombre de la sección.
          alto: Math.max(cerca.grosor, cuerpo * (MARGEN_TITULO + 0.1)),
          columna: c,
        });
      }
      salida.push(lineas[k++]!);
    }
  });
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
                confidence?: number;
              }>;
            }>;
          }>;
        }>;
      };
    }>;
  };

  const crudas: Array<{ texto: string; v: Punto[]; confianza?: number }> = [];
  for (const pagina of raiz.responses?.[0]?.fullTextAnnotation?.pages ?? []) {
    for (const bloque of pagina.blocks ?? []) {
      for (const parrafo of bloque.paragraphs ?? []) {
        for (const palabra of parrafo.words ?? []) {
          const texto = (palabra.symbols ?? []).map((s) => s.text ?? '').join('');
          const v = palabra.boundingBox?.vertices ?? [];
          if (!texto.trim() || v.length === 0) continue;
          crudas.push({
            texto,
            v: v.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })),
            ...(typeof palabra.confidence === 'number' && { confianza: palabra.confidence }),
          });
        }
      }
    }
  }
  return enderezar(crudas);
}

interface Punto { x: number; y: number }

/**
 * Lo que puede apartarse una palabra de la dirección de la carta y seguir
 * contando como parte de ella. Más torcida que esto es una etiqueta de lado
 * o decoración.
 */
export const GIRO_MAX = 20;

/** La dirección de lectura de una palabra, en radianes. Null sin vértices útiles. */
function anguloDePalabra(v: Punto[]): number | null {
  if (v.length < 2) return null;
  const dx = v[1]!.x - v[0]!.x;
  const dy = v[1]!.y - v[0]!.y;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx);
}

/** Diferencia entre dos ángulos, en grados, entre -180 y 180. */
function diferenciaEnGrados(a: number, b: number): number {
  let d = ((a - b) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * La dirección en la que se LEE la carta en la foto, en radianes.
 *
 * Vision entrega los cuatro vértices de cada palabra en el orden en que se lee
 * (arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda «según el
 * texto», no según la imagen). Así que del vértice 0 al 1 va la dirección de
 * lectura de ESA palabra.
 *
 * SE TOMA LA DIRECCIÓN DOMINANTE, NO EL PROMEDIO. Antes se promediaban todas,
 * y una etiqueta vertical del borde («MICHELADAS», diez letras de lado) bastaba
 * para torcer la lectura dos o tres grados: con la página girada esos grados,
 * el precio de la derecha caía en el renglón de abajo y los tragos de dos
 * columnas salían intercalados. Ahora se busca la dirección en la que coincide
 * la mayor parte del texto (pesada por el largo de cada palabra: las de una
 * letra dan una dirección poco fiable) y se promedia SOLO lo que está a menos
 * de `GIRO_MAX` de ella.
 *
 * Devuelve 0 cuando no hay con qué decidirlo.
 */
export function anguloDeLectura(palabras: Array<{ texto: string; v: Punto[] }>): number {
  const dirs: Array<{ a: number; peso: number }> = [];
  for (const p of palabras) {
    const a = anguloDePalabra(p.v);
    if (a === null) continue;
    dirs.push({ a, peso: Math.max(1, p.texto.trim().length) });
  }
  if (dirs.length === 0) return 0;
  // La dirección con más texto alrededor.
  let mejor = dirs[0]!;
  let mejorPeso = -1;
  for (const d of dirs) {
    let peso = 0;
    for (const o of dirs) if (Math.abs(diferenciaEnGrados(o.a, d.a)) <= GIRO_MAX) peso += o.peso;
    if (peso > mejorPeso) { mejorPeso = peso; mejor = d; }
  }
  let sx = 0;
  let sy = 0;
  for (const o of dirs) {
    if (Math.abs(diferenciaEnGrados(o.a, mejor.a)) > GIRO_MAX) continue;
    sx += Math.cos(o.a) * o.peso;
    sy += Math.sin(o.a) * o.peso;
  }
  if (sx === 0 && sy === 0) return 0;
  return Math.atan2(sy, sx);
}

/**
 * Las palabras con su rectángulo en el marco DEL TEXTO, no de la imagen.
 *
 * EL REPORTE: «se sube una carta y no lee nada de manera eficaz» — y salían
 * renglones como «$ $ $ 23.000 23.000 21.000 de SANDWICH toque vegetales…».
 * Todo lo de abajo agrupa renglones por la ALTURA de las palabras y columnas
 * por su posición horizontal, o sea que daba por hecho que la carta está
 * derecha en la foto. Con la foto de lado —el teléfono girado, o una carta
 * apaisada fotografiada en vertical— los renglones de verdad quedan
 * VERTICALES: todos ocupan la misma franja de altura, así que se fundían en
 * uno, y ordenarlos de izquierda a derecha ponía primero la columna de los
 * signos de pesos. Una foto apenas torcida hacía lo mismo a menor escala:
 * el final de un renglón se metía en el siguiente.
 *
 * Se gira todo para que la lectura quede horizontal antes de agrupar. Con la
 * carta derecha (lo normal) no se toca nada: el giro se omite por debajo de
 * medio grado, y así el rectángulo es exactamente el que mandó Vision.
 */
export function enderezar(palabras: Array<{ texto: string; v: Punto[]; confianza?: number }>): PalabraOcr[] {
  const angulo = anguloDeLectura(palabras);
  const recto = Math.abs(angulo) < (0.5 * Math.PI) / 180;
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  return palabras.map(({ texto, v, confianza }) => {
    const pts = recto
      ? v
      : v.map((p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const propio = anguloDePalabra(v);
    const giro = propio === null ? 0 : diferenciaEnGrados(propio, angulo);
    return {
      texto,
      x0: Math.min(...xs), x1: Math.max(...xs),
      y0: Math.min(...ys), y1: Math.max(...ys),
      // Las torcidas se marcan: no entran en los renglones (`lineasDeLaFoto`).
      ...(Math.abs(giro) > GIRO_MAX && { giro: Math.round(giro) }),
      ...(confianza !== undefined && { confianza }),
    };
  });
}
