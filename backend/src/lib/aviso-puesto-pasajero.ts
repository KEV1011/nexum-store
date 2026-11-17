/**
 * Lo que se les dice a los PASAJEROS de un viaje por puestos cuando el viaje
 * cambia: lo tomó un taxista, arrancó, terminó o se canceló.
 *
 * POR QUÉ EXISTE. Hasta ahora el único que recibía avisos era el conductor
 * (`lib/aviso-reserva-puesto.ts`). El pasajero que reservaba se quedaba sin
 * saber si alguien había tomado el viaje o si ya venían por él, y tenía que
 * abrir la app a ver. En una carrera normal eso nunca pasa: el push del
 * «conductor en camino» es lo primero que llega.
 *
 * Los textos viven aquí, sueltos y probados, porque dicen cosas que el
 * pasajero va a creer: la hora tiene que ser la de COLOMBIA (el servidor corre
 * en UTC y «sale a las 22:11» para un viaje de las 17:11 manda a la gente a la
 * calle cinco horas tarde) y la cancelación tiene que decir que no se cobró.
 */

export type EventoPuesto = 'tomado' | 'iniciado' | 'terminado' | 'cancelado';

/** «17:11», en hora de Colombia y en 24 h. */
export function horaColombia(fecha: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

export function avisoAPasajeroDePuesto(
  evento: EventoPuesto,
  p: { conductor?: string | null; salida: Date },
): { title: string; body: string } {
  const quien = p.conductor?.trim() || 'El taxista';
  switch (evento) {
    case 'tomado':
      return {
        title: 'Ya hay taxista para tu viaje',
        body: `${quien} tomó el viaje por puestos. Sale a las ${horaColombia(p.salida)}; `
          + 'ten listo tu punto de recogida.',
      };
    case 'iniciado':
      return {
        title: 'Tu viaje por puestos arrancó',
        body: `${quien} va recogiendo a los pasajeros. Mira en la app por dónde va.`,
      };
    case 'terminado':
      return {
        title: 'Viaje terminado',
        body: `¿Cómo te fue con ${quien}? Califícalo en la app.`,
      };
    case 'cancelado':
      return {
        title: 'Se canceló tu viaje por puestos',
        body: 'El viaje no se va a hacer y no se te cobró nada. Puedes buscar otro o publicar el tuyo.',
      };
  }
}
