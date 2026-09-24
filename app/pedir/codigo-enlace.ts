/**
 * El código del enlace mágico, sacado del hash de la URL.
 *
 * Hay DOS formatos en circulación y esta página tiene que entender los dos,
 * porque el mismo enlace puede abrirse aquí o en la app web de Flutter:
 *
 *   · `#CODIGO`                 — el crudo, que es lo que esta página usaba.
 *   · `#/entrar?c=CODIGO`       — el que construye el backend
 *     (`construirEnlace` en `lib/enlace-magico.ts`), pensado para el router
 *     por hash de Flutter, que tiene una ruta `/entrar`.
 *
 * El backend genera HOY el segundo. Así que apuntar `CLIENT_WEB_URL` a esta
 * página —que es justo lo que hay que hacer para que el enlace de WhatsApp
 * abra aquí y no la app de Flutter, diez veces más pesada— dejaba llegar
 * `/entrar?c=ABC` como si fuera el código, y el canje respondía «ese enlace no
 * sirve». El pasajero no tenía forma de saber que el enlace estaba bien.
 *
 * Se arregla aquí y no en `construirEnlace` porque la app de Flutter ya
 * depende de ese formato: cambiarlo dejaría fuera a quien tenga la app
 * instalada, que es peor.
 *
 * El código en sí es opaco (192 bits en base64url), así que no se valida su
 * forma: lo único que se hace es sacarlo del envoltorio. Si viene basura, el
 * backend lo rechaza y la página ya muestra su motivo.
 */
export function codigoDesdeHash(hash: string | null | undefined): string | null {
  const crudo = (hash ?? '').replace(/^#/, '').trim();
  if (!crudo) return null;

  // Formato del backend: una ruta con el código en el parámetro `c`.
  // `URLSearchParams` sobre la parte de la consulta evita tener que partir a
  // mano y decodifica el porcentaje, que `encodeURIComponent` puso al generar.
  const corte = crudo.indexOf('?');
  if (corte !== -1) {
    const c = new URLSearchParams(crudo.slice(corte + 1)).get('c');
    // Un `?` sin `c` no es un código: devolver la ruta entera haría que el
    // backend rechazara algo que nunca fue un código, con un mensaje confuso.
    return c && c.trim() !== '' ? c.trim() : null;
  }

  // Una ruta sin parámetros tampoco es un código.
  if (crudo.startsWith('/')) return null;

  return crudo;
}
