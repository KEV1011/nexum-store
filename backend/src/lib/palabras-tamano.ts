// ── Las palabras que nombran un TAMAÑO ──────────────────────────────────────
//
// Viven aparte porque las usan dos módulos que no pueden importarse entre sí:
// `carta-variantes` (que importa de `carta-foto`) las usa para agrupar
// «Picada pequeña / Picada grande», y `carta-foto` para reconocer el
// ENCABEZADO de una tabla de precios («Personal  Mediana  Grande  Familiar»).
// Con dos copias, un tamaño que una conoce y la otra no partiría la misma
// carta de dos maneras.

/**
 * Las palabras con las que una carta colombiana nombra un tamaño.
 *
 * Sin tildes y en minúscula: se comparan contra el token normalizado, para que
 * «PEQUEÑA» y «pequeña» casen igual.
 *
 * Lo que NO está, a propósito: «especial», «premium», «de la casa». Son otra
 * receta o un plato mejor, no el mismo en otro tamaño, y además «especial» es
 * una de las palabras con las que se titulan las secciones.
 */
export const PALABRAS_DE_TAMANO = [
  'pequena', 'pequeno', 'pequenita', 'peq', 'chica', 'chico', 'mini',
  'mediana', 'mediano', 'med', 'media', 'medio',
  'grande', 'grd', 'familiar', 'jumbo', 'gigante',
  'personal', 'individual', 'sencilla', 'sencillo', 'simple',
  'doble', 'triple', 'junior',
  'entera', 'entero', 'completa', 'completo',
  'cuarto', '1/4', '1/2', '3/4',
  // Como se abrevian en el ENCABEZADO de una tabla de precios («Pers. Med.
  // Gde. Fam.»): ahí no hay sitio para la palabra entera.
  'pers', 'fam', 'gde',
  // El trago en vaso bajo o alto, y cómo se sirve una bebida: «SHOTS · BAJOS
  // $8.000 / ALTOS $10.000», «Vino copa / botella».
  'bajo', 'bajos', 'alto', 'altos', 'copa', 'botella', 'vaso', 'jarra',
];

/** Unidades de medida que en una carta hacen de tamaño («350 ml», «12 oz»). */
export const UNIDADES = 'oz|onz|onzas|ml|cc|lt|lts|litro|litros|l'
  + '|gr|grs|gramos|g|kg|kilo|kilos|libra|libras|lb';

const RE_MEDIDA = new RegExp(`^\\d+(?:[.,]\\d+)?(?:${UNIDADES})$`, 'i');

/**
 * Pega la unidad a su número para que «350 ml» sea UN token.
 *
 * Así la clasificación es una sola pasada por palabras y el orden en que
 * aparecen se conserva, en vez de sacar las medidas por un lado con un
 * `replace` y las palabras por otro —que es donde «Jugo 350 ml grande» saldría
 * con la etiqueta al revés—.
 */
export function juntarMedidas(texto: string): string {
  return texto.replace(
    new RegExp(`(\\d+(?:[.,]\\d+)?)\\s+(${UNIDADES})\\b`, 'gi'),
    '$1$2',
  );
}

/**
 * Un token listo para comparar: sin la puntuación de los bordes, sin tildes y
 * en minúscula. Se conserva lo de DENTRO —el punto de «1.5lt» y la barra de
 * «1/4»— porque ahí sí significa algo.
 */
export function tokenLimpio(token: string): string {
  return token
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** El token (una palabra o una medida pegada, «350ml») nombra un tamaño. */
export function esTokenDeTamano(token: string): boolean {
  const limpio = tokenLimpio(token);
  return limpio !== '' && (PALABRAS_DE_TAMANO.includes(limpio) || RE_MEDIDA.test(limpio));
}
