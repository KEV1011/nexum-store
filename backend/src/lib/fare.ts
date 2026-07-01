import { FARE_BASE, FARE_PER_KM, FARE_PER_MIN, FARE_MINIMUM, COMMISSION_RATE } from '../config/constants';

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
  const commission = Math.round(grossFare * COMMISSION_RATE);
  const netEarning = grossFare - commission;
  return { grossFare, commission, netEarning };
}
