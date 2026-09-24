/**
 * Dónde y a qué hora se sube el pasajero.
 *
 * QUÉ FALTABA
 * -----------
 * La reserva tenía un campo de texto libre —«dónde te recogen»— que el
 * pasajero escribía a mano y el conductor leía como podía. En una empresa
 * intermunicipal eso no existe: el bus sale de la terminal a las 6:00 y pasa
 * por dos o tres sitios conocidos de la ciudad, cada uno con SU hora. El
 * pasajero elige uno de esa lista, y esa hora —no la de la salida— es a la que
 * tiene que estar parado en la calle.
 *
 * NO SON LAS PARADAS DEL «PASA POR»
 * ---------------------------------
 * `PooledTrip.stops` ya existe y son otra cosa: los municipios intermedios del
 * trayecto. Un punto de embarque está en la ciudad de ORIGEN y sirve para
 * subirse. Mezclarlos habría hecho que el pasajero creyera que puede abordar
 * en un pueblo por el que el bus solo pasa de largo.
 *
 * LA HORA SE GUARDA COMO LA ESCRIBE LA EMPRESA
 * --------------------------------------------
 * «06:15», no «quince minutos después de la salida». Es lo que la empresa
 * anuncia en su taquilla y lo que el pasajero lee, y convertirlo a un desfase
 * en minutos para volver a convertirlo al pintarlo solo añade dos sitios donde
 * equivocarse. La aritmética —a qué instante corresponde ese «06:15»— vive en
 * `horaAbsolutaDePunto`, en un solo sitio, porque tiene una trampa:
 *
 * **EL CRUCE DE MEDIANOCHE.** Un bus que sale a las 23:40 y pasa por el
 * segundo punto a las 00:05 no lo hace veintitrés horas y media antes: lo hace
 * veinticinco minutos después, ya en el día siguiente. Sin esta regla, la app
 * le diría al pasajero que su recogida ya pasó.
 */

export interface PuntoEmbarque {
  /** Estable: es lo que la reserva guarda para saber cuál eligió. */
  id: string;
  name: string;
  /** La dirección exacta. Lo que hace que se pueda llegar sin preguntar. */
  address?: string;
  /** Hora local, «HH:MM» en 24 horas. */
  time: string;
  lat?: number;
  lng?: number;
}

/** Cuántos caben. Más de seis no es una lista, es un recorrido urbano. */
export const MAX_PUNTOS = 6;

/**
 * Cuánto puede separarse un punto de la hora de salida.
 *
 * No es una norma: es el filtro del dedo. Un punto a las nueve horas de la
 * salida no es un embarque, es un error de tecleo, y el pasajero llegaría a
 * una esquina con el bus a medio camino de otra ciudad.
 */
const MAX_HORAS_DESDE_SALIDA = 3;

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function esHoraValida(v: unknown): v is string {
  return typeof v === 'string' && HORA.test(v.trim());
}

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.trim().split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * El instante exacto al que corresponde la hora de un punto.
 *
 * Si la hora es MENOR que la de salida, el punto es del día siguiente: es el
 * cruce de medianoche, y es la única forma de que un nocturno se lea bien.
 */
export function horaAbsolutaDePunto(salida: Date, hhmm: string): Date | null {
  if (!esHoraValida(hhmm)) return null;
  const minPunto = minutosDe(hhmm);
  const minSalida = salida.getHours() * 60 + salida.getMinutes();
  const dia = new Date(salida);
  dia.setHours(0, 0, 0, 0);
  const cruza = minPunto < minSalida;
  return new Date(dia.getTime() + (minPunto + (cruza ? 24 * 60 : 0)) * 60_000);
}

/** Minutos entre la salida y el punto, ya resuelto el cruce de medianoche. */
export function minutosTrasLaSalida(salida: Date, hhmm: string): number | null {
  const abs = horaAbsolutaDePunto(salida, hhmm);
  if (!abs) return null;
  return Math.round((abs.getTime() - salida.getTime()) / 60_000);
}

function _slug(nombre: string, i: number): string {
  const base = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base ? `${base}-${i}` : `punto-${i}`;
}

/**
 * Limpia la lista que llega del portal.
 *
 * Se RECHAZA con el motivo en vez de descartar en silencio: quien publica está
 * mirando el formulario, y un punto que desaparece sin explicación acabaría
 * con pasajeros esperando en una esquina que la empresa cree haber publicado.
 *
 * Se ordenan por hora, no por como vinieran: es el orden en que el bus pasa, y
 * cualquier otro se lee como un error.
 */
export function saneaPuntosEmbarque(v: unknown, salida?: Date): PuntoEmbarque[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error('Los puntos de embarque deben venir como lista.');
  if (v.length > MAX_PUNTOS) {
    throw new Error(`Máximo ${MAX_PUNTOS} puntos de embarque.`);
  }

  const puntos: PuntoEmbarque[] = [];
  const nombres = new Set<string>();

  v.forEach((bruto, i) => {
    if (typeof bruto !== 'object' || bruto == null) {
      throw new Error('Cada punto de embarque debe tener nombre y hora.');
    }
    const b = bruto as Record<string, unknown>;
    const name = typeof b['name'] === 'string' ? b['name'].trim() : '';
    if (!name) throw new Error('Cada punto de embarque necesita un nombre.');
    if (name.length > 80) throw new Error(`El nombre «${name.slice(0, 20)}…» es demasiado largo.`);

    const clave = name.toLowerCase();
    if (nombres.has(clave)) {
      throw new Error(`«${name}» está repetido en la lista.`);
    }
    nombres.add(clave);

    const time = typeof b['time'] === 'string' ? b['time'].trim() : '';
    if (!esHoraValida(time)) {
      throw new Error(`La hora de «${name}» debe ir como HH:MM (24 horas).`);
    }

    if (salida) {
      const mins = minutosTrasLaSalida(salida, time);
      if (mins != null && mins > MAX_HORAS_DESDE_SALIDA * 60) {
        throw new Error(
          `«${name}» quedaría a ${Math.round(mins / 60)} horas de la salida. Revisa la hora.`,
        );
      }
    }

    const address = typeof b['address'] === 'string' && b['address'].trim()
      ? b['address'].trim().slice(0, 160)
      : undefined;
    const lat = typeof b['lat'] === 'number' && Number.isFinite(b['lat']) ? b['lat'] : undefined;
    const lng = typeof b['lng'] === 'number' && Number.isFinite(b['lng']) ? b['lng'] : undefined;
    const id = typeof b['id'] === 'string' && b['id'].trim() ? b['id'].trim() : _slug(name, i);

    puntos.push({
      id, name, time,
      ...(address && { address }),
      ...(lat !== undefined && { lat }),
      ...(lng !== undefined && { lng }),
    });
  });

  // Por hora, y con el cruce de medianoche resuelto si se conoce la salida:
  // ordenar «00:05» antes que «23:40» pondría el último punto el primero.
  return puntos.sort((a, b) => {
    if (salida) {
      return (minutosTrasLaSalida(salida, a.time) ?? 0) - (minutosTrasLaSalida(salida, b.time) ?? 0);
    }
    return minutosDe(a.time) - minutosDe(b.time);
  });
}

/** Lo guardado en la base. Nunca lanza: tirar la búsqueda entera por un punto
 * mal formado dejaría al pasajero sin ver ninguna salida. */
export function puntosGuardados(v: unknown): PuntoEmbarque[] {
  if (!Array.isArray(v)) return [];
  const out: PuntoEmbarque[] = [];
  for (const b of v) {
    if (typeof b !== 'object' || b == null) continue;
    const o = b as Record<string, unknown>;
    if (typeof o['name'] !== 'string' || !esHoraValida(o['time'])) continue;
    out.push({
      id: typeof o['id'] === 'string' ? o['id'] : _slug(o['name'], out.length),
      name: o['name'],
      time: (o['time'] as string).trim(),
      ...(typeof o['address'] === 'string' && { address: o['address'] }),
      ...(typeof o['lat'] === 'number' && { lat: o['lat'] }),
      ...(typeof o['lng'] === 'number' && { lng: o['lng'] }),
    });
  }
  return out;
}

/**
 * Cuál eligió el pasajero.
 *
 * Sin elección se toma el PRIMERO —el de la hora más temprana, que es la
 * terminal— en vez de rechazar la compra: las apps ya instaladas no mandan
 * este campo, y dejarlas sin poder reservar sería peor que asignarles el punto
 * principal, que es donde sube casi todo el mundo. Devuelve `null` solo cuando
 * la salida no tiene puntos, que es como se venden hoy.
 */
export function elegirPunto(puntos: PuntoEmbarque[], id?: string | null): PuntoEmbarque | null {
  if (puntos.length === 0) return null;
  if (!id) return puntos[0]!;
  return puntos.find((p) => p.id === id) ?? null;
}

/** «Terminal de Transportes · 06:00». Lo que se pinta en una línea. */
export function etiquetaPunto(p: PuntoEmbarque): string {
  return `${p.name} · ${p.time}`;
}
