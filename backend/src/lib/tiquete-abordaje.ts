/**
 * El tiquete que el pasajero enseña al subirse al bus o a la van.
 *
 * QUÉ PROBLEMA RESUELVE. Hoy el pasajero reserva y, al llegar, el conductor
 * lo busca por nombre en el manifiesto. Eso funciona con cinco pasajeros y se
 * cae con veinte: homónimos, gente que reservó a nombre de otro, y ninguna
 * forma de saber si alguien ya subió. El tiquete le da al conductor **una
 * respuesta objetiva**: este código es de esta salida, es de esta persona, y
 * no se ha usado.
 *
 * POR QUÉ UN CÓDIGO CORTO Y NO SOLO UN QR. El QR es lo cómodo cuando hay
 * señal, batería y una cámara que enfoca. En la puerta de un bus a las cinco
 * de la mañana, con lluvia, lo que siempre funciona es que el pasajero LEA SU
 * CÓDIGO EN VOZ ALTA y el conductor lo teclee. El QR se puede añadir encima —
 * codifica este mismo texto— pero el código tiene que bastar por sí solo.
 */

/**
 * El alfabeto del código: sin caracteres que se confundan al leerlos o
 * teclearlos.
 *
 * Fuera el 0 y la O, el 1 con la I y la L. Esto no es estética: un pasajero
 * dicta su código por teléfono y un conductor lo teclea con una mano; cada par
 * ambiguo es una discusión en la puerta del bus con el motor andando.
 */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Seis caracteres. Con este alfabeto son ~887 millones de combinaciones:
 * de sobra para que no choquen, y cortos para dictarlos de una vez.
 */
const LARGO = 6;

/**
 * Genera un código. `aleatorio` se inyecta para poder probarlo: una función
 * que devuelve [0,1), como `Math.random`.
 */
export function generarCodigoTiquete(aleatorio: () => number = Math.random): string {
  let salida = '';
  for (let i = 0; i < LARGO; i++) {
    const n = Math.floor(aleatorio() * ALFABETO.length);
    // El clamp protege de un `aleatorio` que devuelva exactamente 1 (o un poco
    // más por redondeo): sin él saldría `undefined` dentro de la cadena y el
    // tiquete sería inservible sin que nada avisara.
    salida += ALFABETO[Math.min(Math.max(n, 0), ALFABETO.length - 1)];
  }
  return salida;
}

/**
 * Deja un código como se guarda, a partir de lo que sea que teclearon.
 *
 * La gente escribe con espacios, con guiones y en minúscula; y el teclado del
 * conductor puede poner una mayúscula de más. Comparar sin normalizar haría
 * que un tiquete válido se rechazara, que es el peor fallo de esta pantalla:
 * el pasajero tiene razón y el sistema le dice que no.
 */
export function normalizarCodigo(valor: string | null | undefined): string {
  // Solo se quita lo que NO es parte de un código: espacios, guiones, puntos.
  //
  // A propósito NO se intenta «arreglar» un 0 por una O ni al revés. El
  // alfabeto ya excluye los dos, así que un código nunca los contiene: si
  // aparecen, es que quien tecleó se equivocó de carácter y no hay forma de
  // saber cuál quiso poner. Adivinarlo convertiría un error claro —«revisa el
  // código»— en un tiquete que valida el de otra persona.
  return (valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** El estado de una reserva, visto desde la puerta del bus. */
export interface TiqueteParaAbordar {
  /** El código guardado en la reserva. */
  codigo: string | null;
  /** La salida a la que pertenece la reserva. */
  pooledTripId: string;
  /** CONFIRMED, CANCELLED… */
  estado: string;
  /** Cuándo abordó, si ya lo hizo. */
  abordoEn: Date | null;
  /** Cuántos puestos ampara este tiquete. */
  puestos: number;
}

export interface VeredictoAbordaje {
  /** null = puede subir. */
  motivo: string | null;
  /** Para el caso «ya abordó»: cuándo fue, que es lo que zanja la discusión. */
  abordoEn?: Date | null;
}

/**
 * ¿Puede subir esta persona?
 *
 * El orden de las comprobaciones es deliberado:
 *
 *  1. **La salida**, primero. Un tiquete de otro viaje es el error que más se
 *     paga: el pasajero se sube tranquilo y aparece en una ciudad equivocada.
 *  2. **El estado**, después. Una reserva cancelada no da derecho a subir
 *     aunque el código exista.
 *  3. **Si ya abordó**, al final. No es un rechazo cualquiera: es la señal de
 *     que alguien fotografió un tiquete y lo está usando dos veces. Por eso
 *     devuelve la HORA del primer abordaje, que es lo que le permite al
 *     conductor resolverlo ahí mismo en vez de discutir.
 */
export function motivoParaNoAbordar(
  t: TiqueteParaAbordar | null,
  salidaId: string,
): VeredictoAbordaje {
  if (!t || !t.codigo) {
    return { motivo: 'No encontramos ese tiquete. Revisa el código.' };
  }
  if (t.pooledTripId !== salidaId) {
    return { motivo: 'Ese tiquete es de otra salida.' };
  }
  if (t.estado !== 'CONFIRMED') {
    return { motivo: 'Esa reserva no está confirmada.' };
  }
  if (t.abordoEn) {
    return {
      motivo: 'Ese tiquete ya se usó para abordar.',
      abordoEn: t.abordoEn,
    };
  }
  return { motivo: null };
}

/**
 * El texto que el pasajero ve y dicta. Agrupado de tres en tres porque un
 * bloque de seis se lee mal en voz alta y se teclea peor.
 */
export function codigoLegible(codigo: string | null | undefined): string {
  const limpio = (codigo ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (limpio.length !== LARGO) return limpio;
  return `${limpio.slice(0, 3)} ${limpio.slice(3)}`;
}
