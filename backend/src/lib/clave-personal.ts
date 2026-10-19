// ── Clave personal: lo que cierra la llave maestra del piloto ────────────────
//
// EL PROBLEMA. Sin SMS, el código del login es UNO para todos
// (`OTP_FALLBACK_CODE`): lo conoce cada persona que prueba la app, porque es
// con lo que entra. Así que el código no prueba que tengas el teléfono; prueba
// que conoces el código. Con saber el número de un conductor se entra a SU
// cuenta —que recibe viajes y tiene billetera—, y con el de un dueño, a su
// empresa o a su negocio.
//
// LA SOLUCIÓN. Mientras el código sea llave maestra, cada cuenta añade algo
// que solo sabe su dueño: una clave de 4 a 6 dígitos que él mismo eligió. Con
// SMS de verdad la clave no se pide —el código ya prueba la posesión del
// teléfono—, así que el día que se active Twilio esto desaparece solo.
//
// Lo que NO resuelve, dicho para que nadie lo crea: una cuenta que todavía no
// tiene clave sigue abierta, y la primera persona en entrar es la que la fija.
// Por eso las apps la piden en el primer ingreso, y por eso el admin puede
// borrarla cuando alguien la olvida o denuncia que se la pusieron otros.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export const CLAVE_MIN = 4;
export const CLAVE_MAX = 6;

/** Intentos fallidos seguidos antes de bloquear. */
export const CLAVE_MAX_FALLOS = 5;
/** Cuánto dura el bloqueo. */
export const CLAVE_BLOQUEO_MS = 15 * 60_000;

/**
 * Por qué una clave nueva no sirve, o `null` si sirve.
 *
 * Las triviales se rechazan porque son las que alguien prueba primero: con
 * cinco intentos, una clave «1234» dura cinco intentos. No se pide más que eso
 * —ni letras ni longitud de banco—: la clave se escribe en un teléfono, a
 * veces en la calle, y una regla que nadie cumple acaba apuntada en un papel.
 */
export function motivoClaveInvalida(clave: unknown): string | null {
  if (typeof clave !== 'string') return 'Escribe tu clave.';
  const c = clave.trim();
  if (!/^\d+$/.test(c)) return 'La clave son solo números.';
  if (c.length < CLAVE_MIN || c.length > CLAVE_MAX) {
    return `La clave tiene de ${CLAVE_MIN} a ${CLAVE_MAX} números.`;
  }
  if (/^(\d)\1+$/.test(c)) return 'No uses el mismo número repetido: es lo primero que se prueba.';
  const digitos = c.split('').map(Number);
  const sube = digitos.every((d, i) => i === 0 || d === (digitos[i - 1]! + 1) % 10);
  const baja = digitos.every((d, i) => i === 0 || d === (digitos[i - 1]! + 9) % 10);
  if (sube || baja) return 'No uses números seguidos (1234, 4321): es lo primero que se prueba.';
  return null;
}

/**
 * La clave guardable: `scrypt$sal$hash`. Nunca la clave en claro — quien lea
 * la base no tiene por qué poder entrar a la cuenta de nadie.
 */
export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(clave.trim(), sal, 32);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

/** ¿La clave escrita corresponde al hash guardado? En tiempo constante. */
export function claveCoincide(guardado: string | null | undefined, clave: string): boolean {
  if (!guardado) return false;
  const partes = guardado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const sal = Buffer.from(partes[1]!, 'hex');
  const esperado = Buffer.from(partes[2]!, 'hex');
  if (sal.length === 0 || esperado.length === 0) return false;
  const dado = scryptSync(clave.trim(), sal, esperado.length);
  return timingSafeEqual(dado, esperado);
}

export interface EstadoIntentos {
  fallos: number;
  bloqueadaHasta: Date | null;
}

/** Minutos que faltan de bloqueo, o 0 si no está bloqueada. */
export function minutosBloqueo(e: EstadoIntentos, ahora: Date): number {
  if (!e.bloqueadaHasta || e.bloqueadaHasta <= ahora) return 0;
  return Math.ceil((e.bloqueadaHasta.getTime() - ahora.getTime()) / 60_000);
}

/**
 * El estado tras un intento fallido. Al llegar al tope se bloquea y el
 * contador vuelve a cero: pasado el bloqueo hay otros cinco intentos, no uno.
 */
export function trasFallo(e: EstadoIntentos, ahora: Date): EstadoIntentos {
  // Un bloqueo ya vencido no cuenta: se empieza de nuevo.
  const base = e.bloqueadaHasta && e.bloqueadaHasta <= ahora ? 0 : e.fallos;
  const fallos = base + 1;
  if (fallos >= CLAVE_MAX_FALLOS) {
    return { fallos: 0, bloqueadaHasta: new Date(ahora.getTime() + CLAVE_BLOQUEO_MS) };
  }
  return { fallos, bloqueadaHasta: null };
}
