/**
 * Enlace de un solo uso para entrar a la app web desde el chat.
 *
 * QUÉ NO SE HACE, Y POR QUÉ
 * -------------------------
 * Lo fácil sería meter el token de sesión en la URL. No se hace: un enlace de
 * WhatsApp se reenvía a un grupo, aparece en la vista previa y se queda en el
 * historial del chat para siempre. Quien lo tuviera entraría como el pasajero
 * durante los treinta días que dura el token.
 *
 * Va un código opaco que solo sirve UNA vez y caduca en minutos, y que se
 * canjea contra el backend por el token real. Un enlace reenviado o filtrado
 * después del canje no vale nada.
 *
 * Y va detrás del `#` de la URL a propósito: el fragmento no se manda al
 * servidor, así que ni el hosting ni el robot que arma la vista previa del chat
 * llegan a ver el código.
 */

import { randomBytes } from 'crypto';

/**
 * Cuánto vale el código sin canjear.
 *
 * Corto porque el uso normal es tocar el enlace en cuanto llega. Quince minutos
 * cubren de sobra «lo abro cuando salga del salón» sin dejar una llave viva en
 * un chat toda la tarde.
 */
export const VIGENCIA_MIN = 15;

/** Forma del código: solo letras y números, para que el chat no lo parta. */
const FORMA = /^[A-Za-z0-9_-]{22,64}$/;

/**
 * Código nuevo, aleatorio de verdad.
 *
 * 24 bytes de `randomBytes` = 192 bits. No se usa `Math.random`, que es
 * predecible: quien pudiera adivinar un código entraría a una cuenta ajena.
 * base64url no lleva `+`, `/` ni `=`, que en una URL habría que escapar y en un
 * chat se rompen al copiar a mano.
 */
export function nuevoCodigo(): string {
  return randomBytes(24).toString('base64url');
}

/** Si un código tiene la forma esperada (filtro barato antes de ir a la BD). */
export function codigoBienFormado(codigo: string): boolean {
  return FORMA.test(codigo ?? '');
}

/**
 * Arma la URL que se le manda al pasajero.
 *
 * `base` es la raíz de la app web publicada; se tolera que venga con o sin
 * barra final, que es el error de configuración más fácil de cometer y daría
 * una URL con `//` o sin separador.
 */
export function construirEnlace(base: string, codigo: string): string {
  const raiz = (base ?? '').trim().replace(/\/+$/, '');
  return `${raiz}/#/entrar?c=${encodeURIComponent(codigo)}`;
}

/** Lo mínimo que hace falta saber de un enlace para decidir si vale. */
export interface EnlaceParaCanjear {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Motivo por el que el código NO se puede canjear, o `null` si sí.
 *
 * Los tres motivos se distinguen porque al usuario se le dice cosas distintas:
 * uno caducado se arregla escribiendo otra vez al chat, uno ya usado significa
 * que la sesión está abierta en otra pestaña, y uno inexistente es un enlace
 * mal copiado.
 */
export function motivoParaNoCanjear(
  enlace: EnlaceParaCanjear | null,
  ahora: Date,
): string | null {
  if (!enlace) return 'enlace-inexistente';
  if (enlace.usedAt) return 'enlace-ya-usado';
  if (enlace.expiresAt.getTime() <= ahora.getTime()) return 'enlace-vencido';
  return null;
}

/** Cuándo caduca un código emitido ahora. */
export function venceEn(ahora: Date, minutos: number = VIGENCIA_MIN): Date {
  return new Date(ahora.getTime() + minutos * 60000);
}
