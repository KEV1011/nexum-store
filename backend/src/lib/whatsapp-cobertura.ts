/**
 * Si el punto que mandó está donde ZIPA opera, y qué se le dice si no.
 *
 * Era parte de `whatsapp-conversacion.ts`, que decidía los dos pasos del
 * enfoque anterior —pedir ubicación, mandar un enlace a la web—. Ese enfoque
 * se retiró cuando el pedido pasó a ocurrir dentro del chat
 * (`whatsapp-flujo.ts`), y esto es lo único suyo que sigue siendo cierto:
 * la cobertura no depende de cómo se pida el taxi.
 */

/**
 * Si se le dice que está fuera de cobertura.
 *
 * ⚠ FALLA ABIERTO, al revés que la firma del webhook. Sin plazas cargadas
 * —tabla vacía en un despliegue nuevo, o un fallo al leerla— el resolutor
 * devuelve `null` para TODO el mundo, y bloquear con eso sería dejar sin
 * servicio a la ciudad entera por un problema nuestro. Ante la duda se deja
 * pasar: como mucho el pasajero pide y no aparece conductor, que es lo que
 * pasaba antes de que esto existiera.
 *
 * Solo se bloquea cuando SABEMOS que hay plazas y que ese punto no cae en
 * ninguna: ahí el mensaje es información útil y además nos ahorra los tres o
 * cuatro mensajes que costaría llevarlo hasta el final de la conversación.
 */
export function esFueraDeCobertura(hayPlazas: boolean, plazaDelPunto: string | null): boolean {
  if (!hayPlazas) return false;
  return plazaDelPunto === null;
}

/**
 * Mensaje para un punto donde ZIPA no opera.
 *
 * Se le dice de entrada en vez de dejarle terminar el pedido: descubrir al
 * final que no hay servicio es peor que saberlo al mandar la ubicación.
 */
export function textoFueraDeCobertura(nombre: string | null): string {
  const saludo = nombre ? `Hola, ${nombre}.` : 'Hola.';
  return (
    `${saludo} Por ahora ZIPA no tiene servicio en esa zona. ` +
    `Estamos creciendo — si crees que es un error, mándame la ubicación otra vez.`
  );
}
