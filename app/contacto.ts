/**
 * El correo de contacto de ZIPA, para las páginas del portal.
 *
 * Es el mismo buzón que publica el backend en los documentos legales
 * (`backend/src/lib/contacto.ts`), y no puede divergir: la política de
 * privacidad la sirve el backend y la página de eliminar cuenta la sirve este
 * portal, así que dos direcciones distintas serían dos canales de atención
 * contradictorios en el mismo trámite. `contacto-portal.test.ts` compara los
 * dos ficheros y falla si alguien cambia uno solo.
 *
 * Tiene valor por defecto A PROPÓSITO, al revés que antes: el portal y el
 * backend son servicios distintos y dependían de que alguien pusiera la misma
 * variable en los dos. Cuando faltaba, la página que lee el revisor de Play
 * salía sin canal de contacto. Lo que sigue prohibido es un correo inventado:
 * este es una cuenta real y atendida.
 */
export const BUZON_ZIPA = 'zipalegalcolombia@gmail.com'

/**
 * El correo que se publica. `NEXT_PUBLIC_SUPPORT_EMAIL` manda, para el día que
 * haya dominio propio; si no está, el buzón de siempre.
 *
 * Next reemplaza `process.env.NEXT_PUBLIC_*` en el build, así que la expresión
 * va entera y literal aquí dentro.
 */
export function correoSoporte(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || BUZON_ZIPA
}
