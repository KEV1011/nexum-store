/**
 * Las reglas de la reserva de un viaje por puestos URBANO que no son de la
 * salida intermunicipal: dónde recoger a la persona y cómo va a pagar.
 *
 * POR QUÉ EXISTE. La reserva se hacía con una dirección escrita y OPCIONAL
 * («¿Dónde te recogemos? (opcional)»). En un taxi por puestos eso deja al
 * conductor con cuatro pasajeros, ningún punto en el mapa y ninguna forma de
 * planear el orden de las recogidas — o, sin dirección, sin saber a dónde ir.
 * Y no había forma de decir cómo se iba a pagar, así que el conductor se
 * enteraba en la puerta de que le iban a transferir.
 *
 * Solo aplica a URBANO: la salida intermunicipal tiene sus puntos de embarque
 * y su propio cobro (`lib/cobro-pasaje.ts`), y esas reglas no se tocan.
 */
import { metodoPorValor } from './metodos-pago';

/** A cuántos km del origen del viaje puede quedar una recogida. */
export const RECOGIDA_MAX_KM = 25;

export const RECOGIDA_FALTA =
  'Marca en el mapa dónde te recogemos: el taxista necesita el punto para ir por ti.';

export interface RecogidaPuesto {
  direccion: string;
  lat: number;
  lng: number;
}

function _coordValida(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    // (0,0) es el Golfo de Guinea: en la práctica significa «falta el dato».
    && !(lat === 0 && lng === 0);
}

function _km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * La recogida saneada, o el motivo para rechazarla.
 *
 * Exige las DOS cosas, dirección y punto: el punto es lo que el conductor
 * navega, y la dirección es lo que le dice por qué esquina entrar. Un punto a
 * más de `RECOGIDA_MAX_KM` del origen del viaje se rechaza: es otro municipio,
 * o un toque equivocado en el mapa, y el conductor lo descubriría manejando.
 */
export function recogidaDePuesto(p: {
  direccion: unknown;
  lat: unknown;
  lng: unknown;
  origenLat?: number | null;
  origenLng?: number | null;
}): { recogida: RecogidaPuesto } | { motivo: string } {
  const direccion = typeof p.direccion === 'string' ? p.direccion.trim().slice(0, 200) : '';
  if (!direccion || !_coordValida(p.lat, p.lng)) return { motivo: RECOGIDA_FALTA };
  const lat = p.lat as number;
  const lng = p.lng as number;
  if (p.origenLat != null && p.origenLng != null
    && _km(p.origenLat, p.origenLng, lat, lng) > RECOGIDA_MAX_KM) {
    return {
      motivo: 'Ese punto queda muy lejos de donde sale el viaje. Revisa el pin en el mapa.',
    };
  }
  return { recogida: { direccion, lat, lng } };
}

/**
 * El método de pago de un puesto, o el motivo para rechazarlo.
 *
 * Sin método se acepta y se guarda NULL: las apps ya instaladas no lo mandan,
 * y dejarlas sin poder reservar sería peor que un «no indicado». Lo que SÍ se
 * rechaza es el pago en línea: el puesto se le paga al conductor en la mano y
 * por la app no pasa un peso, así que aceptarlo haría creer al pasajero que
 * ya pagó y al conductor que ya cobró.
 */
export function metodoDePuesto(v: unknown): { metodo: string | null } | { motivo: string } {
  if (v == null || v === '') return { metodo: null };
  const m = metodoPorValor(typeof v === 'string' ? v : null);
  if (!m) return { motivo: 'Ese método de pago no lo conocemos.' };
  if (m.quienCobra !== 'conductor') {
    return {
      motivo: 'El puesto se le paga al conductor: elige efectivo o una transferencia.',
    };
  }
  return { metodo: m.valor };
}

/** Lo que ve el conductor junto a «Cobrar $X». */
export function etiquetaDePagoDePuesto(metodo: string | null | undefined): string {
  return metodoPorValor(metodo)?.etiqueta ?? 'Pago no indicado';
}
