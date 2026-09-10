/**
 * Qué se le avisa al pasajero en cada estado de un viaje urbano, y con qué
 * palabras.
 *
 * Vive aquí y no suelto dentro del servicio porque la decisión de **cuáles
 * estados merecen sacar el teléfono del bolsillo** es una decisión de producto,
 * no un detalle de implementación, y conviene poder leerla entera de un vistazo.
 *
 * La regla de fondo: se avisa de lo que el pasajero **no puede ver desde donde
 * está**. Con la app abierta todo llega por WebSocket y la pantalla se mueve
 * sola; el push existe para el que cerró la app, y para ese la notificación que
 * de verdad importa en un taxi es **«el carro ya está afuera»** — hasta ahora
 * era justo la que no se mandaba.
 *
 * Y al revés: no se avisa de todo. Un push por cada cambio de estado convierte
 * la app en ruido y la primera reacción del usuario es silenciarla — con lo que
 * se pierde también el aviso que sí importaba.
 */

/** Los estados que la app manda; mismo vocabulario que `ClientTripStatus`. */
export type EstadoViaje =
  | 'searching' | 'accepted' | 'arriving' | 'arrived'
  | 'in_progress' | 'completed' | 'cancelled';

export interface AvisoViaje {
  title: string;
  body: string;
  /** Va en `data.type`; la app lo usa para saber a qué pantalla llevar. */
  type: string;
}

export interface DatosDelViaje {
  /** ENVIOS cambia el texto: quien espera no es un pasajero, es un paquete. */
  esEnvio?: boolean;
  /** Tarifa final, para el aviso de viaje completado. */
  finalFare?: number | null;
  destino?: string | null;
}

function pesos(v: number): string {
  return `$${Math.round(v).toLocaleString('es-CO')}`;
}

/**
 * El aviso que corresponde a un estado, o `null` si ese estado no se notifica.
 *
 * `accepted` devuelve null **a propósito**: ese push ya lo manda el matching en
 * el momento de la asignación, y duplicarlo aquí le sonaría dos veces al
 * pasajero por el mismo hecho.
 */
export function avisoDeEstado(
  estado: EstadoViaje,
  datos: DatosDelViaje = {},
): AvisoViaje | null {
  const envio = datos.esEnvio === true;

  switch (estado) {
    case 'arrived':
      // La notificación más importante de todo el viaje: el carro está en la
      // puerta y el conductor está esperando. Sin esto, el pasajero que cerró
      // la app se entera cuando el conductor lo llama, o no se entera.
      return {
        title: envio ? 'El repartidor llegó por tu envío' : 'Tu conductor llegó',
        body: envio
          ? 'Está en el punto de recogida esperándote.'
          : 'Ya está en el punto de recogida esperándote.',
        type: 'trip_arrived',
      };

    case 'in_progress':
      return {
        title: envio ? 'Tu envío va en camino' : 'Viaje iniciado',
        body: datos.destino
          ? `En ruta hacia ${datos.destino}.`
          : 'Vas en ruta hacia tu destino.',
        type: 'trip_in_progress',
      };

    case 'completed':
      return {
        title: envio ? 'Envío entregado' : 'Viaje completado',
        body: typeof datos.finalFare === 'number' && datos.finalFare > 0
          // Con el monto delante: es lo primero que quiere saber quien va a
          // pagar en efectivo, y evita la discusión al bajarse.
          ? `Total: ${pesos(datos.finalFare)}. Gracias por viajar con nosotros.`
          : 'Gracias por viajar con nosotros.',
        type: 'trip_completed',
      };

    // Silencio deliberado en el resto.
    //
    // `searching` es el estado en el que el pasajero acaba de pulsar el botón
    // y está mirando la pantalla; `accepted` ya lo avisa el matching;
    // `arriving` («va en camino») cambia varias veces durante el trayecto y
    // sería el push que enseña a la gente a silenciar la app; y `cancelled`
    // tiene su propio aviso, con el motivo, en quien cancela.
    case 'searching':
    case 'accepted':
    case 'arriving':
    case 'cancelled':
      return null;
  }
}

/** Aviso al pasajero cuando la búsqueda se agota sin conductor. */
export function avisoSinConductor(): AvisoViaje {
  return {
    title: 'No encontramos conductor',
    body: 'No hay conductores disponibles cerca en este momento. Tu solicitud se canceló y no se te cobró nada.',
    type: 'trip_no_driver',
  };
}

/** Aviso al CONDUCTOR cuando el pasajero cancela un viaje ya asignado. */
export function avisoCancelacionAlConductor(origen?: string | null): AvisoViaje {
  return {
    title: 'El pasajero canceló el viaje',
    body: origen
      ? `Ya no tienes que ir a ${origen}. Vuelves a estar disponible.`
      : 'Ya no tienes que ir a la recogida. Vuelves a estar disponible.',
    type: 'trip_cancelled',
  };
}
