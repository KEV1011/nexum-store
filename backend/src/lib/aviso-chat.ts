// ── Aviso de un mensaje nuevo en el chat del servicio ────────────────────────
//
// El chat solo le llegaba a quien tenía la pantalla del chat ABIERTA: el
// mensaje se reparte a los suscritos por WebSocket, y la app solo se suscribe
// dentro de esa pantalla. El mandadero que escribe desde la tienda «no hay de
// esa marca, ¿cuál llevo?» no tenía forma de que el cliente se enterara — ni
// contador de no leídos, ni notificación —, y por eso acababa llamando.
//
// Aquí viven las reglas de QUÉ se le dice a quien no está mirando el chat, y
// cada cuánto. Sueltas y probadas porque un aviso mal redactado o repetido se
// silencia, y entonces deja de servir justo para lo que existe.

export type ServicioDeChat = 'trip' | 'envio' | 'errand' | 'order' | 'pooled';
export type RolDeChat = 'client' | 'driver';

/**
 * El título del aviso dice QUIÉN escribió, con la palabra que esa persona usa
 * para el otro. «Tu conductor» a quien espera una compra de la droguería se lee
 * como un error; «el cliente» al taxista que espera a su pasajero, también.
 */
export function tituloDeAvisoChat(
  servicio: ServicioDeChat,
  remitente: RolDeChat,
  nombre?: string | null,
): string {
  const quien = (nombre ?? '').trim();
  if (servicio === 'pooled') {
    // En el chat de grupo de un viaje por puestos escriben varios pasajeros:
    // sin el nombre no se sabe quién va a llegar tarde.
    if (remitente === 'driver') return 'El conductor escribió en tu viaje';
    return quien ? `${quien} escribió en el viaje` : 'Un pasajero escribió en el viaje';
  }
  if (remitente === 'driver') {
    switch (servicio) {
      case 'errand': return 'Tu mensajero te escribió';
      case 'order':
      case 'envio': return 'Tu repartidor te escribió';
      default: return 'Tu conductor te escribió';
    }
  }
  switch (servicio) {
    case 'trip': return 'Tu pasajero te escribió';
    default: return 'El cliente te escribió';
  }
}

/** Largo máximo de la vista previa: lo que entra en una línea de notificación. */
export const VISTA_PREVIA_MAX = 90;

/**
 * El cuerpo es el propio mensaje, recortado. Una foto no tiene texto que
 * enseñar, así que se dice que es una foto — un aviso vacío se lee como fallo.
 */
export function cuerpoDeAvisoChat(texto: string, conFoto: boolean): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (!limpio) return conFoto ? 'Te envió una foto' : 'Te envió un mensaje';
  if (limpio.length <= VISTA_PREVIA_MAX) return limpio;
  return `${limpio.slice(0, VISTA_PREVIA_MAX - 1).trimEnd()}…`;
}

/**
 * Cada cuánto se repite la notificación al teléfono de la misma persona en el
 * mismo chat. Se escribe en ráfagas («ya llegué» / «estoy en la portería» /
 * «la casa de la reja negra»): tres avisos seguidos que suenan tres veces
 * enseñan a silenciar la app. El primero avisa; los demás se ven al abrir el
 * chat y, con la app abierta, en el contador de no leídos.
 */
export const PAUSA_ENTRE_AVISOS_MS = 45_000;

/**
 * Decide si toca avisar al teléfono y recuerda cuándo se hizo. En memoria a
 * propósito: si un reinicio del servidor la borra, como mucho sale un aviso de
 * más, que es el error barato.
 */
export class RitmoDeAvisos {
  private ultimo = new Map<string, number>();

  constructor(private readonly pausaMs = PAUSA_ENTRE_AVISOS_MS) {}

  tocaAvisar(destinatario: string, chat: string, ahora = Date.now()): boolean {
    const clave = `${destinatario}:${chat}`;
    const antes = this.ultimo.get(clave);
    if (antes !== undefined && ahora - antes < this.pausaMs) return false;
    this.ultimo.set(clave, ahora);
    // Sin esto el mapa crecería con cada chat que existió.
    if (this.ultimo.size > 5_000) {
      for (const [k, t] of this.ultimo) {
        if (ahora - t >= this.pausaMs) this.ultimo.delete(k);
      }
    }
    return true;
  }
}
