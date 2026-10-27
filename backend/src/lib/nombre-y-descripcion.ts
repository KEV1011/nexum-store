// ── Separar el plato de sus ingredientes ───────────────────────────────────
//
// EL PROBLEMA, tal como lo ve el cliente. Una carta impresa escribe el plato y
// sus ingredientes en el mismo renglón:
//
//     Hamburguesa Camarón (Croqueta de carne, cebolla, queso, salsas)
//     Omelette americano: Jamón, queso mozzarella, tomate
//
// El lector de la foto se queda con todo eso como NOMBRE, así que en la lista
// sale «Hamburguesa Camarón (Croqueta de carne, c…» con el precio empujado
// fuera de la vista, y al abrir el plato el título ocupa seis renglones. No es
// un problema de maquetación: el dato está mal: el nombre es «Hamburguesa
// Camarón» y lo demás es su descripción, que el modelo YA tiene como campo.
//
// POR QUÉ UNA REGLA DE FORMA Y NO UN DICCIONARIO. Lo que hay que distinguir es
// una descripción de un CALIFICADOR, y los calificadores son justo los que
// NO se pueden separar:
//
//     Empanadas (3)          ← cuántas te dan, es parte del nombre
//     Jugo (350 ml)          ← la medida, es parte del nombre
//     Picada (grande)        ← el tamaño; separarlo dejaría «Picada» dos
//                              veces y rompería la detección de variantes
//
// Podría resolverse con vocabulario, pero un diccionario de tamaños siempre
// tiene huecos y hay que mantenerlo. La FORMA los separa sola: una
// descripción de ingredientes es larga y enumera —lleva comas o varias
// palabras—, un calificador son una o dos palabras cortas. Así la regla no
// depende de cómo llame cada carta a sus tamaños.
//
// Y ANTE LA DUDA NO SE SEPARA. Separar de más corta el nombre del plato y el
// cliente ve un producto que no reconoce; no separar deja una fila fea que el
// dueño arregla en la vista previa en diez segundos. El error barato es el
// segundo.

/** Lo mínimo que tiene que medir lo de dentro para ser una descripción. */
const LARGO_MIN_DESCRIPCION = 15;

/** Palabras mínimas, cuando no hay comas que delaten una enumeración. */
const PALABRAS_MIN_DESCRIPCION = 3;

/** Lo mínimo que tiene que quedar como nombre para que valga la pena. */
const LARGO_MIN_NOMBRE = 3;

export interface NombreYDescripcion {
  nombre: string;
  /** Ausente = la línea no traía descripción, o no se pudo separar con certeza. */
  descripcion?: string;
}

/**
 * Quita la puntuación y los espacios que cuelgan de los bordes.
 *
 * NO toca los paréntesis: «Empanadas (3)» se devuelve entero cuando no hay
 * nada que separar, y recortarlos a ciegas lo dejaba en «Empanadas (3».
 * El paréntesis suelto se quita aparte, en `equilibrarParentesis`.
 */
function recortar(texto: string): string {
  return texto
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,;:·•\-–—_|/]+|[\s.,;:·•\-–—_|/]+$/g, '')
    .trim();
}

/**
 * Quita los paréntesis que se quedaron sin su pareja.
 *
 * Al cortar por el «(» de «Plato (ingredientes)», la descripción se lleva el
 * «)» del final, que ya no cierra nada. Pero un paréntesis que SÍ tiene su
 * pareja dentro del texto es del dueño y se respeta: «papas (con gaseosa)»
 * se queda tal cual.
 */
function equilibrarParentesis(texto: string): string {
  let salida = texto;
  const cuenta = (c: string) => salida.split(c).length - 1;
  while (cuenta(')') > cuenta('(') && salida.endsWith(')')) {
    salida = salida.slice(0, -1).trimEnd();
  }
  while (cuenta('(') > cuenta(')') && salida.startsWith('(')) {
    salida = salida.slice(1).trimStart();
  }
  return salida;
}

/**
 * ¿Lo que viene después del separador son ingredientes, o un calificador?
 *
 * Es la decisión que sostiene todo el módulo. Mide la FORMA —cuánto ocupa y
 * si enumera— en vez de buscar palabras conocidas.
 */
export function pareceDescripcion(texto: string): boolean {
  const limpio = recortar(texto);
  if (limpio.length < LARGO_MIN_DESCRIPCION) return false;

  // Una enumeración con comas es una descripción casi seguro: ningún tamaño
  // ni cantidad se escribe con comas.
  if (/,/.test(limpio)) return true;

  // Sin comas, hace falta que sean varias palabras. «vaso grande» no lo es;
  // «con papas y gaseosa incluidas» sí.
  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (palabras.length < PALABRAS_MIN_DESCRIPCION) return false;

  // Y que no sea solo números y unidades («1 litro y medio»): si al quitar
  // los dígitos no queda casi nada, es una medida escrita en largo.
  const letras = limpio.replace(/[^\p{L}]/gu, '');
  return letras.length >= LARGO_MIN_DESCRIPCION - 5;
}

/**
 * Dónde empieza la descripción dentro del nombre, o -1.
 *
 * Se queda con el separador que aparezca ANTES, porque una carta que usa los
 * dos («Combo: hamburguesa (con papas)») nombra el plato hasta el primero.
 */
function posicionDelCorte(nombre: string): { corte: number; salto: number } | null {
  const candidatos: Array<{ corte: number; salto: number }> = [];

  // 1. Paréntesis de apertura. El de cierre puede faltar —el lector de la
  //    foto se come uno de los dos a menudo— y aun así se puede separar:
  //    lo que importa es dónde EMPIEZA lo de dentro.
  const abre = nombre.indexOf('(');
  if (abre > 0) candidatos.push({ corte: abre, salto: 1 });

  // 2. Dos puntos, siempre que no estén ENTRE dígitos («12:30» es una hora,
  //    y «1:2» una proporción). Con un dígito solo a un lado sí cortan:
  //    «Combo 1: Hamburguesa + papas + gaseosa» es el combo y lo que trae.
  const dosPuntos = nombre.search(/(?<!\d):|:(?!\d)/);
  if (dosPuntos > 0) candidatos.push({ corte: dosPuntos, salto: 1 });

  // 3. Un guion CON espacios a los lados: «Sandwich de pollo - pollo
  //    desmechado, queso». Sin espacios es parte de la palabra («Coca-Cola»,
  //    «Ají-limón») y no se toca.
  const guion = nombre.search(/\s[-–—]\s/);
  if (guion > 0) candidatos.push({ corte: guion, salto: 2 });

  if (candidatos.length === 0) return null;
  return candidatos.sort((a, b) => a.corte - b.corte)[0]!;
}

/**
 * Parte «Plato (ingredientes)» o «Plato: ingredientes» en sus dos mitades.
 *
 * Devuelve el nombre tal cual cuando no hay nada que separar — es idempotente,
 * así que pasarlo dos veces por aquí no estropea nada.
 */
export function separarDescripcion(crudo: string): NombreYDescripcion {
  const entero = recortar(crudo);
  if (!entero) return { nombre: crudo.trim() };

  const corte = posicionDelCorte(entero);
  if (!corte) return { nombre: entero };

  const nombre = equilibrarParentesis(recortar(entero.slice(0, corte.corte)));
  const resto = equilibrarParentesis(recortar(entero.slice(corte.corte + corte.salto)));

  // Sin nombre no hay plato: «(Dos croquetas de carne)» a secas se queda
  // entero, porque partirlo dejaría un producto sin cómo llamarse.
  if (nombre.length < LARGO_MIN_NOMBRE) return { nombre: entero };
  if (!pareceDescripcion(resto)) return { nombre: entero };

  return { nombre, descripcion: resto };
}
