import dotenv from 'dotenv';
import path from 'path';
import { Driver, Passenger, Location } from '../types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ─── Server ───────────────────────────────────────────────────────────────────

export const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
export const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

// ─── Auth ─────────────────────────────────────────────────────────────────────

// El secreto JWT DEBE venir del entorno en cualquier despliegue: con el default
// publicado en el repo cualquiera podría firmar tokens válidos. El respaldo solo
// se permite en desarrollo local (NODE_ENV=development). Fuera de ahí —
// producción, staging o NODE_ENV mal configurado a un valor no-dev— arrancar sin
// un secreto propio (o usando el valor público conocido) aborta el proceso.
const _PUBLIC_FALLBACK_SECRET = 'nexum-driver-secret-key-2024';
const _jwtSecret = process.env['JWT_SECRET'];
if (
  NODE_ENV === 'production' &&
  (!_jwtSecret ||
    _jwtSecret === 'CHANGE_ME_IN_PRODUCTION' ||
    _jwtSecret === _PUBLIC_FALLBACK_SECRET)
) {
  throw new Error(
    'JWT_SECRET must be set to a strong random value in production ' +
      '(openssl rand -hex 32). El valor de respaldo del repo está prohibido.',
  );
}
export const JWT_SECRET = _jwtSecret ?? _PUBLIC_FALLBACK_SECRET;
export const JWT_EXPIRES_IN = '30d';

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? '*';
// URL del portal web (links de negocio). El default apunta al portal REAL
// de producción — 'nexum.app' no existe y generaba enlaces muertos.
export const PORTAL_BASE_URL = process.env['PORTAL_BASE_URL'] ?? 'https://nexum-store.onrender.com';

// ─── Fare Rates (COP) ─────────────────────────────────────────────────────────

export const FARE_BASE = 3500;
export const FARE_PER_KM = 800;
export const FARE_PER_MIN = 150;
export const FARE_MINIMUM = 5000;
export const COMMISSION_RATE = 0.15;

// ─── Payouts (retiros del conductor) ──────────────────────────────────────────

/** Monto mínimo de retiro en COP. Configurable por entorno. */
export const MIN_PAYOUT_COP = Number(process.env['MIN_PAYOUT_COP'] ?? 20_000);

// ─── Surge Pricing ────────────────────────────────────────────────────────────

/** Hard upper cap on the surge multiplier (e.g. 2.0 = at most 2× base fare). */
export const SURGE_MAX = 2.0;
/** Radius (metres) used to count nearby SEARCHING trips and ONLINE drivers. */
export const SURGE_RADIUS_M = 5_000;
/** Only count SEARCHING trips created in the last N minutes as "demand". */
export const SURGE_WINDOW_MIN = 15;

// ─── Dispatch Timing (ms) ─────────────────────────────────────────────────────

export const DISPATCH_MIN_INTERVAL_MS = 45_000;
export const DISPATCH_MAX_INTERVAL_MS = 90_000;
export const TRIP_REQUEST_TIMEOUT_MS = 15_000;

// ─── Mock Driver ─────────────────────────────────────────────────────────────

export const MOCK_DRIVER: Driver = {
  id: 'driver-001',
  name: 'Juan Carlos Villamizar Contreras',
  phone: '+57 312 456 7890',
  rating: 4.87,
  totalTrips: 312,
  vehicle: {
    brand: 'Chevrolet',
    model: 'Spark GT',
    year: 2020,
    plate: 'KGB-742',
    color: 'Blanco perla',
  },
  bankAccount: {
    bank: 'Bancolombia',
    type: 'Ahorros',
    number: '****4521',
  },
};

// ─── Mock Passengers ─────────────────────────────────────────────────────────

export const MOCK_PASSENGERS: Passenger[] = [
  { id: 'passenger-001', name: 'María Fernanda Rangel', rating: 4.9 },
  { id: 'passenger-002', name: 'Andrés Felipe Bautista', rating: 4.7 },
  { id: 'passenger-003', name: 'Laura Ximena Carvajal', rating: 4.5 },
  { id: 'passenger-004', name: 'Sebastián Mora Peñaranda', rating: 4.8 },
  { id: 'passenger-005', name: 'Daniela Jaimes Ortega', rating: 4.3 },
];

// ─── Mock Routes (Pamplona, Colombia) ────────────────────────────────────────

export interface MockRoute {
  origin: Location;
  destination: Location;
  distanceKm: number;
  estimatedMinutes: number;
}

export const MOCK_ROUTES: MockRoute[] = [
  {
    origin: { lat: 7.3754, lng: -72.6486, address: 'Parque Agueda Gallardo' },
    destination: { lat: 7.3821, lng: -72.6512, address: 'Hospital San Juan de Dios' },
    distanceKm: 1.2,
    estimatedMinutes: 8,
  },
  {
    origin: { lat: 7.3698, lng: -72.6521, address: 'Terminal de Transportes' },
    destination: { lat: 7.3889, lng: -72.6445, address: 'Universidad de Pamplona' },
    distanceKm: 2.1,
    estimatedMinutes: 12,
  },
  {
    origin: { lat: 7.3741, lng: -72.6502, address: 'Calle 5 con Carrera 6' },
    destination: { lat: 7.3812, lng: -72.6578, address: 'Cementerio Central' },
    distanceKm: 1.8,
    estimatedMinutes: 10,
  },
  {
    origin: { lat: 7.3812, lng: -72.6423, address: 'Barrio La Esmeralda' },
    destination: { lat: 7.3769, lng: -72.6489, address: 'Plaza Principal' },
    distanceKm: 0.9,
    estimatedMinutes: 6,
  },
  {
    origin: { lat: 7.3734, lng: -72.6534, address: 'Supermercado La 14' },
    destination: { lat: 7.3801, lng: -72.6467, address: 'Clínica Pamplona' },
    distanceKm: 1.5,
    estimatedMinutes: 9,
  },
  {
    origin: { lat: 7.3769, lng: -72.6489, address: 'Plaza Principal' },
    destination: { lat: 7.3698, lng: -72.6521, address: 'Terminal de Transportes' },
    distanceKm: 1.3,
    estimatedMinutes: 8,
  },
  {
    origin: { lat: 7.3889, lng: -72.6445, address: 'Universidad de Pamplona' },
    destination: { lat: 7.3754, lng: -72.6486, address: 'Parque Agueda Gallardo' },
    distanceKm: 1.6,
    estimatedMinutes: 10,
  },
  {
    origin: { lat: 7.3801, lng: -72.6467, address: 'Clínica Pamplona' },
    destination: { lat: 7.3812, lng: -72.6423, address: 'Barrio La Esmeralda' },
    distanceKm: 1.1,
    estimatedMinutes: 7,
  },
  {
    origin: { lat: 7.3821, lng: -72.6512, address: 'Hospital San Juan de Dios' },
    destination: { lat: 7.3734, lng: -72.6534, address: 'Supermercado La 14' },
    distanceKm: 1.4,
    estimatedMinutes: 9,
  },
  {
    origin: { lat: 7.3812, lng: -72.6578, address: 'Cementerio Central' },
    destination: { lat: 7.3741, lng: -72.6502, address: 'Calle 5 con Carrera 6' },
    distanceKm: 1.7,
    estimatedMinutes: 11,
  },
];

// ─── Mandados (tarifa de servicio real) ──────────────────────────────────────


export const ERRAND_SERVICE_FEE = 6000;


// ─── Intercity Routes ─────────────────────────────────────────────────────────

import { IntercityCity } from '../types';

interface IntercityRouteInfo {
  distanceKm: number;
  durationMinutes: number;
  suggestedFarePerSeat: number;
  suggestedFareFleet: number;
  /**
   * Option B (dual model): trunk routes that legally require a habilitated
   * transport operator for a particular to carry paying passengers. Only
   * enforced when INTERCITY_DUAL_MODEL is enabled. See INTERCITY_LEGAL_NOTES.md.
   */
  requiresLicensedOperator?: boolean;
  /** True when this route was synthesised from city coordinates (no explicit row). */
  isEstimated?: boolean;
}

type RoutePair = `${IntercityCity}-${IntercityCity}`;

export const INTERCITY_ROUTES: Partial<Record<RoutePair, IntercityRouteInfo>> = {
  'pamplona-cucuta': { distanceKm: 95, durationMinutes: 120, suggestedFarePerSeat: 22000, suggestedFareFleet: 70000 },
  'cucuta-pamplona': { distanceKm: 95, durationMinutes: 120, suggestedFarePerSeat: 22000, suggestedFareFleet: 70000 },
  'pamplona-bucaramanga': { distanceKm: 200, durationMinutes: 240, suggestedFarePerSeat: 42000, suggestedFareFleet: 130000, requiresLicensedOperator: true },
  'bucaramanga-pamplona': { distanceKm: 200, durationMinutes: 240, suggestedFarePerSeat: 42000, suggestedFareFleet: 130000, requiresLicensedOperator: true },
  'pamplona-chitaga': { distanceKm: 45, durationMinutes: 60, suggestedFarePerSeat: 10000, suggestedFareFleet: 35000 },
  'chitaga-pamplona': { distanceKm: 45, durationMinutes: 60, suggestedFarePerSeat: 10000, suggestedFareFleet: 35000 },
  'pamplona-malaga': { distanceKm: 80, durationMinutes: 105, suggestedFarePerSeat: 18000, suggestedFareFleet: 58000 },
  'malaga-pamplona': { distanceKm: 80, durationMinutes: 105, suggestedFarePerSeat: 18000, suggestedFareFleet: 58000 },
  'pamplona-ocana': { distanceKm: 120, durationMinutes: 150, suggestedFarePerSeat: 28000, suggestedFareFleet: 90000 },
  'ocana-pamplona': { distanceKm: 120, durationMinutes: 150, suggestedFarePerSeat: 28000, suggestedFareFleet: 90000 },
  'pamplona-bogota': { distanceKm: 500, durationMinutes: 540, suggestedFarePerSeat: 90000, suggestedFareFleet: 280000, requiresLicensedOperator: true },
  'bogota-pamplona': { distanceKm: 500, durationMinutes: 540, suggestedFarePerSeat: 90000, suggestedFareFleet: 280000, requiresLicensedOperator: true },
  'chitaga-cucuta': { distanceKm: 140, durationMinutes: 170, suggestedFarePerSeat: 30000, suggestedFareFleet: 95000 },
  'cucuta-chitaga': { distanceKm: 140, durationMinutes: 170, suggestedFarePerSeat: 30000, suggestedFareFleet: 95000 },
  'malaga-bucaramanga': { distanceKm: 130, durationMinutes: 160, suggestedFarePerSeat: 28000, suggestedFareFleet: 88000, requiresLicensedOperator: true },
  'bucaramanga-malaga': { distanceKm: 130, durationMinutes: 160, suggestedFarePerSeat: 28000, suggestedFareFleet: 88000, requiresLicensedOperator: true },
  // Pares restantes con distancia/tiempo aproximados por carretera, para que
  // toda combinación de municipios soportados calcule tarifa sin caer al
  // sintetizador. Troncales largas marcadas requiresLicensedOperator.
  'cucuta-bucaramanga': { distanceKm: 198, durationMinutes: 240, suggestedFarePerSeat: 44000, suggestedFareFleet: 135000, requiresLicensedOperator: true },
  'bucaramanga-cucuta': { distanceKm: 198, durationMinutes: 240, suggestedFarePerSeat: 44000, suggestedFareFleet: 135000, requiresLicensedOperator: true },
  'cucuta-malaga': { distanceKm: 175, durationMinutes: 225, suggestedFarePerSeat: 39000, suggestedFareFleet: 120000, requiresLicensedOperator: true },
  'malaga-cucuta': { distanceKm: 175, durationMinutes: 225, suggestedFarePerSeat: 39000, suggestedFareFleet: 120000, requiresLicensedOperator: true },
  'cucuta-ocana': { distanceKm: 215, durationMinutes: 270, suggestedFarePerSeat: 47000, suggestedFareFleet: 145000, requiresLicensedOperator: true },
  'ocana-cucuta': { distanceKm: 215, durationMinutes: 270, suggestedFarePerSeat: 47000, suggestedFareFleet: 145000, requiresLicensedOperator: true },
  'cucuta-bogota': { distanceKm: 555, durationMinutes: 720, suggestedFarePerSeat: 100000, suggestedFareFleet: 310000, requiresLicensedOperator: true },
  'bogota-cucuta': { distanceKm: 555, durationMinutes: 720, suggestedFarePerSeat: 100000, suggestedFareFleet: 310000, requiresLicensedOperator: true },
  'bucaramanga-chitaga': { distanceKm: 245, durationMinutes: 300, suggestedFarePerSeat: 54000, suggestedFareFleet: 165000, requiresLicensedOperator: true },
  'chitaga-bucaramanga': { distanceKm: 245, durationMinutes: 300, suggestedFarePerSeat: 54000, suggestedFareFleet: 165000, requiresLicensedOperator: true },
  'bucaramanga-ocana': { distanceKm: 205, durationMinutes: 300, suggestedFarePerSeat: 45000, suggestedFareFleet: 140000, requiresLicensedOperator: true },
  'ocana-bucaramanga': { distanceKm: 205, durationMinutes: 300, suggestedFarePerSeat: 45000, suggestedFareFleet: 140000, requiresLicensedOperator: true },
  'bucaramanga-bogota': { distanceKm: 395, durationMinutes: 540, suggestedFarePerSeat: 87000, suggestedFareFleet: 270000, requiresLicensedOperator: true },
  'bogota-bucaramanga': { distanceKm: 395, durationMinutes: 540, suggestedFarePerSeat: 87000, suggestedFareFleet: 270000, requiresLicensedOperator: true },
  'chitaga-malaga': { distanceKm: 125, durationMinutes: 165, suggestedFarePerSeat: 28000, suggestedFareFleet: 88000 },
  'malaga-chitaga': { distanceKm: 125, durationMinutes: 165, suggestedFarePerSeat: 28000, suggestedFareFleet: 88000 },
  'chitaga-ocana': { distanceKm: 165, durationMinutes: 215, suggestedFarePerSeat: 36000, suggestedFareFleet: 110000, requiresLicensedOperator: true },
  'ocana-chitaga': { distanceKm: 165, durationMinutes: 215, suggestedFarePerSeat: 36000, suggestedFareFleet: 110000, requiresLicensedOperator: true },
  'chitaga-bogota': { distanceKm: 455, durationMinutes: 620, suggestedFarePerSeat: 100000, suggestedFareFleet: 310000, requiresLicensedOperator: true },
  'bogota-chitaga': { distanceKm: 455, durationMinutes: 620, suggestedFarePerSeat: 100000, suggestedFareFleet: 310000, requiresLicensedOperator: true },
  'malaga-ocana': { distanceKm: 250, durationMinutes: 330, suggestedFarePerSeat: 55000, suggestedFareFleet: 170000, requiresLicensedOperator: true },
  'ocana-malaga': { distanceKm: 250, durationMinutes: 330, suggestedFarePerSeat: 55000, suggestedFareFleet: 170000, requiresLicensedOperator: true },
  'malaga-bogota': { distanceKm: 310, durationMinutes: 420, suggestedFarePerSeat: 68000, suggestedFareFleet: 210000, requiresLicensedOperator: true },
  'bogota-malaga': { distanceKm: 310, durationMinutes: 420, suggestedFarePerSeat: 68000, suggestedFareFleet: 210000, requiresLicensedOperator: true },
  'ocana-bogota': { distanceKm: 430, durationMinutes: 600, suggestedFarePerSeat: 95000, suggestedFareFleet: 295000, requiresLicensedOperator: true },
  'bogota-ocana': { distanceKm: 430, durationMinutes: 600, suggestedFarePerSeat: 95000, suggestedFareFleet: 295000, requiresLicensedOperator: true },
};

// Approximate municipal centroids (lat/lng). Used to synthesise route
// metadata for any pair without an explicit row, and as reference point for
// the intercity driver matching (PostGIS proximity to the origin city).
export const INTERCITY_CITY_COORDS: Record<IntercityCity, { lat: number; lng: number }> = {
  pamplona: { lat: 7.3754, lng: -72.6486 },
  cucuta: { lat: 7.8939, lng: -72.5078 },
  bucaramanga: { lat: 7.1193, lng: -73.1227 },
  chitaga: { lat: 6.9000, lng: -72.6660 },
  malaga: { lat: 6.6983, lng: -72.7333 },
  ocana: { lat: 8.2375, lng: -73.3561 },
  bogota: { lat: 4.7110, lng: -74.0721 },
};

/** Straight-line distance in km between two coordinates (haversine). */
function _haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Road-distance multiplier over straight-line for Andean mountain roads. */
const ROAD_FACTOR = 1.4;
/** Average intercity road speed (km/h) used to estimate duration. */
const AVG_ROAD_SPEED_KMH = 55;
/** Suggested per-seat fare estimate (COP per road km). */
const SUGGESTED_FARE_PER_KM = 220;
/** Above this estimated distance (km), a synthesised route is treated as trunk. */
const TRUNK_DISTANCE_KM = 150;

/** Synthesise route metadata from city centroids for pairs with no explicit row. */
function _synthesizeRoute(origin: IntercityCity, dest: IntercityCity): IntercityRouteInfo {
  const straight = _haversineKm(INTERCITY_CITY_COORDS[origin], INTERCITY_CITY_COORDS[dest]);
  const distanceKm = Math.max(10, Math.round((straight * ROAD_FACTOR) / 5) * 5);
  const durationMinutes = Math.round((distanceKm / AVG_ROAD_SPEED_KMH) * 60);
  const suggestedFarePerSeat = Math.round((distanceKm * SUGGESTED_FARE_PER_KM) / 1000) * 1000;
  return {
    distanceKm,
    durationMinutes,
    suggestedFarePerSeat,
    suggestedFareFleet: suggestedFarePerSeat * 3,
    requiresLicensedOperator: distanceKm >= TRUNK_DISTANCE_KM,
    isEstimated: true,
  };
}

/**
 * Returns route metadata for a supported city pair. Falls back to a synthesised
 * estimate (from city coordinates) for any pair without an explicit row, so the
 * client can always request a trip between supported municipalities.
 */
export function getIntercityRoute(origin: IntercityCity, dest: IntercityCity): IntercityRouteInfo | null {
  if (origin === dest) return null;
  const key = `${origin}-${dest}` as RoutePair;
  return INTERCITY_ROUTES[key] ?? _synthesizeRoute(origin, dest);
}

// ─── Intercity legal model (gasto compartido) ────────────────────────────────
//
// To keep pooled rides on the legal side of "gasto compartido" (cost sharing,
// not commercial transport), the per-seat fare a particular driver may charge
// is capped at the proportional running cost of the trip — fuel plus an
// estimated toll allowance — divided across the occupants. The driver recovers
// costs but does not profit, so Nexum acts as a tech intermediary rather than a
// transport operator. See INTERCITY_LEGAL_NOTES.md for the full legal context
// and the three configurable options (A default / B dual / C no-cap).

/**
 * Estimated running cost per kilometre in COP (fuel + wear, no profit).
 * TODO(legal/finanzas): confirmar la cifra real 2026 con el operador. El valor
 * por defecto se subió para reflejar el alza de combustible y mantenimiento.
 */
export const SHARED_RIDE_COST_PER_KM = parseInt(process.env['SHARED_RIDE_COST_PER_KM'] ?? '950', 10);

/**
 * Estimated toll cost in COP per 100 km of intercity road.
 * TODO(legal/finanzas): confirmar peajes reales 2026 por corredor.
 */
export const SHARED_RIDE_TOLL_PER_100KM = parseInt(process.env['SHARED_RIDE_TOLL_PER_100KM'] ?? '16000', 10);

/**
 * Option C — remove the cost-share cap entirely. OFF by default.
 * Only enable if the operator assumes the legal framework for commercial
 * intercity transport (habilitación). When enabled, the apps must show the
 * legal disclaimer. The cost-share value is still computed for reference, but
 * not enforced. See INTERCITY_LEGAL_NOTES.md.
 */
export const INTERCITY_REMOVE_CAP = (process.env['INTERCITY_REMOVE_CAP'] ?? 'false') === 'true';

/**
 * Option B — dual model. Trunk routes flagged `requiresLicensedOperator` are
 * blocked for particular drivers until there is a convenio with a habilitated
 * transport operator. OFF by default. See INTERCITY_LEGAL_NOTES.md.
 */
export const INTERCITY_DUAL_MODEL = (process.env['INTERCITY_DUAL_MODEL'] ?? 'false') === 'true';

/**
 * Demo-only: simulate the intercity driver response with a mock pool instead
 * of offering the booking to real online drivers. OFF by default — production
 * always uses the real matching cycle.
 */
export const INTERCITY_SIMULATE = (process.env['INTERCITY_SIMULATE'] ?? 'false') === 'true';

/**
 * Maximum legal cost-share per seat for a route, given the number of seats
 * the driver offers. Returns 0 if the route is unknown. This is always the
 * computed cost-share reference value; enforcement is gated by
 * INTERCITY_REMOVE_CAP at the call sites.
 */
export function getMaxFarePerSeat(
  origin: IntercityCity,
  dest: IntercityCity,
  totalSeats: number,
): number {
  const route = getIntercityRoute(origin, dest);
  if (!route || totalSeats < 1) return 0;
  const fuelCost = route.distanceKm * SHARED_RIDE_COST_PER_KM;
  const tollCost = (route.distanceKm / 100) * SHARED_RIDE_TOLL_PER_100KM;
  const totalRunningCost = fuelCost + tollCost;
  // Driver occupies one seat too, so cost is split across all occupants.
  const occupants = totalSeats + 1;
  return Math.ceil(totalRunningCost / occupants / 500) * 500;
}

/** Whether a given route is a trunk route (Option B classification). */
export function routeRequiresLicensedOperator(origin: IntercityCity, dest: IntercityCity): boolean {
  return getIntercityRoute(origin, dest)?.requiresLicensedOperator ?? false;
}
