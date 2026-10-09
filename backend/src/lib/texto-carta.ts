/**
 * El nombre de un plato, tal como lo va a leer el comensal.
 *
 * POR QUÉ EXISTE. Una captura de la carta del QU en producción mostró un
 * renglón que decía «1× $23.000» —sin nombre— y otro «⚫ Carne asada». El
 * nombre no estaba vacío: el dueño había escrito emojis («🍖 Carne asada»), y
 * la fuente del sitio no los dibuja. Donde el emoji acompañaba al nombre salía
 * un círculo negro; donde el nombre ERA el emoji, no salía nada y el plato
 * quedaba imposible de reconocer y de pedir.
 *
 * Es el mismo defecto que las dos apps ya tienen prohibido por prueba
 * (`sin_emojis_test.dart`): un emoji lo dibuja la fuente del sistema, así que
 * no se ve igual en dos teléfonos, no obedece al tema y no escala con el
 * texto. La diferencia es que aquí no lo escribe un programador, lo escribe el
 * dueño del restaurante desde su portal — así que no se puede resolver con una
 * prueba, hay que limpiarlo al guardar.
 *
 * SE LIMPIA, NO SE RECHAZA, y la distinción importa: quien escribió «🍲 Caldo
 * de costilla» quiere vender un caldo de costilla, y devolverle un error por
 * un adorno es fricción por nada. Pero si al quitar el adorno no queda nombre,
 * entonces no había nombre: eso SÍ se rechaza, diciéndolo.
 */

/**
 * Banderas, pictogramas, emoticonos, símbolos de adorno y los modificadores
 * que los acompañan (selector de variación, unión de cero ancho, tonos de
 * piel, teclas).
 *
 * NO entran la puntuación tipográfica ni los signos que de verdad aparecen en
 * una carta: «&», «·», «—», «½», «°», «'». Quitarlos rompería «Pollo & papas»
 * o «½ porción», que es peor que el adorno que se quiere limpiar.
 */
const ADORNOS = new RegExp(
  '[' +
    '\\u{1F1E6}-\\u{1F1FF}' + // banderas
    '\\u{1F300}-\\u{1FAFF}' + // pictogramas, emoticonos, objetos, comida
    '\\u{2190}-\\u{21FF}' + // flechas
    '\\u{2600}-\\u{27BF}' + // símbolos varios y dingbats
    '\\u{2B00}-\\u{2BFF}' + // estrellas y figuras
    '\\u{FE0E}\\u{FE0F}' + // selectores de variación
    '\\u{200D}' + // unión de ancho cero
    '\\u{20E3}' + // tecla
    '\\u{E0020}-\\u{E007F}' + // etiquetas (banderas regionales)
    ']',
  'gu',
);

/**
 * Deja el texto como lo va a leer el comensal: sin adornos y sin espacios de
 * sobra.
 *
 * Idempotente: pasarlo dos veces da lo mismo, que es lo que permite llamarlo
 * tanto al crear como al editar sin ir acumulando recortes.
 */
export function limpiarTextoDeCarta(valor: string): string {
  return valor
    .replace(ADORNOS, ' ')
    // Los espacios raros (sin separación, finos) se ven como espacio y no lo
    // son: un nombre con uno dentro no casa en una búsqueda.
    .replace(/[  -​  　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `true` si el texto llevaba algo que el comensal no iba a ver bien. */
export function teniaAdornos(valor: string): boolean {
  return limpiarTextoDeCarta(valor) !== valor.trim();
}

/**
 * El nombre de un producto, listo para guardar.
 *
 * Lanza con el motivo si tras limpiarlo no queda nada: un producto cuyo nombre
 * era solo un emoji no se puede pedir, y guardarlo deja en la carta un renglón
 * con precio y sin plato — que es justo lo que se vio en producción.
 */
export function nombreDeProducto(valor: string | undefined | null): string {
  const bruto = (valor ?? '').trim();
  if (!bruto) throw new Error('El nombre del producto es obligatorio.');
  const limpio = limpiarTextoDeCarta(bruto);
  if (!limpio) {
    throw new Error(
      'El nombre no puede ser solo un emoji: en muchos teléfonos no se dibuja '
      + 'y el plato aparecería sin nombre. Escribe cómo se llama el plato.',
    );
  }
  return limpio;
}
