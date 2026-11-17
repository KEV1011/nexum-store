// ── El servicio que el conductor dejó abierto ────────────────────────────────
//
// EL PROBLEMA. La app del conductor solo conoce los servicios que aceptó en
// esa misma sesión: si se cierra a mitad (el sistema la mata para liberar
// memoria, se queda sin batería, se reinstala), al volver a abrirla no sabe
// que tenía uno. El servicio sigue asignado en la base, el cliente espera a
// un conductor que no va a llegar, y el conductor queda «en viaje» para el
// despacho.
//
// LA SALIDA. Al abrir la app se le pregunta al servidor qué tiene abierto y
// se le ofrecen dos cosas: RETOMARLO (vuelve a la pantalla del servicio, en la
// fase en que iba) o SOLTARLO (vuelve a la búsqueda y le llega a otro).
//
// Aquí están las dos reglas, sueltas y probadas:
//   · en qué fase va cada estado, para retomar en el punto exacto;
//   · cuándo se puede soltar. Solo ANTES de tener al pasajero o la mercancía:
//     con el pasajero a bordo o el pedido en la moto, «soltar» sería dejarlos
//     tirados. Ahí lo único posible es terminar el servicio.

export type TipoServicio = 'trip' | 'order' | 'errand';

/**
 * En qué punto va el servicio, con las palabras de la pantalla del conductor:
 * yendo a recoger, esperando en la recogida, o llevándolo al destino.
 */
export type FaseServicio = 'recogida' | 'en_espera' | 'en_curso';

const FASES: Record<TipoServicio, Record<string, FaseServicio>> = {
  trip: { ACCEPTED: 'recogida', ARRIVING: 'recogida', ARRIVED: 'en_espera', IN_PROGRESS: 'en_curso' },
  order: { DRIVER_TO_PICKUP: 'recogida', AT_PICKUP: 'en_espera', IN_TRANSIT: 'en_curso' },
  errand: { ACCEPTED: 'recogida', SHOPPING: 'en_espera', ON_THE_WAY: 'en_curso' },
};

/** La fase de un estado de la base, o null si el estado no es de un servicio en marcha. */
export function faseDe(tipo: TipoServicio, estado: string): FaseServicio | null {
  return FASES[tipo][estado.toUpperCase()] ?? null;
}

/** Los estados desde los que se puede soltar: los de la fase de recogida y espera. */
export const ESTADOS_SOLTABLES: Record<TipoServicio, readonly string[]> = {
  trip: ['ACCEPTED', 'ARRIVING', 'ARRIVED'],
  order: ['DRIVER_TO_PICKUP', 'AT_PICKUP'],
  // En la compra, SHOPPING es que ya está gastando su plata en el mostrador:
  // soltarlo ahí deja una compra a medias que nadie puede continuar.
  errand: ['ACCEPTED'],
};

/**
 * Por qué NO se puede soltar, en palabras para el conductor, o null si se
 * puede. Se dice el motivo y no solo «no»: quien ve el botón apagado tiene
 * que saber qué le queda por hacer.
 */
export function motivoParaNoSoltar(tipo: TipoServicio, estado: string): string | null {
  if (ESTADOS_SOLTABLES[tipo].includes(estado.toUpperCase())) return null;
  if (faseDe(tipo, estado) === null) return 'Este servicio ya no está en curso.';
  switch (tipo) {
    case 'trip':
      return 'El pasajero ya va contigo: termina el viaje.';
    case 'order':
      return 'Ya llevas el pedido: entrégalo al cliente.';
    case 'errand':
      return 'Ya empezaste la compra: termínala y entrégala.';
  }
}
