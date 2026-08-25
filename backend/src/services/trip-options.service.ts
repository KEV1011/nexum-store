// ─────────────────────────────────────────────────────────────────────────────
// Opciones de viaje: qué categorías puede pedir el pasajero y a qué precio.
//
// Antes la app tenía UN botón por servicio y calculaba el precio ella misma con
// tres fórmulas escritas en Dart. Eso tiene dos problemas graves:
//
//   • El precio lo decidía el teléfono. `POST /client/trips/request` guardaba
//     `estimatedFare` tal cual llegaba, así que una petición modificada podía
//     pedir una carrera de $1. Aquí el servidor calcula, y el que crea el viaje
//     vuelve a calcular: el número del cliente nunca se guarda como precio.
//
//   • Las fórmulas del teléfono y la del servidor eran distintas, así que el
//     pasajero veía una cifra al pedir y otra al bajarse. Con esto hay una sola
//     fuente: lib/tarifa-categoria.ts.
//
// El primer caso real es el TAXI, que es la empresa que arranca. Su tarifa la
// fija el decreto municipal, no nosotros, y por eso no admite multiplicador por
// demanda (ver lib/tarifa-categoria.ts).
// ─────────────────────────────────────────────────────────────────────────────

import {
  CATEGORIAS,
  CategoriaViaje,
  tablaTarifas,
  precioCategoria,
  marcarMasBarata,
} from '../lib/tarifa-categoria';
import { getSurgeMultiplier } from './surge.service';
import { disponibilidadPorTipoVehiculo } from './matching.service';
import { directions } from './geo.service';

/**
 * Velocidad urbana nominal para estimar en cuántos minutos llega el conductor
 * más cercano. No es un dato medido: es una estimación declarada, del mismo
 * orden que la que hace cualquier plataforma antes de asignar. El factor de
 * calle corrige que la distancia en línea recta siempre se queda corta —
 * las calles no van en diagonal.
 */
const VELOCIDAD_URBANA_KMH = 22;
const FACTOR_CALLE = 1.3;

export interface OpcionViaje {
  categoria: CategoriaViaje;
  nombre: string;
  descripcion: string;
  capacidad: number;
  /** Precio final que pagará el pasajero, en COP. */
  fare: number;
  /** Precio antes del multiplicador por demanda (igual a `fare` si no hubo). */
  baseFare: number;
  surgeMultiplier: number;
  /** La tarifa la fija una autoridad municipal, no Nexum. */
  regulada: boolean;
  /** Minutos hasta la recogida, o null si no hay ningún vehículo del tipo cerca. */
  etaMinutes: number | null;
  /** Cuántos vehículos de esta categoría están disponibles en el radio. */
  availableNearby: number;
  /** Falso ⇒ se muestra apagada: no hay a quién ofrecérselo ahora mismo. */
  disponible: boolean;
  /** La más barata de las que hay. Nunca se marca si no hay con qué comparar. */
  cheapest: boolean;
}

export interface OpcionesViaje {
  distanceKm: number;
  durationMinutes: number;
  /** Verdadero si la distancia salió de Google Routes; falso si es línea recta. */
  rutaReal: boolean;
  opciones: OpcionViaje[];
}

// ─── Distancia ────────────────────────────────────────────────────────────────

const RADIO_TIERRA_KM = 6371;

export function distanciaHaversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const rad = (g: number): number => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
}

/**
 * Trayecto entre dos puntos. Intenta la ruta real por calles; si no hay llave
 * de Google o la API falla, cae a la línea recta corregida por el factor de
 * calle y lo DICE (`rutaReal: false`), para que la app pueda avisar de que el
 * precio es aproximado en vez de presentarlo como definitivo.
 */
export async function medirTrayecto(
  originLat: number, originLng: number, destLat: number, destLng: number,
): Promise<{ distanceKm: number; durationMinutes: number; rutaReal: boolean }> {
  try {
    const ruta = await directions(originLat, originLng, destLat, destLng);
    if (ruta.distanceKm > 0) {
      return {
        distanceKm: ruta.distanceKm,
        durationMinutes: ruta.durationMinutes,
        rutaReal: true,
      };
    }
  } catch (e) {
    console.warn('[Opciones] sin ruta real, se estima en línea recta:', (e as Error).message);
  }
  const recta = distanciaHaversineKm(originLat, originLng, destLat, destLng);
  const distanceKm = Math.round(recta * FACTOR_CALLE * 10) / 10;
  return {
    distanceKm,
    durationMinutes: Math.max(1, Math.round((distanceKm / VELOCIDAD_URBANA_KMH) * 60)),
    rutaReal: false,
  };
}

/** Minutos hasta la recogida desde la distancia en línea recta al conductor. */
export function etaDesdeMetros(metros: number): number {
  const km = (metros / 1000) * FACTOR_CALLE;
  return Math.max(1, Math.round((km / VELOCIDAD_URBANA_KMH) * 60));
}

// ─── Opciones ─────────────────────────────────────────────────────────────────

export async function getTripOptions(
  originLat: number, originLng: number, destLat: number, destLng: number,
): Promise<OpcionesViaje> {
  const [trayecto, disponibilidad, surge] = await Promise.all([
    medirTrayecto(originLat, originLng, destLat, destLng),
    disponibilidadPorTipoVehiculo(originLat, originLng),
    getSurgeMultiplier(originLat, originLng),
  ]);

  const tabla = tablaTarifas();

  const crudas = CATEGORIAS.map((cat) => {
    const tarifa = tabla[cat];
    const precio = precioCategoria(
      tarifa, trayecto.distanceKm, trayecto.durationMinutes, surge.multiplier,
    );

    // Una categoría puede atenderse con varios tipos de vehículo: se suman los
    // disponibles y se toma el más cercano de todos ellos.
    let cuantos = 0;
    let distanciaMinM = Infinity;
    for (const tipo of tarifa.tiposVehiculo) {
      const d = disponibilidad.get(tipo);
      if (!d) continue;
      cuantos += d.cuantos;
      distanciaMinM = Math.min(distanciaMinM, d.distanciaMinM);
    }

    return {
      categoria: cat,
      nombre: tarifa.nombre,
      descripcion: tarifa.descripcion,
      capacidad: tarifa.capacidad,
      fare: precio.fare,
      baseFare: precio.base,
      surgeMultiplier: precio.surgeAplicado,
      regulada: tarifa.regulada,
      etaMinutes: cuantos > 0 ? etaDesdeMetros(distanciaMinM) : null,
      availableNearby: cuantos,
      disponible: cuantos > 0,
      cheapest: false,
    };
  });

  // "La más barata" solo se compara entre las que de verdad se pueden pedir:
  // marcar como más barata una categoría sin un solo vehículo cerca es
  // empujar al pasajero hacia la espera más larga.
  const conDisponibles = crudas.filter((o) => o.disponible);
  const marcadas = marcarMasBarata(conDisponibles);
  const porCategoria = new Map(marcadas.map((o) => [o.categoria, o.cheapest]));

  return {
    distanceKm: trayecto.distanceKm,
    durationMinutes: trayecto.durationMinutes,
    rutaReal: trayecto.rutaReal,
    opciones: crudas.map((o) => ({ ...o, cheapest: porCategoria.get(o.categoria) ?? false })),
  };
}

/**
 * Precio de una categoría concreta, para que el servidor lo recalcule al crear
 * el viaje en vez de creerle al teléfono. Devuelve también la distancia usada,
 * que es la que se guarda: la del cliente tampoco es de fiar.
 */
/**
 * Mide el trayecto pasando por las paradas, no en línea del origen al destino.
 *
 * Sin esto, añadir paradas sería gratis: el pasajero mete tres desvíos y paga
 * la carrera directa, y el conductor conduce de más por el mismo dinero. Se
 * suman los tramos —origen → p1 → … → destino— con la misma medición de
 * siempre, así que hereda la ruta real de Google donde la haya.
 *
 * Solo cuentan las paradas CON coordenadas: una escrita a mano y sin punto no
 * se puede medir, y estimarla a ojo sería inventar kilómetros.
 */
export async function medirConParadas(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
  paradas: Array<{ lat?: number; lng?: number }> = [],
): Promise<{ distanceKm: number; durationMinutes: number; rutaReal: boolean }> {
  const puntos: Array<[number, number]> = [
    [originLat, originLng],
    ...paradas
      .filter((p): p is { lat: number; lng: number } =>
        typeof p.lat === 'number' && typeof p.lng === 'number')
      .map((p): [number, number] => [p.lat, p.lng]),
    [destLat, destLng],
  ];
  if (puntos.length === 2) {
    return medirTrayecto(originLat, originLng, destLat, destLng);
  }

  const tramos = await Promise.all(
    puntos.slice(0, -1).map((a, i) => {
      const b = puntos[i + 1]!;
      return medirTrayecto(a[0], a[1], b[0], b[1]);
    }),
  );
  return {
    distanceKm: Math.round(tramos.reduce((s, t) => s + t.distanceKm, 0) * 10) / 10,
    durationMinutes: tramos.reduce((s, t) => s + t.durationMinutes, 0),
    // Solo se declara ruta real si TODOS los tramos lo son: medio trayecto por
    // calles y medio en línea recta no es una ruta real, es un promedio.
    rutaReal: tramos.every((t) => t.rutaReal),
  };
}

export async function precioServidor(
  categoria: CategoriaViaje,
  originLat: number, originLng: number, destLat: number, destLng: number,
  paradas: Array<{ lat?: number; lng?: number }> = [],
): Promise<{ fare: number; distanceKm: number; durationMinutes: number; surge: number }> {
  const tarifa = tablaTarifas()[categoria];
  const [trayecto, surge] = await Promise.all([
    medirConParadas(originLat, originLng, destLat, destLng, paradas),
    getSurgeMultiplier(originLat, originLng),
  ]);
  const precio = precioCategoria(
    tarifa, trayecto.distanceKm, trayecto.durationMinutes, surge.multiplier,
  );
  return {
    fare: precio.fare,
    distanceKm: trayecto.distanceKm,
    durationMinutes: trayecto.durationMinutes,
    surge: precio.surgeAplicado,
  };
}
