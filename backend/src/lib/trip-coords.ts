/**
 * Validación del punto de recogida y del destino de un viaje.
 *
 * Existe porque durante meses el servicio rellenó las coordenadas que faltaban
 * con el centro de Pamplona (7.3754, -72.6486) para el origen y un punto a unos
 * 800 m en diagonal para el destino. Parecía inofensivo —"algo hay que poner
 * para pintar el mapa"— y no lo era: `startMatchingCycle` busca conductores
 * alrededor del origen, así que un pasajero de cualquier otra ciudad se
 * emparejaba contra el obelisco de Pamplona y no le aparecía nadie, sin que él
 * ni nosotros supiéramos por qué. Encima el mapa le dibujaba un trayecto entre
 * dos sitios en los que no había estado nunca.
 *
 * La regla es que no se inventa una coordenada. Si no la hay, se dice.
 */

/** Punto válido de un viaje. */
export interface PuntoViaje {
  lat: number;
  lng: number;
}

export class CoordenadaFaltante extends Error {}

/**
 * Rango de coordenadas terrestres. No se acota a Colombia a propósito: el
 * negocio es colombiano hoy, pero rechazar aquí una coordenada por estar fuera
 * del país mezcla dos decisiones distintas y convertiría una expansión en una
 * cacería de validaciones escondidas. Lo que se rechaza es lo imposible.
 */
function esCoordenadaPosible(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // (0, 0) es el "null island" del Atlántico: casi siempre significa que
    // alguien mandó un cero por defecto, no que el viaje salga de allí.
    !(lat === 0 && lng === 0)
  );
}

/**
 * Devuelve el punto o lanza [CoordenadaFaltante] con un mensaje que dice qué
 * hacer. El mensaje llega tal cual a la pantalla del pasajero, así que nombra
 * el botón que tiene delante.
 */
export function exigirPuntoRecogida(
  lat: number | null | undefined,
  lng: number | null | undefined,
): PuntoViaje {
  if (!esCoordenadaPosible(lat, lng)) {
    throw new CoordenadaFaltante(
      'Necesitamos el punto exacto de recogida. Toca "Usar mi ubicación actual" o elige el sitio en el mapa.',
    );
  }
  return { lat: lat as number, lng: lng as number };
}

export function exigirPuntoDestino(
  lat: number | null | undefined,
  lng: number | null | undefined,
): PuntoViaje {
  if (!esCoordenadaPosible(lat, lng)) {
    throw new CoordenadaFaltante(
      'Necesitamos el punto exacto del destino. Elígelo en el mapa con el icono de la derecha del campo.',
    );
  }
  return { lat: lat as number, lng: lng as number };
}
