/**
 * Qué se le responde a un mensaje de WhatsApp.
 *
 * SON DOS PASOS, NO UNA CONVERSACIÓN
 * ----------------------------------
 * El pasajero escribe → se le pide la ubicación con el botón nativo → la manda
 * → recibe el enlace con la recogida ya puesta y solo elige a dónde va.
 *
 * No hay bot que entienda frases. Se eligió así por dinero medido: desde el 1
 * de octubre de 2026 Meta cobra los mensajes de servicio pasados los 1.000
 * gratis al mes por número, así que un chat que pregunta origen, destino y
 * confirma (~7 salientes) agota la bolsa en unos 140 viajes. Estos dos pasos
 * caben en 500. Y el botón de ubicación resuelve justo la parte cara: escribir
 * una dirección en un teclado es lo que más gente abandona.
 *
 * SIN ESTADO PROPIO
 * -----------------
 * No hay tabla de conversaciones. Basta con saber si ya se le pidió la
 * ubicación hace poco, y eso ya está en la fila del mensaje anterior. Una
 * máquina de estados aquí sería un sitio más donde quedarse colgado.
 *
 * LA SALIDA QUE EVITA EL CALLEJÓN
 * -------------------------------
 * Quien no quiera o no pueda mandar su ubicación —no sabe, tiene el GPS
 * apagado, prefiere escribir la dirección— no puede quedarse atrapado
 * recibiendo la misma petición una y otra vez. Si insiste con texto después de
 * que se la pedimos, se le manda el enlace sin origen y que la escriba en la
 * app, que tiene buscador de direcciones y mapa.
 */

import type { UbicacionWhatsapp } from './whatsapp-payload';

/**
 * Cuánto vale «ya se la pedimos».
 *
 * Más corto que la vigencia del enlace a propósito: si escribe mañana, es una
 * carrera nueva y toca volver a pedirle dónde está. Si escribe dos veces en el
 * mismo minuto, es la misma.
 */
export const MEMORIA_PETICION_MIN = 30;

export type Paso =
  /** Mandarle el botón nativo de ubicación. */
  | { accion: 'pedir-ubicacion' }
  /** Mandarle el enlace, con el punto de recogida si lo tenemos. */
  | { accion: 'enlace'; origen: UbicacionWhatsapp | null };

export interface ContextoPaso {
  /** La ubicación del mensaje, si trae una válida. */
  ubicacion: UbicacionWhatsapp | null;
  /** Si ya se le mandó la petición de ubicación dentro de la ventana. */
  ubicacionYaPedida: boolean;
}

/**
 * El siguiente paso para ese mensaje.
 *
 * Tres casos y nada más:
 *  - trae ubicación  → enlace con origen;
 *  - no la trae y no se la hemos pedido → pedirla;
 *  - no la trae y ya se la pedimos → enlace seco, para no dejarlo encerrado.
 */
export function siguientePaso(ctx: ContextoPaso): Paso {
  if (ctx.ubicacion) return { accion: 'enlace', origen: ctx.ubicacion };
  if (ctx.ubicacionYaPedida) return { accion: 'enlace', origen: null };
  return { accion: 'pedir-ubicacion' };
}

/**
 * Si se le dice que está fuera de cobertura.
 *
 * ⚠ FALLA ABIERTO, al revés que la firma del webhook. Sin plazas cargadas
 * —tabla vacía en un despliegue nuevo, o un fallo al leerla— el resolutor
 * devuelve `null` para TODO el mundo, y bloquear con eso sería dejar sin
 * servicio a la ciudad entera por un problema nuestro. Ante la duda se deja
 * pasar: como mucho el pasajero entra a la app y ve que no hay conductores,
 * que es exactamente lo que pasaba antes de que esto existiera.
 *
 * Solo se bloquea cuando SABEMOS que hay plazas y que ese punto no cae en
 * ninguna: ahí el mensaje es información útil y además nos ahorra un envío.
 */
export function esFueraDeCobertura(hayPlazas: boolean, plazaDelPunto: string | null): boolean {
  if (!hayPlazas) return false;
  return plazaDelPunto === null;
}

// ─── Textos ───────────────────────────────────────────────────────────────────
//
// Viven aquí, junto a la decisión, para que no se pueda cambiar un paso sin ver
// lo que el pasajero lee en ese paso.

function saludo(nombre: string | null): string {
  return nombre ? `Hola, ${nombre}.` : 'Hola.';
}

/** Cuerpo del mensaje que acompaña al botón de ubicación. */
export function textoPedirUbicacion(nombre: string | null): string {
  return (
    `${saludo(nombre)} Soy ZIPA. Para pedir tu servicio, tócame el botón de ` +
    `abajo y mándame tu ubicación: es desde donde te recogemos.`
  );
}

/** Mensaje con el enlace cuando SÍ sabemos dónde recogerlo. */
export function textoEnlaceConOrigen(
  enlace: string,
  vigenciaMin: number,
  etiqueta: string | null,
): string {
  const donde = etiqueta ? ` (${etiqueta})` : '';
  return (
    `Listo, ya tengo tu punto de recogida${donde}.\n\n` +
    `Toca aquí para elegir a dónde vas y pedir tu servicio:\n${enlace}\n\n` +
    `Es solo para ti y vence en ${vigenciaMin} minutos.`
  );
}

/** Mensaje con el enlace cuando no mandó ubicación. */
export function textoEnlaceSinOrigen(
  nombre: string | null,
  enlace: string,
  vigenciaMin: number,
): string {
  return (
    `${saludo(nombre)} Entra aquí y escribe tu dirección de recogida y a dónde vas:\n` +
    `${enlace}\n\n` +
    `Es solo para ti y vence en ${vigenciaMin} minutos.`
  );
}

/**
 * Mensaje para un punto donde ZIPA no opera.
 *
 * Se le dice en vez de mandarle un enlace: entrar a la app para descubrir que
 * no hay nadie es peor que saberlo en el chat, y nos ahorra el mensaje del
 * enlace. Se nombra la ciudad más cercana solo si se sabe cuál es.
 */
export function textoFueraDeCobertura(nombre: string | null): string {
  return (
    `${saludo(nombre)} Por ahora ZIPA no tiene servicio en esa zona. ` +
    `Estamos creciendo — si crees que es un error, mándame la ubicación otra vez ` +
    `o escríbenos desde la app.`
  );
}
