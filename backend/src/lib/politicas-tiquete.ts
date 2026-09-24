/**
 * Las condiciones del tiquete: equipaje, mascotas, menores, cancelación.
 *
 * Son las cuatro preguntas que se hacen en la taquilla antes de pagar, y hoy
 * la app no responde ninguna. Quien viaja con una maleta grande, con el perro
 * o con un niño no compra sin saberlo, así que la venta se cae o —peor— se
 * hace y el problema aparece en el andén, cuando ya no hay margen.
 *
 * LO QUE ESTO NO HACE: INVENTAR LA POLÍTICA
 * -----------------------------------------
 * Un valor por defecto («2 piezas de 20 kg», que es lo habitual) sería una
 * condición que la empresa no fijó, publicada en su nombre y reclamable por el
 * pasajero. Sin declarar, `saneaPoliticas` devuelve null y la app dice que la
 * empresa no las ha publicado. Es peor dato y es la verdad.
 *
 * CUELGAN DE LA EMPRESA, NO DE LA SALIDA
 * --------------------------------------
 * Al revés que las comodidades: el aire lo tiene el vehículo, pero la regla de
 * mascotas es de la empresa y vale para toda su flota. Pedírsela salida por
 * salida garantizaría que se contradigan entre sí.
 *
 * SOBRE LA CANCELACIÓN, CON CUIDADO
 * ---------------------------------
 * Hoy el tiquete NO se paga en la plataforma (`SeatBooking` no tiene ningún
 * campo de dinero): se le paga al conductor. Por eso aquí solo se declara con
 * cuánta antelación admite la empresa que se cancele, y el texto dice
 * expresamente que la devolución se acuerda con ella. Prometer un reembolso
 * que este sistema no puede ejecutar sería la peor de las cuatro mentiras
 * posibles, porque involucra plata.
 */

export type PoliticaMascotas = 'no' | 'transportin' | 'consulta';
export type PoliticaMenores = 'no_solos' | 'con_autorizacion' | 'consulta';

export interface PoliticasTiquete {
  /** Kilos de bodega incluidos por pasajero. */
  equipajeKg?: number;
  /** Cuántas piezas entran en esos kilos. */
  equipajePiezas?: number;
  mascotas?: PoliticaMascotas;
  menores?: PoliticaMenores;
  /** Con cuánta antelación admite cancelar, en horas. */
  cancelacionHoras?: number;
  /** Lo que no cabe en los campos de arriba. */
  notas?: string;
}

/**
 * Topes de cordura. No son la norma —la pone cada empresa— sino el filtro del
 * cero de más: un equipaje de 500 kg o una cancelación con un mes de
 * antelación son un dedo, no una política.
 */
const MAX_KG = 100;
const MAX_PIEZAS = 10;
const MAX_HORAS = 168; // una semana
const MAX_NOTAS = 500;

const MASCOTAS: PoliticaMascotas[] = ['no', 'transportin', 'consulta'];
const MENORES: PoliticaMenores[] = ['no_solos', 'con_autorizacion', 'consulta'];

function entero(v: unknown, max: number, campo: string): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`${campo} debe ser un número.`);
  }
  const r = Math.round(n);
  if (r < 0) throw new Error(`${campo} no puede ser negativo.`);
  if (r > max) throw new Error(`${campo} no puede pasar de ${max}.`);
  return r;
}

/**
 * Limpia lo que llega del portal.
 *
 * Devuelve `null` cuando no queda nada declarado, y esa distinción es la que
 * sostiene el mensaje honesto de la app: no es lo mismo «sin políticas» que
 * «políticas vacías».
 */
export function saneaPoliticas(v: unknown): PoliticasTiquete | null {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('Las políticas deben venir como objeto.');
  }
  const b = v as Record<string, unknown>;

  const equipajeKg = entero(b['equipajeKg'], MAX_KG, 'Los kilos de equipaje');
  const equipajePiezas = entero(b['equipajePiezas'], MAX_PIEZAS, 'Las piezas de equipaje');
  const cancelacionHoras = entero(b['cancelacionHoras'], MAX_HORAS, 'Las horas de cancelación');

  let mascotas: PoliticaMascotas | undefined;
  if (b['mascotas'] != null && b['mascotas'] !== '') {
    if (!MASCOTAS.includes(b['mascotas'] as PoliticaMascotas)) {
      throw new Error('La política de mascotas no es válida.');
    }
    mascotas = b['mascotas'] as PoliticaMascotas;
  }

  let menores: PoliticaMenores | undefined;
  if (b['menores'] != null && b['menores'] !== '') {
    if (!MENORES.includes(b['menores'] as PoliticaMenores)) {
      throw new Error('La política de menores no es válida.');
    }
    menores = b['menores'] as PoliticaMenores;
  }

  const notas =
    typeof b['notas'] === 'string' && b['notas'].trim()
      ? b['notas'].trim().slice(0, MAX_NOTAS)
      : undefined;

  const p: PoliticasTiquete = {
    ...(equipajeKg !== undefined && { equipajeKg }),
    ...(equipajePiezas !== undefined && { equipajePiezas }),
    ...(mascotas && { mascotas }),
    ...(menores && { menores }),
    ...(cancelacionHoras !== undefined && { cancelacionHoras }),
    ...(notas && { notas }),
  };
  return Object.keys(p).length > 0 ? p : null;
}

/** Lo guardado, que pudo escribirlo una versión anterior. Nunca lanza. */
export function politicasGuardadas(v: unknown): PoliticasTiquete | null {
  try {
    return saneaPoliticas(v);
  } catch {
    return null;
  }
}

export function hayPoliticas(p: PoliticasTiquete | null | undefined): boolean {
  return Boolean(p && Object.keys(p).length > 0);
}

/**
 * Las líneas que se pintan, ya redactadas.
 *
 * Viven aquí y no en cada pantalla por la misma razón que el banner y la caja
 * de la promoción comparten función: el portal le enseña a la empresa lo que
 * está publicando y la app se lo enseña al pasajero, y si cada uno redactara
 * lo suyo acabarían diciendo cosas distintas de la misma regla.
 */
export function lineasDePolitica(p: PoliticasTiquete | null | undefined): string[] {
  if (!p) return [];
  const l: string[] = [];

  if (p.equipajeKg != null || p.equipajePiezas != null) {
    const piezas =
      p.equipajePiezas != null
        ? `${p.equipajePiezas} ${p.equipajePiezas === 1 ? 'pieza' : 'piezas'}`
        : null;
    const kilos = p.equipajeKg != null ? `${p.equipajeKg} kg` : null;
    const detalle = [piezas, kilos].filter(Boolean).join(' de hasta ');
    l.push(`Equipaje incluido: ${detalle} por pasajero.`);
  }

  if (p.mascotas) {
    l.push(
      p.mascotas === 'no'
        ? 'Mascotas: no se admiten.'
        : p.mascotas === 'transportin'
          ? 'Mascotas: se admiten en guacal o transportín.'
          : 'Mascotas: consulta con la empresa antes de viajar.',
    );
  }

  if (p.menores) {
    l.push(
      p.menores === 'no_solos'
        ? 'Menores de edad: solo acompañados por un adulto.'
        : p.menores === 'con_autorizacion'
          ? 'Menores de edad: pueden viajar solos con autorización firmada y documento.'
          : 'Menores de edad: consulta con la empresa antes de viajar.',
    );
  }

  if (p.cancelacionHoras != null) {
    // El dinero NO pasa por la plataforma, así que aquí no se promete una
    // devolución: se dice con quién se arregla.
    l.push(
      p.cancelacionHoras === 0
        ? 'Cancelación: se admite hasta la hora de salida. La devolución del dinero se acuerda con la empresa.'
        : `Cancelación: hasta ${p.cancelacionHoras} ${p.cancelacionHoras === 1 ? 'hora' : 'horas'} antes de la salida. La devolución del dinero se acuerda con la empresa.`,
    );
  }

  if (p.notas) l.push(p.notas);
  return l;
}
