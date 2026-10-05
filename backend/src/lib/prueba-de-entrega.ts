/**
 * Las reglas de la prueba de entrega: qué fase se está subiendo y quién firma.
 *
 * Viven aquí sueltas porque son el tipo de decisión que se rompe sin avisar.
 * La fase llega como texto desde el teléfono, y los dos errores posibles no
 * se parecen en nada:
 *
 *  - Tomar por firma algo que no lo era escribiría `signedAt` sobre una foto
 *    y la constancia diría que alguien firmó cuando nadie firmó.
 *  - Tomar por foto una firma la guardaría en `deliveryPhotoUrl`, donde la
 *    siguiente foto la pisa y la prueba desaparece.
 *
 * La tercera, y la que de verdad importa: una app YA INSTALADA manda
 * 'pickup' o 'delivery' y no sabe nada de firmas. Lo desconocido tiene que
 * seguir cayendo en 'delivery' —que es lo que hacía antes— o la próxima
 * versión del backend rompería las entregas de todos los repartidores que
 * aún no han actualizado.
 */

export type FasePrueba = 'pickup' | 'delivery' | 'signature';

/** Largo máximo del nombre de quien firma. Un campo pegado por error no
 *  puede entrar entero en la base. */
export const LARGO_MAX_FIRMANTE = 120;

/**
 * Qué fase se está subiendo.
 *
 * Solo tres valores salen de aquí, y cualquier otra cosa —un campo vacío, un
 * typo, una app vieja que no manda nada— cae en 'delivery'.
 */
export function faseDePrueba(valor: unknown): FasePrueba {
  if (valor === 'pickup') return 'pickup';
  if (valor === 'signature') return 'signature';
  return 'delivery';
}

/**
 * El nombre de quien firma, o `null` si no dijo ninguno.
 *
 * `null` y no una cadena vacía: la columna es opcional y un `''` guardado se
 * pinta como un nombre en blanco debajo del trazo, que se lee como un fallo
 * de la app en vez de como «no lo dijo».
 */
export function nombreDeFirmante(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().slice(0, LARGO_MAX_FIRMANTE).trim();
  return limpio.length > 0 ? limpio : null;
}
