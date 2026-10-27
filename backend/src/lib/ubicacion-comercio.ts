// ── Dónde está un comercio, y dónde se le busca repartidor ───────────────────
//
// EL REPORTE: «cuando el local no ha pagado o no se ha registrado con nosotros
// y se hace el pedido de su menú, queda buscando quién lo reciba y nunca llega
// a ningún repartidor».
//
// LA CAUSA: la ficha del comercio y el registro geocodificaban la dirección
// SIN ciudad — «Calle 5 # 3-40, Colombia» —, y esa dirección existe en media
// Colombia: Google devolvía la de cualquier ciudad. El comercio quedaba
// guardado a cientos de kilómetros, el despacho buscaba repartidor en un radio
// de 5 km alrededor de ESE punto, no había nadie, reintentaba diez minutos y se
// rendía. Desde fuera se veía como «el sistema no despacha».
//
// LAS REGLAS:
//
//   1. Con la ciudad declarada, el punto tiene que caer cerca de ella (radio
//      de la plaza). Si no, NO se guarda: un comercio sin punto se resuelve
//      fijándolo en el mapa; uno con el punto en otra ciudad no lo ve nadie y
//      parece funcionar.
//   2. Sin ciudad declarada (apps y formularios viejos), el punto vale solo si
//      cae en alguna plaza donde operamos.
//   3. El despacho se ancla al punto del comercio si es confiable; si no, al
//      centro de SU ciudad; si tampoco se sabe, a la entrega del cliente — que
//      casi siempre está en la misma ciudad —. El centro de Pamplona queda
//      solo para cuando no se sabe absolutamente nada.

export interface Punto {
  lat: number;
  lng: number;
}

export interface Plaza extends Punto {
  slug: string;
}

/** El radio de una plaza: el mismo que usa `plazaDeCoordenadas` (ZONA_MAX_KM). */
export const RADIO_PLAZA_KM = Number(process.env['ZONA_MAX_KM'] ?? 40);

export function kmEntre(a: Punto, b: Punto): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function valido(p: Punto | null | undefined): p is Punto {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);
}

export interface UbicacionDecidida {
  lat: number | null;
  lng: number | null;
  citySlug: string | null;
  /** El geocodificador devolvió algo y se descartó por caer lejos de la ciudad. */
  descartado: boolean;
}

/**
 * Qué se guarda del resultado del geocodificador.
 *
 * `plazaDelPunto` es la plaza que resuelve `plazaDeCoordenadas` para el punto
 * geocodificado (null si cae lejos de todas).
 */
export function decidirUbicacion(
  punto: Punto | null,
  ciudadDeclarada: Plaza | null,
  plazaDelPunto: string | null,
): UbicacionDecidida {
  if (ciudadDeclarada) {
    if (valido(punto) && kmEntre(punto, ciudadDeclarada) <= RADIO_PLAZA_KM) {
      return { lat: punto.lat, lng: punto.lng, citySlug: ciudadDeclarada.slug, descartado: false };
    }
    return { lat: null, lng: null, citySlug: ciudadDeclarada.slug, descartado: valido(punto) };
  }
  if (valido(punto) && plazaDelPunto) {
    return { lat: punto.lat, lng: punto.lng, citySlug: plazaDelPunto, descartado: false };
  }
  return { lat: null, lng: null, citySlug: null, descartado: valido(punto) };
}

/**
 * ¿El punto guardado de un comercio es de fiar? Lo es si cae dentro de su
 * plaza; sin plaza declarada, se da por bueno (no hay contra qué compararlo).
 */
export function puntoConfiable(punto: Punto | null, plaza: Punto | null): boolean {
  if (!valido(punto)) return false;
  if (!plaza) return true;
  return kmEntre(punto, plaza) <= RADIO_PLAZA_KM;
}

export type OrigenAncla = 'comercio' | 'ciudad' | 'entrega' | 'desconocido';

/** Dónde se busca repartidor para comprar en un comercio. */
export function anclaDeCompra(
  comercio: Punto | null,
  plaza: Punto | null,
  entrega: Punto | null,
  porDefecto: Punto,
): Punto & { origen: OrigenAncla } {
  if (valido(comercio) && puntoConfiable(comercio, plaza)) return { ...comercio, origen: 'comercio' };
  if (valido(plaza)) return { lat: plaza.lat, lng: plaza.lng, origen: 'ciudad' };
  if (valido(entrega)) return { lat: entrega.lat, lng: entrega.lng, origen: 'entrega' };
  return { ...porDefecto, origen: 'desconocido' };
}

export type MotivoDudoso = 'sin-punto' | 'sin-plaza' | 'lejos-de-su-ciudad';

/** Por qué la ubicación de un comercio necesita que alguien la mire, o null. */
export function motivoUbicacionDudosa(
  punto: Punto | null,
  plaza: Punto | null,
  plazaSlug: string | null,
): MotivoDudoso | null {
  if (!valido(punto)) return 'sin-punto';
  if (!plazaSlug) return 'sin-plaza';
  if (plaza && kmEntre(punto, plaza) > RADIO_PLAZA_KM) return 'lejos-de-su-ciudad';
  return null;
}
