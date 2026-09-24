/**
 * Pedir un taxi sin salir de WhatsApp.
 *
 * POR QUÉ CAMBIÓ EL DISEÑO
 * ------------------------
 * Antes esto eran dos pasos que terminaban en un ENLACE: el pasajero mandaba
 * su ubicación y se iba a una página web a pedir. Se eligió así por costo, y
 * el cálculo estaba mal planteado — decía «un chat completo agota los 1.000
 * mensajes gratis en 140 viajes», que es cierto pero no es el costo. Pasados
 * los gratis, Colombia está entre las tarifas más bajas del mundo: unos cuatro
 * pesos por mensaje. Con siete salientes por carrera, mil carreras al mes
 * cuestan unos veinticuatro mil pesos. Contra la comisión de esas mil carreras
 * es menos del tres por ciento.
 *
 * Y el costo que no se estaba contando era el otro: la gente no abre la
 * página. Un enlace que hay que tocar para pedir un taxi pierde por el camino
 * a justo las personas para las que existe esta puerta — las que no quieren
 * instalar nada.
 *
 * Así que la conversación entera vive aquí. El enlace sigue existiendo, pero
 * OFRECIDO dentro de un mensaje que ya iba a salir («ver en el mapa»), no como
 * el único camino: cuesta cero mensajes extra y el que quiera mapa lo tiene.
 *
 * LO QUE SE PIERDE, Y HAY QUE SABERLO
 * -----------------------------------
 * En WhatsApp no hay mapa en vivo ni botón de emergencia. Quien quiera ver el
 * carro acercarse tiene que abrir el enlace. No se disimula: el mensaje de
 * «conductor asignado» lo ofrece.
 *
 * AHORA SÍ HAY ESTADO, Y ES INEVITABLE
 * ------------------------------------
 * Con dos pasos bastaba mirar el mensaje anterior. Con origen, destino,
 * confirmación y viaje en curso hace falta saber por dónde va cada
 * conversación. Todo lo de aquí es PURO: decide el siguiente paso a partir del
 * estado y del mensaje, y no toca base de datos ni red. Lo que se guarda y lo
 * que se envía es cosa del servicio.
 */

import type { UbicacionWhatsapp } from './whatsapp-payload';

/** Por dónde va la conversación. */
export type EstadoConversacion =
  /** No hay nada empezado, o lo anterior caducó. */
  | 'inicio'
  /** Se le pidió la ubicación y se espera que la mande. */
  | 'esperando_origen'
  /** Hay origen; falta a dónde va. */
  | 'esperando_destino'
  /** Hay trayecto y precio; falta que diga que sí. */
  | 'esperando_confirmacion'
  /** Pidió el viaje y está en curso. */
  | 'viaje_en_curso'
  /** Se le pidió que acepte los términos y se espera que toque el botón. */
  | 'esperando_terminos';

/**
 * Cuánto dura una conversación a medias.
 *
 * Pasado esto se empieza de cero. Es deliberadamente corto: retomar a las tres
 * horas un «¿a dónde vas?» significaría mandar el taxi al sitio donde la
 * persona estaba, no donde está. Perder el hilo es barato; acertar el punto
 * equivocado, no.
 */
export const VIDA_CONVERSACION_MIN = 20;

/** Ids de los botones. Estables aunque cambie el texto que se muestra. */
export const BOTON_CONFIRMAR = 'zipa_confirmar';
export const BOTON_CANCELAR = 'zipa_cancelar';
export const BOTON_ACEPTO = 'zipa_acepto';

export interface ContextoFlujo {
  estado: EstadoConversacion;
  /** Minutos desde el último mensaje de esta conversación. */
  minutosDesdeUltimo: number;
  /** El mensaje que acaba de llegar. */
  ubicacion: UbicacionWhatsapp | null;
  texto: string;
  /** Id del botón que tocó, si tocó uno. */
  botonId: string | null;
  /** Si ya tiene un viaje abierto en la plataforma. */
  tieneViajeActivo: boolean;
  /**
   * Si ya aceptó la versión VIGENTE de términos y privacidad.
   *
   * Por los otros caminos —login por OTP, registro de conductor, registro de
   * empresa— el consentimiento se registra con su clickwrap. Este camino no
   * pasaba por ninguno, así que quien entraba por WhatsApp pedía un taxi sin
   * constancia de haber aceptado nada. Al publicar una versión nueva esto
   * vuelve a ser falso solo, y se pide otra vez.
   */
  aceptoTerminos: boolean;
}

export type Paso =
  /** Mandarle el botón nativo de ubicación de WhatsApp. */
  | { accion: 'pedir-origen' }
  /** Preguntarle a dónde va. */
  | { accion: 'pedir-destino'; origen: UbicacionWhatsapp }
  /** Resolver la dirección que escribió y cotizar. */
  | { accion: 'cotizar'; destinoTexto: string }
  /** Crear el viaje: dijo que sí. */
  | { accion: 'pedir-viaje' }
  /** Enseñarle los términos y esperar que los acepte. */
  | { accion: 'pedir-terminos' }
  /** Dejar constancia de que los aceptó y seguir. */
  | { accion: 'aceptar-terminos' }
  /** Soltar lo que había a medias. */
  | { accion: 'cancelar' }
  /** Ya tiene un viaje: recordarle en qué va en vez de empezar otro. */
  | { accion: 'recordar-viaje' }
  /** No se entendió: repetir la pregunta del paso en el que está. */
  | { accion: 'repetir'; estado: EstadoConversacion };

/**
 * El siguiente paso.
 *
 * El orden de las comprobaciones es lo que sostiene esto, y no es arbitrario:
 *
 *  1. Un viaje en curso manda sobre todo. Quien ya tiene taxi y escribe no
 *     quiere pedir otro, quiere saber dónde está el suyo.
 *  2. Cancelar manda sobre el paso en el que esté: es la salida, y tiene que
 *     funcionar desde cualquier sitio.
 *  3. Una UBICACIÓN nueva reinicia el origen, esté donde esté la conversación.
 *     Si no, quien camina dos cuadras y manda su punto otra vez tendría el
 *     taxi en donde estuvo. Es el mismo error que ya se corrigió en la versión
 *     de dos pasos, y aquí vuelve a ser el más caro.
 *  4. La caducidad se mira DESPUÉS de las tres anteriores: cancelar o mandar
 *     una ubicación tienen sentido aunque la conversación esté vieja.
 */
export function siguientePaso(c: ContextoFlujo): Paso {
  // Cancelar es la salida y va primero: tiene que funcionar incluso con los
  // términos sin aceptar, porque si no, quien no quiera aceptarlos se queda
  // recibiendo la misma pantalla sin forma de salir.
  if (c.botonId === BOTON_CANCELAR) return { accion: 'cancelar' };

  // Sin consentimiento no se opera. Va ANTES que todo lo demás porque es un
  // requisito previo, no un paso del pedido: pedir un taxi es tratar sus datos
  // —su teléfono, su ubicación, a dónde va— y eso no se hace sin permiso.
  if (!c.aceptoTerminos) {
    return c.botonId === BOTON_ACEPTO
      ? { accion: 'aceptar-terminos' }
      : { accion: 'pedir-terminos' };
  }

  if (c.tieneViajeActivo) return { accion: 'recordar-viaje' };

  if (c.ubicacion) return { accion: 'pedir-destino', origen: c.ubicacion };

  const caducada = c.minutosDesdeUltimo > VIDA_CONVERSACION_MIN;
  const estado: EstadoConversacion = caducada ? 'inicio' : c.estado;

  switch (estado) {
    case 'inicio':
    case 'esperando_origen':
      // Sin punto de partida no hay nada que hacer, y el botón nativo evita el
      // teclado, que es donde más gente abandona.
      return { accion: 'pedir-origen' };

    case 'esperando_destino': {
      const destino = c.texto.trim();
      // Un «ok» o un emoji no son una dirección: preguntar otra vez es mejor
      // que mandar a geocodificar basura y cotizar un trayecto inventado.
      if (destino.length < 4) return { accion: 'repetir', estado };
      return { accion: 'cotizar', destinoTexto: destino };
    }

    case 'esperando_confirmacion':
      if (c.botonId === BOTON_CONFIRMAR) return { accion: 'pedir-viaje' };
      // Escribió algo en vez de tocar el botón. Si parece una dirección, es que
      // cambió de idea sobre a dónde va: se vuelve a cotizar en vez de
      // insistir con el botón, que es lo que haría un humano en la taquilla.
      if (c.texto.trim().length >= 4) return { accion: 'cotizar', destinoTexto: c.texto.trim() };
      return { accion: 'repetir', estado };

    case 'esperando_terminos':
      // Ya aceptó (lo cubre la comprobación de arriba): empieza el pedido.
      return { accion: 'pedir-origen' };

    case 'viaje_en_curso':
      // No debería llegarse aquí (lo cubre `tieneViajeActivo`), pero si el
      // estado guardado y la plataforma discrepan, manda la plataforma.
      return { accion: 'pedir-origen' };
  }
}

/** El estado en el que queda la conversación después de ejecutar el paso. */
export function estadoTras(paso: Paso): EstadoConversacion {
  switch (paso.accion) {
    case 'pedir-origen': return 'esperando_origen';
    case 'pedir-destino': return 'esperando_destino';
    case 'cotizar': return 'esperando_confirmacion';
    case 'pedir-viaje': return 'viaje_en_curso';
    case 'cancelar': return 'inicio';
    case 'recordar-viaje': return 'viaje_en_curso';
    case 'pedir-terminos': return 'esperando_terminos';
    // Aceptar no deja la conversación esperando nada: lo siguiente que se le
    // manda es el botón de ubicación, en el mismo turno.
    case 'aceptar-terminos': return 'esperando_origen';
    case 'repetir': return paso.estado;
  }
}
