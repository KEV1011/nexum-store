/**
 * Cuánto se espera a un servicio de fuera antes de rendirse.
 *
 * POR QUÉ EXISTE. Auditado el 7 de octubre de 2026: de las dieciséis llamadas
 * a servicios externos del backend —Google, Twilio, Wompi—, solo las tres del
 * lector de cartas tenían límite de espera. Las otras trece se quedaban
 * esperando indefinidamente.
 *
 * Y la trampa es que **el código de respaldo YA estaba escrito**. `medirTrayecto`
 * tiene un `catch` que cae a la línea recta, y los mapas caen a OpenStreetMap:
 * un `catch` solo atrapa un error, y un servicio LENTO no da ninguno. Así que
 * el respaldo era inalcanzable justo en el caso para el que se escribió, y el
 * pasajero se quedaba con el botón «Pedir» girando sin fin — sin precio, sin
 * error y sin saber si tocar otra vez.
 *
 * LA REGLA QUE FIJA LOS NÚMEROS: el límite se mide contra **lo que la persona
 * aguanta**, no contra lo que el proveedor tarda. Si Google responde en veinte
 * segundos pero el pasajero abandona a los ocho, un límite de treinta no sirve
 * de nada: lo único que hace es que la app parezca rota durante más tiempo.
 * Por eso cada valor de abajo nombra a quién hace esperar.
 *
 * NO SE REINTENTA. Una petición que se pasó de tiempo se reintenta sola al
 * doble de espera, y lo que hay al otro lado es alguien mirando la pantalla.
 * Quien tenga respaldo lo usa; quien no, lo dice.
 */

/**
 * Los límites, en milisegundos. Cada uno nombra quién espera, porque es lo
 * único que justifica el número.
 */
export const LIMITES = {
  /**
   * Cotizar un viaje. Hay un dedo sobre el botón «Pedir»: pasados seis
   * segundos ya se cree que la app se colgó, y el respaldo (línea recta por
   * el factor de calle) da un precio en el acto y avisa de que es aproximado.
   */
  COTIZACION: 6_000,

  /**
   * Autocompletado de direcciones y geocodificación. Quien escribe espera
   * sugerencias mientras teclea; a los cinco segundos ya escribió otra cosa y
   * la respuesta llega tarde aunque llegue.
   */
  INTERACTIVO: 5_000,

  /**
   * Una imagen de mapa, y la sesión que las habilita. Pesan más que una
   * consulta y van muchas en paralelo, así que el margen es mayor; el mapa
   * cae a OpenStreetMap, que se ve peor pero se ve.
   */
  MAPA: 8_000,

  /**
   * El SMS del código de acceso. Es la puerta de entrada a las dos apps: si
   * cuelga, nadie entra. Un envío real tarda legítimamente más que una
   * consulta, de ahí el margen.
   */
  SMS: 10_000,

  /**
   * Pasarela de pago. El más largo a propósito: abortar pronto no deshace lo
   * que ya pasó del otro lado, y dejar un cobro en el aire es peor que
   * esperar un poco más.
   */
  PAGO: 20_000,

  /**
   * Diagnóstico (`/geo/health`, sondeos del panel). Lo mira un humano que
   * quiere el error EXACTO del proveedor; cortar antes convertiría «Routes
   * rechaza la llave» en «tiempo agotado», que es menos información y manda
   * a buscar el problema donde no está.
   */
  DIAGNOSTICO: 15_000,
} as const;

/**
 * ¿Se rindió por tiempo, o fue otra cosa?
 *
 * Importa porque se arreglan distinto: un corte por tiempo significa que el
 * proveedor está lento y conviene usar el respaldo sin ruido; un fallo de red
 * o un rechazo son un problema que alguien tiene que mirar.
 *
 * Se comprueban las dos formas y también la causa anidada: según la versión
 * de Node, `fetch` propaga la `DOMException` tal cual o la envuelve en un
 * `TypeError` con `cause`.
 */
export function esTiempoAgotado(err: unknown): boolean {
  const nombres = new Set(['TimeoutError', 'AbortError']);
  const nombreDe = (e: unknown): string | null =>
    typeof e === 'object' && e !== null && typeof (e as { name?: unknown }).name === 'string'
      ? (e as { name: string }).name
      : null;

  const propio = nombreDe(err);
  if (propio && nombres.has(propio)) return true;
  const causa = typeof err === 'object' && err !== null ? (err as { cause?: unknown }).cause : null;
  const anidado = nombreDe(causa);
  return !!anidado && nombres.has(anidado);
}

/**
 * El motivo en una línea, para el registro.
 *
 * Dice el servicio y los segundos: «Google Routes no contestó en 6 s» se
 * entiende de un vistazo en un registro de producción, y «AbortError» no.
 */
export function motivoDeFallo(err: unknown, servicio: string, limiteMs: number): string {
  if (esTiempoAgotado(err)) {
    return `${servicio} no contestó en ${Math.round(limiteMs / 1000)} s`;
  }
  return `${servicio}: ${err instanceof Error ? err.message : String(err)}`;
}

type IniciaPeticion = Parameters<typeof fetch>[1];

/**
 * `fetch` con límite de espera.
 *
 * Si quien llama ya trae su propia señal se respeta: `AbortSignal.any` corta
 * con la primera de las dos. Pisarla dejaría sin efecto la cancelación del
 * llamante, que casi siempre existe por un motivo más importante que este
 * límite (una petición HTTP que el cliente ya abandonó, por ejemplo).
 */
export async function traerConLimite(
  url: string | URL,
  init: IniciaPeticion,
  limiteMs: number,
): Promise<Response> {
  const porTiempo = AbortSignal.timeout(limiteMs);
  const previa = init?.signal;
  const signal = previa ? AbortSignal.any([previa, porTiempo]) : porTiempo;
  return fetch(url, { ...init, signal });
}
