/**
 * Las direcciones de contacto de ZIPA, en un solo sitio.
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE
 * ------------------------------------
 * La política de privacidad decía «Contacto: el canal de soporte dentro de la
 * app». Eso es circular: quien borró la app —o quien nunca la instaló— no tiene
 * por dónde pedir que borremos sus datos. Play exige que la política sea
 * accionable sin instalar nada, y la Ley 1581 de 2012 obliga al responsable a
 * publicar un canal de atención al titular. «Dentro de la app» no cumple
 * ninguna de las dos.
 *
 * LO QUE NO SE HACE: INVENTARSE UNA DIRECCIÓN
 * -------------------------------------------
 * Una dirección que no existe dentro de un documento legal es peor que no
 * tener ninguna: el titular escribe, rebota, y queda constancia de que el canal
 * que publicamos no funciona. Por eso una variable mal escrita se descarta en
 * vez de imprimirse, y por eso `BUZON_ZIPA` es un buzón REAL que el titular de
 * ZIPA abrió para esto — no un `soporte@undominio.co` de relleno.
 *
 * El valor por defecto existe para que los documentos legales no dependan de
 * que alguien se acuerde de poner la misma variable en dos servicios: sin él,
 * un despliegue del portal sin la variable publica una política sin canal de
 * atención, que es justo lo que la Ley 1581 y Play no admiten.
 *
 * TRES DIRECCIONES Y NO UNA, aunque al principio caigan en el mismo buzón:
 * separarlas cuesta lo mismo hoy y evita tener que reeditar documentos legales
 * ya publicados el día que haya un equipo detrás.
 */

/** Forma mínima de un correo. No valida que exista; valida que no sea basura. */
const CORREO = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/**
 * El buzón de ZIPA mientras no haya dominio propio.
 *
 * Es una cuenta real y atendida, no un placeholder: se puede publicar en la
 * política de privacidad, en la ficha de Play y en el formulario de retiros sin
 * que rebote nada. El día que haya dominio, se define `SUPPORT_EMAIL` (y, si se
 * quieren separar, `PRIVACY_EMAIL`/`LEGAL_EMAIL`) y este deja de usarse sin
 * tocar código.
 */
export const BUZON_ZIPA = 'zipalegalcolombia@gmail.com';

function leer(nombre: string): string | null {
  const v = (process.env[nombre] ?? '').trim();
  if (!v) return null;
  // Un valor mal escrito se descarta en vez de imprimirse: un «soporte@zipa»
  // en la política de privacidad es una dirección rota publicada.
  if (!CORREO.test(v)) {
    console.warn(`[Contacto] ${nombre} no parece un correo válido y se ignora: ${v}`);
    return null;
  }
  return v.toLowerCase();
}

export interface Contactos {
  /** Soporte general: el de Play, el de la app, el de eliminar cuenta. */
  soporte: string | null;
  /** Habeas Data: solicitudes del titular sobre sus datos (Ley 1581). */
  privacidad: string | null;
  /** Agente para notificaciones de retiro por derechos de autor. */
  legal: string | null;
}

/**
 * Las tres direcciones, con herencia: privacidad y legal caen a soporte si no
 * se declararon. Es lo razonable mientras haya una sola persona detrás, y
 * permite arrancar con un único buzón sin dejar huecos en los documentos.
 */
export function contactos(): Contactos {
  const soporte = leer('SUPPORT_EMAIL') ?? BUZON_ZIPA;
  return {
    soporte,
    privacidad: leer('PRIVACY_EMAIL') ?? soporte,
    legal: leer('LEGAL_EMAIL') ?? soporte,
  };
}

/** Para `/health`: si los documentos legales tienen un canal real publicado. */
export function contactoLegalConfigurado(): boolean {
  const c = contactos();
  return Boolean(c.soporte && c.privacidad && c.legal);
}

/**
 * La frase del responsable que va en la política de privacidad.
 *
 * Con correo configurado publica el canal real. Sin él dice la verdad —que el
 * canal está dentro de la app— en vez de imprimir un hueco o un placeholder.
 */
export function canalDelTitular(c: Contactos = contactos()): string {
  if (c.privacidad) {
    return `Puedes ejercer tus derechos de conocer, actualizar, rectificar y ` +
      `suprimir tus datos escribiendo a ${c.privacidad}. Responderemos en los ` +
      `términos de la Ley 1581 de 2012.`;
  }
  return 'Puedes ejercer tus derechos desde el canal de soporte de la ' +
    'aplicación. (Canal de correo pendiente de publicar.)';
}

/** La frase de contacto de soporte para los términos y el portal. */
export function canalDeSoporte(c: Contactos = contactos()): string {
  return c.soporte
    ? `Soporte: ${c.soporte}`
    : 'Soporte: desde la sección de ayuda de la aplicación.';
}

/** La frase del agente de retiros por derechos de autor. */
export function canalDeRetiros(c: Contactos = contactos()): string {
  const base =
    'Los titulares de derechos pueden reportar contenido en /legal/takedown';
  return c.legal ? `${base} o escribiendo a ${c.legal}` : base;
}
