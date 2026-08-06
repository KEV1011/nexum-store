// ── Cuota de mensajes por socket ─────────────────────────────────────────────
//
// El limitador HTTP no ve el WebSocket, y por ahí entra el tráfico en vivo:
// heartbeats de GPS, aceptaciones, cambios de estado, chat. Hasta ahora un solo
// socket podía mandar mensajes tan rápido como quisiera y cada uno abre una
// consulta a la base — una conexión bastaba para saturar el pool.
//
// Se cuenta por ventana deslizante y por socket, no por IP: detrás de una misma
// red móvil hay muchos conductores legítimos, y castigarlos a todos por uno
// sería peor que el abuso.
//
// Dos umbrales, porque no todos los mensajes cuestan lo mismo:
//  · el general, generoso, para que un conductor con GPS nervioso nunca lo roce;
//  · el de los mensajes que ESCRIBEN (aceptar, cambiar estado, chatear), mucho
//    más bajo, porque ahí es donde un bucle hace daño de verdad.

/** Ventana de conteo. */
const VENTANA_MS = 10_000;
/** Mensajes por ventana antes de cortar. */
const MAX_POR_VENTANA = Number(process.env['WS_MAX_MSGS_10S'] ?? 120);
/** Mensajes de escritura por ventana. */
const MAX_ESCRITURAS = Number(process.env['WS_MAX_WRITES_10S'] ?? 30);

/**
 * Un socket que no se identifica no sirve para nada y no debería seguir
 * abierto: sin esto, abrir conexiones mudas es gratis y no deja rastro.
 */
export const MS_PARA_AUTENTICARSE = Number(process.env['WS_AUTH_TIMEOUT_MS'] ?? 30_000);

/** Tipos que cambian estado en la base. El resto solo lee o se suscribe. */
const ESCRITURAS = new Set([
  'accept', 'reject', 'trip_status', 'errand_status', 'order_status',
  'accept_errand', 'reject_errand', 'accept_order', 'reject_order',
  'intercity_accept', 'intercity_reject', 'intercity_stage',
  'intercity_start', 'intercity_complete',
  'trip_chat_send', 'chat_send',
  'ride_bid', 'ride_bid_withdraw', 'ride_accept_bid', 'ride_status', 'ride_cancel',
  'location_update', 'ride_location', 'driver_mode',
]);

// Nota: el reloj de "identifícate o te cierro" NO mira el tipo del mensaje.
// Se para cuando la autenticación tuvo ÉXITO (marcarIdentificado en
// ws.handler): si bastara con mandar un `auth` de token basura, el reloj no
// serviría para nada — es justo el caso que existe para impedir.

export interface CuotaSocket {
  sellos: number[];
  sellosEscritura: number[];
}

export type ResultadoCuota =
  | { permitido: true }
  | { permitido: false; motivo: string; cortar: boolean };

export function nuevaCuota(): CuotaSocket {
  return { sellos: [], sellosEscritura: [] };
}

function podar(sellos: number[], ahora: number): number[] {
  // Los sellos llegan en orden: basta con soltar la cabeza vencida.
  let i = 0;
  while (i < sellos.length && ahora - sellos[i]! >= VENTANA_MS) i++;
  return i === 0 ? sellos : sellos.slice(i);
}

/**
 * Registra un mensaje y dice si se atiende. `cortar` marca el exceso grave
 * (el doble de la cuota): quien insiste después de que se le dijo que no ya no
 * es un cliente con un bug, y mantenerle el socket abierto es regalarle el
 * recurso que estaba agotando.
 */
export function registrarMensaje(
  cuota: CuotaSocket,
  tipo: string,
  ahora: number = Date.now(),
): ResultadoCuota {
  cuota.sellos = podar(cuota.sellos, ahora);
  cuota.sellos.push(ahora);

  if (cuota.sellos.length > MAX_POR_VENTANA * 2) {
    return { permitido: false, motivo: 'Demasiados mensajes. Conexión cerrada.', cortar: true };
  }
  if (cuota.sellos.length > MAX_POR_VENTANA) {
    return { permitido: false, motivo: 'Vas muy rápido, espera un momento.', cortar: false };
  }

  if (ESCRITURAS.has(tipo)) {
    cuota.sellosEscritura = podar(cuota.sellosEscritura, ahora);
    cuota.sellosEscritura.push(ahora);
    if (cuota.sellosEscritura.length > MAX_ESCRITURAS) {
      return {
        permitido: false,
        motivo: 'Demasiadas acciones seguidas, espera un momento.',
        cortar: cuota.sellosEscritura.length > MAX_ESCRITURAS * 2,
      };
    }
  }

  return { permitido: true };
}
