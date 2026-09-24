/**
 * Cuándo se puede calificar una salida de bus, y por qué no siempre.
 *
 * EL PROBLEMA QUE ESTO RESUELVE
 * -----------------------------
 * Lo evidente sería exigir que la salida esté COMPLETED. Pero quien la marca
 * completada es el conductor, desde su app, al final de un viaje de seis
 * horas — y si se le olvida, el pasajero que sí viajó no puede calificar
 * NUNCA. La nota de la empresa dependería de que el conductor se acuerde, que
 * es justo la persona a la que la nota juzga.
 *
 * Así que también vale una salida EN CURSO cuya hora estimada de llegada ya
 * pasó: el bus salió, el trayecto dura lo que dura, y a esa hora el pasajero
 * ya se bajó. No se inventa nada — la duración sale de la ruta, la misma que
 * se usó para cotizar.
 *
 * Sin duración conocida se exige COMPLETED: ahí sí no hay forma de saber si el
 * viaje terminó, y dar por llegado un bus que sigue rodando sería peor.
 */

export type EstadoSalida = 'open' | 'full' | 'departed' | 'completed' | 'cancelled';

export interface ContextoCalificacion {
  estadoSalida: EstadoSalida;
  /** Si la reserva propia sigue viva. Una cancelada no viajó. */
  reservaCancelada: boolean;
  salidaEn: Date;
  /** Cuánto dura la ruta, de la tabla de rutas. */
  duracionMin?: number | null;
  ahora: Date;
}

/**
 * El motivo por el que no se puede calificar, o `null` si sí se puede.
 *
 * Devuelve el motivo y no un booleano por lo de siempre: quien toca el botón
 * merece saber qué falta, y «no se puede» a secas obliga a adivinar.
 */
export function motivoParaNoCalificar(c: ContextoCalificacion): string | null {
  if (c.reservaCancelada) {
    return 'Cancelaste esta reserva, así que no hay viaje que calificar.';
  }
  if (c.estadoSalida === 'cancelled') {
    return 'La empresa canceló esta salida.';
  }
  if (c.estadoSalida === 'completed') return null;

  if (c.estadoSalida !== 'departed') {
    return 'Podrás calificar cuando termine el viaje.';
  }

  // En curso: solo si, por la duración de la ruta, ya debería haber llegado.
  if (c.duracionMin == null || !Number.isFinite(c.duracionMin) || c.duracionMin <= 0) {
    return 'Podrás calificar cuando el conductor cierre el viaje.';
  }
  const llegadaPrevista = c.salidaEn.getTime() + c.duracionMin * 60_000;
  return c.ahora.getTime() >= llegadaPrevista
    ? null
    : 'Podrás calificar cuando termine el viaje.';
}
