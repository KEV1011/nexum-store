/**
 * Si la salida recoge al pasajero en su casa.
 *
 * EL CASO REAL QUE ESTO CUBRE
 * ---------------------------
 * Las vans intermunicipales de la región recogen puerta a puerta: pasan por tu
 * casa, te suben y arrancan. Un bus de cuarenta no: sale de la terminal y a lo
 * sumo para en dos o tres puntos conocidos de la ciudad. Son dos formas de
 * operar distintas y la app tiene que saber cuál es cuál, porque de eso depende
 * si al pasajero se le pide su dirección o se le pide que elija un punto.
 *
 * LA REGRESIÓN QUE ARREGLA
 * ------------------------
 * Al publicar los puntos de embarque, la hoja de reserva pasó a enseñar los
 * puntos EN LUGAR del campo «dónde te recogen». Con eso, una empresa que
 * declarara puntos dejaba sin domicilio a sus vans — y el puerta a puerta es
 * justo lo que hace que la gente prefiera la van al bus. Las dos cosas pueden
 * convivir: hay salidas con puntos fijos, con domicilio, y con ambos.
 *
 * POR QUÉ EL VALOR POR DEFECTO SALE DEL VEHÍCULO
 * ----------------------------------------------
 * Podría exigirse que la empresa lo marque siempre, pero entonces las salidas
 * que ya existen —y las de quien no vea la casilla— quedarían en el valor que
 * eligiéramos nosotros, y cualquiera de los dos miente para la mitad de los
 * casos: un bus prometiendo recogerte en casa, o una van negándolo. Así que sin
 * declarar se deduce del vehículo, que es el dato que de verdad lo determina, y
 * la empresa puede cambiarlo cuando quiera.
 */

/** Los tipos con mapa de sillas. El resto son salidas de gasto compartido. */
export type TipoDeVehiculo = 'VAN' | 'BUSETA' | 'BUS' | null | undefined;

/**
 * Si recoge a domicilio.
 *
 * [declarado] es lo que dijo la empresa; `null`/`undefined` = no lo declaró y
 * se deduce:
 *
 *  · Sin vehículo declarado —el carro particular del gasto compartido— SÍ:
 *    es como funcionan hoy todas las salidas, donde el pasajero escribe dónde
 *    lo recogen. Cambiarlo les quitaría algo que ya tienen.
 *  · VAN, SÍ: es su forma de operar y la razón por la que se elige una van.
 *  · BUSETA y BUS, NO: salen de la terminal. Ofrecer domicilio ahí sería una
 *    promesa que el conductor tendría que desmentir por teléfono.
 */
export function admiteDomicilio(
  tipo: TipoDeVehiculo,
  declarado?: boolean | null,
): boolean {
  if (typeof declarado === 'boolean') return declarado;
  if (!tipo) return true;
  return tipo === 'VAN';
}

/**
 * Qué se le puede ofrecer al pasajero para subirse.
 *
 * Se resuelve aquí y no en cada pantalla porque son cuatro combinaciones y la
 * app, el portal y el manifiesto tienen que estar de acuerdo en cuál es. La
 * peor de las cuatro —sin puntos y sin domicilio— no deja al pasajero sin
 * respuesta: sube donde arranca el bus, y eso hay que decirlo en vez de
 * enseñarle un formulario vacío.
 */
export type ModoDeAbordaje = 'puntos' | 'domicilio' | 'ambos' | 'solo_origen';

export function modoDeAbordaje(hayPuntos: boolean, domicilio: boolean): ModoDeAbordaje {
  if (hayPuntos && domicilio) return 'ambos';
  if (hayPuntos) return 'puntos';
  if (domicilio) return 'domicilio';
  return 'solo_origen';
}

/**
 * El marcador que manda la app cuando el pasajero elige «En mi dirección».
 *
 * Hace falta un valor explícito: mandar «sin punto» significaría lo mismo que
 * manda una app vieja que no conoce los puntos, y a esa hay que sellarle la
 * terminal. Sin distinguirlas, quien pidiera que lo recogieran en su casa se
 * encontraría con «Sube en: Terminal · 06:00» en su reserva.
 */
export const PUNTO_DOMICILIO = 'domicilio';

export interface EleccionDeAbordaje<P> {
  /** El punto sellado, o `null` si va por domicilio. */
  punto: P | null;
  /** La dirección, solo cuando va por domicilio. */
  direccion: string | null;
  /** Por qué no se puede, si no se puede. */
  motivo?: string;
}

/**
 * Qué se sella en la reserva.
 *
 * El orden importa y cada rama cubre un caso real:
 *
 *  1. Pidió domicilio explícitamente: se exige dirección —sin ella el
 *     conductor no sabría a dónde ir— y que la salida lo admita.
 *  2. Eligió un punto: ese, y la dirección sobra.
 *  3. No eligió nada pero escribió su dirección: es una app anterior a los
 *     puntos, o alguien que rellenó el campo de siempre. Se entiende como
 *     domicilio si la salida lo admite.
 *  4. No eligió nada: el primer punto, que es la terminal.
 */
export function elegirAbordaje<P extends { id: string }>(opts: {
  puntos: P[];
  domicilioAdmitido: boolean;
  puntoId?: string | null;
  direccion?: string | null;
}): EleccionDeAbordaje<P> {
  const direccion = opts.direccion?.trim() ? opts.direccion.trim() : null;

  if (opts.puntoId === PUNTO_DOMICILIO) {
    if (!opts.domicilioAdmitido) {
      return { punto: null, direccion: null, motivo: 'Esta salida no recoge en la dirección del pasajero.' };
    }
    if (!direccion) {
      return { punto: null, direccion: null, motivo: 'Escribe dónde te recogemos.' };
    }
    return { punto: null, direccion };
  }

  if (opts.puntoId) {
    const p = opts.puntos.find((x) => x.id === opts.puntoId);
    if (!p) {
      return { punto: null, direccion: null, motivo: 'Ese punto de embarque ya no existe en esta salida.' };
    }
    return { punto: p, direccion: null };
  }

  if (direccion && opts.domicilioAdmitido) return { punto: null, direccion };

  return { punto: opts.puntos[0] ?? null, direccion: opts.puntos.length > 0 ? null : direccion };
}
