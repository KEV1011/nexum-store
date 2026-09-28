/**
 * ¿Este fallo de envío significa que el token está MUERTO?
 *
 * Distinción que cuesta dinero en las dos direcciones, y por eso vive suelta y
 * probada:
 *
 *   · Si NO se borra un token muerto, se reintenta en cada aviso para siempre.
 *     Se vio en producción: un usuario con la app desinstalada dejaba un
 *     `Send failed … NotRegistered` cada cinco minutos, y de paso engordaba el
 *     contador de fallidos hasta envenenar el diagnóstico («todos los envíos
 *     están fallando» cuando el resto llegaba perfectamente).
 *
 *   · Si se borra de más —ante un error pasajero de Google, una cuota o un
 *     payload mal formado— se deja SIN AVISOS a alguien que sí tenía la app
 *     puesta, y no hay forma de enterarse: el token solo se vuelve a registrar
 *     cuando esa persona abre la app. Ese error es mucho más caro que el otro.
 *
 * Por eso la lista es cerrada y corta: solo los dos códigos de Firebase que
 * significan exactamente «este token ya no existe», más los literales que
 * manda FCM en el detalle. Cualquier otro error se cuenta y se reintenta.
 */

/** Los únicos códigos de firebase-admin que significan token inservible. */
const CODIGOS_MUERTOS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Detalles crudos de FCM. Se comparan con el mensaje COMPLETO y no por
 * subcadena: «NotRegistered» dentro de una frase más larga podría venir de un
 * texto explicativo, y un `includes` acabaría borrando tokens buenos.
 */
const DETALLES_MUERTOS = new Set(['notregistered', 'unregistered', 'invalid_registration']);

export function tokenMuerto(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;

  const codigo = (err as { code?: unknown }).code;
  if (typeof codigo === 'string' && CODIGOS_MUERTOS.has(codigo)) return true;

  const mensaje = (err as { message?: unknown }).message;
  if (typeof mensaje === 'string' && DETALLES_MUERTOS.has(mensaje.trim().toLowerCase())) {
    return true;
  }

  return false;
}
