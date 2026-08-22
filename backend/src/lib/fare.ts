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
  return desglosar(grossFare);
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
  return desglosar(precioCategoria(tarifa, distanceKm, minutes, surgeMultiplier).fare);
}
