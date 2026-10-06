/**
 * El aviso al conductor cuando alguien aparta un puesto en su salida.
 *
 * POR QUÉ EXISTE. Reportado desde producción: «se aparta una van o un bus y
 * no le sale al conductor asignado». La reserva SÍ llegaba a su consulta
 * —comprobado contra la base—, pero no se le avisaba de nada: solo la veía
 * si se le ocurría abrir la pantalla de salidas y deslizar. Un pasajero
 * esperando en una esquina a las cinco de la mañana no puede depender de
 * eso.
 *
 * POR QUÉ EL TEXTO VIVE AQUÍ Y NO EN EL SERVICIO. Es una decisión de
 * producto, y se rompe de formas que no fallan: un plural mal puesto se ve
 * raro, pero perder el acumulado convierte en ruido un aviso que llega
 * cinco veces seguidas en un bus.
 */

export interface NuevaReserva {
  pasajero: string;
  puestos: number;
  /** Ya contando esta reserva. */
  vendidos: number;
  total: number;
}

/** El título. Corto: en la barra de notificaciones se corta enseguida. */
export const TITULO_NUEVA_RESERVA = 'Nuevo pasajero en tu salida';

/**
 * El cuerpo.
 *
 * LLEVA EL ACUMULADO A PROPÓSITO. En una van con tres reservas al día cada
 * aviso vale por sí solo; en un bus de cuarenta sillas llegarán muchos
 * seguidos, y sin el «N de M» el quinto no añade nada sobre el cuarto. Con
 * él, cada uno sigue diciendo algo nuevo — y el conductor puede ignorar los
 * de en medio sin perder la cuenta.
 *
 * El nombre va primero porque es lo único que no se puede deducir.
 */
export function cuerpoDeNuevaReserva(r: NuevaReserva): string {
  const nombre = (r.pasajero ?? '').trim() || 'Un pasajero';
  const puestos = Math.max(1, Math.round(r.puestos));
  const plural = puestos === 1 ? 'puesto' : 'puestos';

  // Sin total conocido no se inventa una fracción: «2 de 0» se lee como un
  // fallo, y un aviso que parece roto se deja de mirar.
  if (!(r.total > 0)) {
    return `${nombre} apartó ${puestos} ${plural}`;
  }
  // El acumulado nunca puede pasarse del total ni quedar por debajo de lo
  // que esta misma reserva compró: las dos cosas se leen como un error de
  // cuentas y hacen dudar del resto del aviso.
  const vendidos = Math.min(r.total, Math.max(puestos, Math.round(r.vendidos)));
  return `${nombre} apartó ${puestos} ${plural} · ${vendidos} de ${r.total} vendidos`;
}
