// ── Rendimiento de combustible (km por galón) ─────────────────────────────────
//
// El dato ya se venía capturando y nadie lo usaba: cada tanqueo registra
// galones y odómetro. Con eso sale el rendimiento real de cada camión, que es
// como una empresa de carga detecta un motor en mal estado, una ruta que sale
// cara o un conductor que factura combustible de más.
//
// Método tanque a tanque, el estándar del oficio: entre dos tanqueos
// consecutivos del MISMO vehículo, los kilómetros son la diferencia de
// odómetro y los galones son los del segundo tanqueo (el que llenó lo que se
// consumió en ese tramo). El primer tanqueo nunca aporta rendimiento — no hay
// tramo anterior contra el cual medir.
//
// Los datos los teclea un conductor en la carretera, así que el filtro de
// tramos absurdos no es opcional: un odómetro mal escrito puede inventar
// 90.000 km y arruinar el promedio de todo el mes.

/** Un tramo mayor que esto entre tanqueos es un error de digitación. */
const MAX_TRAMO_KM = 3000;
/** Galones fuera de este rango no corresponden a un tanque real. */
const MIN_GALONES = 1;
const MAX_GALONES = 400;

export interface FuelReading {
  /** Placa o id del vehículo al que pertenece el tanqueo. */
  vehicle: string;
  odometerKm: number | null;
  gallons: number | null;
  amountCop: number | null;
  at: Date;
}

export interface VehicleEfficiency {
  vehicle: string;
  /** Tanqueos con datos utilizables. */
  fills: number;
  /** Tramos medidos (siempre uno menos que los tanqueos válidos). */
  segments: number;
  km: number;
  gallons: number;
  /** Kilómetros por galón; 0 si aún no hay dos tanqueos con odómetro. */
  kmPerGallon: number;
  /** Costo del combustible por kilómetro recorrido. */
  costPerKm: number;
  spentCop: number;
}

/**
 * Rendimiento por vehículo. Devuelve solo los que tienen algo que decir,
 * ordenados del más eficiente al menos — así el peor queda a la vista abajo.
 */
export function fuelEfficiency(readings: FuelReading[]): VehicleEfficiency[] {
  const porVehiculo = new Map<string, FuelReading[]>();
  for (const r of readings) {
    if (!r.vehicle) continue;
    const lista = porVehiculo.get(r.vehicle) ?? [];
    lista.push(r);
    porVehiculo.set(r.vehicle, lista);
  }

  const salida: VehicleEfficiency[] = [];

  for (const [vehicle, lista] of porVehiculo) {
    // El gasto se cuenta sobre TODOS los tanqueos, aunque no midan tramo:
    // la plata salió igual.
    const spentCop = lista.reduce((s, r) => s + (r.amountCop ?? 0), 0);

    const validos = lista
      .filter((r) => r.odometerKm != null && r.odometerKm > 0)
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    let km = 0;
    let gallons = 0;
    let segments = 0;

    for (let i = 1; i < validos.length; i++) {
      const prev = validos[i - 1]!;
      const cur = validos[i]!;
      const tramo = (cur.odometerKm as number) - (prev.odometerKm as number);
      const gal = cur.gallons ?? 0;
      // Odómetro que retrocede (cambio de tablero, dato mal escrito) o tramo
      // imposible: se descarta el tramo, no el vehículo.
      if (tramo <= 0 || tramo > MAX_TRAMO_KM) continue;
      if (gal < MIN_GALONES || gal > MAX_GALONES) continue;
      km += tramo;
      gallons += gal;
      segments++;
    }

    salida.push({
      vehicle,
      fills: lista.length,
      segments,
      km: Math.round(km),
      gallons: Math.round(gallons * 100) / 100,
      kmPerGallon: gallons > 0 ? Math.round((km / gallons) * 100) / 100 : 0,
      costPerKm: km > 0 ? Math.round(spentCop / km) : 0,
      spentCop,
    });
  }

  return salida.sort((a, b) => b.kmPerGallon - a.kmPerGallon);
}
