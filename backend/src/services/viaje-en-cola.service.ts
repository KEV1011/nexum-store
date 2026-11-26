// ── «Tu conductor está terminando otro viaje» ────────────────────────────────
//
// Con los viajes encadenados, un conductor que va con un pasajero a bordo y
// está a menos de CHAIN_NEAR_DEST_M de su destino puede aceptar el siguiente.
// El pasajero de ese siguiente viaje ve el carro en el mapa yendo hacia OTRO
// lado y recibe «tu conductor va en camino»: sin explicarle por qué, se lee
// como que el conductor no viene. Uber y DiDi lo dicen; aquí también.
//
// Vive aparte de client.service y de matching.service porque los dos lo usan y
// matching no puede importar client (el ciclo ya está documentado).

import { prisma } from '../lib/prisma';

/**
 * ¿El conductor de este viaje sigue terminando OTRO viaje con pasajero?
 *
 * Solo mientras el viaje está ACEPTADO: en cuanto el conductor arranca hacia
 * la recogida (ARRIVING) ya terminó el anterior. Best-effort: si la consulta
 * falla se dice que no — la tarjeta normal del conductor sigue siendo cierta.
 */
export async function conductorTerminandoOtroViaje(trip: {
  id: string;
  status: string;
  driverId: string | null;
}): Promise<boolean> {
  if (trip.status !== 'ACCEPTED' || !trip.driverId) return false;
  try {
    const otros = await prisma.trip.count({
      where: { driverId: trip.driverId, id: { not: trip.id }, status: 'IN_PROGRESS' },
    });
    return otros > 0;
  } catch {
    return false;
  }
}
