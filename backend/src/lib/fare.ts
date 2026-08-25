import { FARE_BASE, FARE_PER_KM, FARE_PER_MIN, FARE_MINIMUM, COMMISSION_RATE } from '../config/constants';
import { categoriaDeServicio, tablaTarifas, precioCategoria } from './tarifa-categoria';

export interface FareBreakdown {
  grossFare: number;
  commission: number;
  netEarning: number;
}

/**
 * Cálculo de tarifa canónico. Compartido por el despacho en memoria
 * (trip.service) y por el ciclo de viaje real basado en WebSocket
 * (client.service) para que ambos liquiden EXACTAMENTE igual.
 */
export function calcFare(distanceKm: number, minutes: number): FareBreakdown {
  const raw = FARE_BASE + distanceKm * FARE_PER_KM + minutes * FARE_PER_MIN;
  const grossFare = Math.round(Math.max(raw, FARE_MINIMUM));
  return desglosar(conTope(grossFare, distanceKm, minutes));
}

/**
 * Techo de lo que puede costar un servicio urbano, dado su trayecto.
 *
 * Existe porque no había NADA entre un número mal calculado y la billetera del
 * conductor. En las pruebas apareció una carrera de 89.887 $ sobre 3,2 km —de
 * 119.721 $ de ganancias totales, una sola carrera— y nada chilló: se liquidó,
 * se sumó al histórico y ahí se quedó. Un cero de más en una tarifa, un
 * `distanceKm` en metros, o una demanda mal multiplicada llegan por el mismo
 * camino, y cuando el dinero ya está abonado deshacerlo es una conversación
 * con un conductor, no un `UPDATE`.
 *
 * El techo se deriva de la propia tabla de tarifas —el banderazo, el precio por
 * kilómetro y el precio por minuto MÁS CAROS de todas las categorías— para que
 * no se quede desfasado cuando alguien suba una tarifa. Encima, un factor
 * holgado que deja pasar la demanda alta y cualquier espera razonable: esto no
 * es para afinar el precio, es para atrapar lo absurdo.
 */
const FACTOR_CORDURA = 3;

export function topeDeCordura(distanceKm: number, minutes: number): number {
  const tarifas = Object.values(tablaTarifas());
  const max = (f: (t: (typeof tarifas)[number]) => number) =>
    tarifas.reduce((a, t) => Math.max(a, f(t)), 0);

  const km = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  const min = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;

  const plausible =
    max((t) => t.banderazo) + km * max((t) => t.porKm) + min * max((t) => t.porMin);

  // El suelo es el mínimo más caro: una carrera de 0 km cobrando la mínima es
  // correcto y no debe caer en el tope.
  return Math.round(Math.max(plausible, max((t) => t.minimo)) * FACTOR_CORDURA);
}

/**
 * Aplica el techo y DEJA CONSTANCIA. Recortar en silencio cambiaría un error
 * ruidoso por uno callado: el viaje se cobraría mal igual, solo que sin rastro.
 */
export function conTope(grossFare: number, distanceKm: number, minutes: number): number {
  if (!Number.isFinite(grossFare) || grossFare < 0) {
    console.error(`[Tarifa] bruto inválido (${grossFare}); se cobra 0`);
    return 0;
  }
  const tope = topeDeCordura(distanceKm, minutes);
  if (grossFare <= tope) return grossFare;
  console.error(
    `[Tarifa] ${grossFare} supera el tope de cordura ${tope} ` +
    `(${distanceKm} km, ${minutes} min): se cobra el tope. Revisa el cálculo.`,
  );
  return tope;
}

/** Reparte un bruto entre comisión y neto del conductor. */
export function desglosar(grossFare: number): FareBreakdown {
  const commission = Math.round(grossFare * COMMISSION_RATE);
  return { grossFare, commission, netEarning: grossFare - commission };
}

/**
 * Liquidación de un viaje de pasajero, por su categoría.
 *
 * Existe porque al cobrar se usaba `calcFare` —la fórmula genérica— aunque al
 * pedir se hubiera cotizado con la tarifa del taxi: el pasajero veía un precio
 * y pagaba otro, y el conductor cobraba por un baremo que no era el suyo.
 *
 * El multiplicador por demanda que se aplicó al cotizar se aplica también al
 * cobrar; en tarifa regulada `precioCategoria` lo ignora, así que un taxi
 * liquida por decreto pase lo que pase.
 */
export function liquidarViaje(
  serviceType: string | null | undefined,
  distanceKm: number,
  minutes: number,
  surgeMultiplier = 1,
): FareBreakdown {
  const categoria = categoriaDeServicio(serviceType);
  if (!categoria) return calcFare(distanceKm, minutes); // ENVIOS y demás
  const tarifa = tablaTarifas()[categoria];
  const bruto = precioCategoria(tarifa, distanceKm, minutes, surgeMultiplier).fare;
  return desglosar(conTope(bruto, distanceKm, minutes));
}
