// ── Viajes programados ───────────────────────────────────────────────────────
//
// Reservar un carro para las 8 de la mañana de mañana. El intermunicipal y la
// carga ya se programaban; el viaje urbano no.
//
// La decisión que hace que esto funcione o no es CUÁNDO se empieza a buscar.
// Si se busca a las 8:00 para un viaje de las 8:00, el conductor acepta a las
// 8:01 y llega a las 8:10 — o sea, la reserva no sirvió para nada y el
// pasajero llega tarde igual. Se empieza [ANTELACION_MIN] minutos antes, para
// que a la hora acordada el carro esté en la puerta.
//
// De ahí sale el mínimo de antelación: si se pudiera reservar para dentro de
// cinco minutos, la búsqueda tendría que haber arrancado hace cinco. Reservar
// para dentro de un rato no es reservar, es pedir ahora — y para eso ya está
// el botón de pedir.
//
// SOBRE EL PRECIO: lo que se enseña al reservar es una ESTIMACIÓN, y el precio
// de verdad se calcula cuando el viaje sale a buscar conductor, con la tarifa
// vigente en ese momento. No se sella al reservar porque sellarlo sería
// prometer un precio que puede no ser el autorizado mañana (en taxi lo fija el
// decreto municipal, no nosotros).

/** Con cuánta antelación se empieza a buscar conductor. */
export const ANTELACION_MIN = 15;

/**
 * Lo antes que se puede programar, contado desde ahora.
 *
 * Tiene que ser MAYOR que la antelación: si no, la búsqueda de un viaje recién
 * programado tendría que empezar en el pasado.
 */
export const MINIMO_ANTELACION_MIN = 30;

/** Lo más lejos que se puede programar. Más allá el precio no significa nada. */
export const MAXIMO_DIAS = 7;

export class ProgramacionError extends Error {}

/**
 * Comprueba la hora pedida y devuelve cuándo hay que empezar a buscar.
 *
 * Lanza `ProgramacionError` con un mensaje que dice QUÉ hacer, no solo que
 * está mal: «programa con al menos 30 minutos» es accionable, «fecha
 * inválida» no.
 */
export function planificar(
  cuando: Date,
  ahora: Date = new Date(),
): { para: Date; buscarDesde: Date } {
  if (Number.isNaN(cuando.getTime())) {
    throw new ProgramacionError('No entendimos la fecha y hora del viaje.');
  }

  const minutosFalta = (cuando.getTime() - ahora.getTime()) / 60_000;

  if (minutosFalta < MINIMO_ANTELACION_MIN) {
    // Un solo mensaje para el pasado y para «dentro de un rato»: al pasajero
    // le da igual el motivo técnico, lo que necesita saber es el mínimo.
    throw new ProgramacionError(
      `Programa el viaje con al menos ${MINIMO_ANTELACION_MIN} minutos de ` +
        'anticipación. Si lo necesitas ya, pídelo normal.',
    );
  }

  if (minutosFalta > MAXIMO_DIAS * 24 * 60) {
    throw new ProgramacionError(
      `Solo puedes programar con hasta ${MAXIMO_DIAS} días de anticipación.`,
    );
  }

  // Al minuto: los segundos no aportan nada y ensucian lo que se enseña.
  const para = new Date(Math.floor(cuando.getTime() / 60_000) * 60_000);
  const buscarDesde = new Date(para.getTime() - ANTELACION_MIN * 60_000);
  return { para, buscarDesde };
}

/** Si ya toca salir a buscar conductor para un viaje programado. */
export function tocaBuscar(buscarDesde: Date, ahora: Date = new Date()): boolean {
  return buscarDesde.getTime() <= ahora.getTime();
}
