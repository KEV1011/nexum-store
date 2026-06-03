import dotenv from 'dotenv';
import path from 'path';
import { Driver, Passenger, Location } from '../types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ─── Server ───────────────────────────────────────────────────────────────────

export const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
export const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const JWT_SECRET = process.env['JWT_SECRET'] ?? 'nexum-driver-secret-key-2024';
export const JWT_EXPIRES_IN = '30d';
export const MOCK_OTP = '123456';

// ─── Google Maps ──────────────────────────────────────────────────────────────

export const GOOGLE_MAPS_API_KEY = process.env['GOOGLE_MAPS_API_KEY'] ?? '';

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? '*';
export const PORTAL_BASE_URL = process.env['PORTAL_BASE_URL'] ?? 'https://nexum.app';

// ─── Fare Rates (COP) ─────────────────────────────────────────────────────────

export const FARE_BASE = 3500;
export const FARE_PER_KM = 800;
export const FARE_PER_MIN = 150;
export const FARE_MINIMUM = 5000;
export const COMMISSION_RATE = 0.15;

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

// ─── Mock Errands (Mandados) ──────────────────────────────────────────────────

import { ErrandCategory, ErrandRequestDTO, DeliveryRequestDTO } from '../types';

export const ERRAND_SERVICE_FEE = 6000;

// ─── Mock Deliveries (Pedido / Domicilio) ─────────────────────────────────────

export const MOCK_DELIVERIES: Omit<DeliveryRequestDTO, 'id'>[] = [
  {
    kind: 'food',
    title: 'Domicilio · Pizzería Napolitana',
    pickupAddress: 'Pizzería Napolitana · Calle 6 #5-40',
    dropoffAddress: 'Barrio Cariongo, Casa 12-34',
    distanceKm: 1.9,
    estimatedMinutes: 11,
    estimatedFare: 5500,
    itemDescription: '1 pizza familiar pepperoni + 2 gaseosas 1.5L',
    recipientName: 'Diego Villamizar',
    recipientPhone: '+57 312 884 1190',
    notes: 'Apto sin timbre, llamar al llegar.',
  },
  {
    kind: 'food',
    title: 'Domicilio · Asadero El Buen Sabor',
    pickupAddress: 'Asadero El Buen Sabor · Av. Santander',
    dropoffAddress: 'Conjunto El Buque, Torre 3 Apto 502',
    distanceKm: 2.4,
    estimatedMinutes: 13,
    estimatedFare: 6000,
    itemDescription: '1 pollo asado entero + papas + ensalada',
    recipientName: 'Marta Sepúlveda',
    recipientPhone: '+57 320 551 7723',
  },
  {
    kind: 'food',
    title: 'Domicilio · Café Central',
    pickupAddress: 'Café Central · Parque Águeda Gallardo',
    dropoffAddress: 'Universidad de Pamplona, Bloque Jorge Gaitán',
    distanceKm: 1.3,
    estimatedMinutes: 8,
    estimatedFare: 4500,
    itemDescription: '3 cafés con leche + 3 almojábanas',
    recipientName: 'Profesor Rincón',
    recipientPhone: '+57 311 220 4408',
    notes: 'Entregar en la sala de profesores.',
  },
];

// ─── Mock Parcels (Paquete / Envío) ───────────────────────────────────────────

export const MOCK_PARCELS: Omit<DeliveryRequestDTO, 'id'>[] = [
  {
    kind: 'parcel',
    title: 'Envío · Paquete mediano',
    pickupAddress: 'Papelería La 5 · Calle 5 con Carrera 6',
    dropoffAddress: 'Barrio San Francisco, Casa 8-90',
    distanceKm: 2.0,
    estimatedMinutes: 12,
    estimatedFare: 5000,
    itemDescription: 'Caja 30x20cm · resmas de papel · 3kg',
    recipientName: 'Oficina Contable JR',
    recipientPhone: '+57 313 776 5521',
  },
  {
    kind: 'parcel',
    title: 'Envío · Sobre documentos',
    pickupAddress: 'Notaría Primera · Calle 6 #4-20',
    dropoffAddress: 'Barrio La Esmeralda, Casa 23',
    distanceKm: 1.6,
    estimatedMinutes: 10,
    estimatedFare: 4500,
    itemDescription: 'Sobre sellado con escritura · frágil',
    recipientName: 'Carmen Ulloa',
    recipientPhone: '+57 314 009 8812',
    notes: 'No doblar el sobre.',
  },
  {
    kind: 'parcel',
    title: 'Envío · Encomienda pequeña',
    pickupAddress: 'Almacén TecnoPamplona · Centro comercial',
    dropoffAddress: 'Barrio El Escorial, Casa 23',
    distanceKm: 2.2,
    estimatedMinutes: 13,
    estimatedFare: 5500,
    itemDescription: 'Caja con repuesto electrónico · 1.5kg',
    recipientName: 'Julián Mora',
    recipientPhone: '+57 318 442 1097',
  },
];

export const MOCK_ERRANDS: Omit<ErrandRequestDTO, 'id'>[] = [
  {
    category: 'pharmacy' as ErrandCategory,
    description: 'Comprar acetaminofén 500mg x10 y alcohol antiséptico en Farmatodo del centro.',
    pickupAddress: 'Farmatodo · Calle 5 con Carrera 6',
    dropoffAddress: 'Barrio Cariongo, Casa 12-34',
    serviceFee: ERRAND_SERVICE_FEE,
    purchaseBudget: 35000,
    notes: 'Si no hay acetaminofén, traer ibuprofeno.',
  },
  {
    category: 'groceries' as ErrandCategory,
    description: 'Mercado pequeño: 1 docena de huevos, 2 litros de leche, pan tajado y 1 libra de arroz en el Éxito.',
    pickupAddress: 'Éxito Pamplona · Av. Santander',
    dropoffAddress: 'Conjunto El Buque, Torre 3 Apto 502',
    serviceFee: ERRAND_SERVICE_FEE,
    purchaseBudget: 45000,
  },
  {
    category: 'documents' as ErrandCategory,
    description: 'Recoger un sobre con documentos donde mi mamá y traerlo a mi oficina. Ella ya lo tiene listo.',
    pickupAddress: 'Barrio Chapinero, Casa esquinera azul',
    dropoffAddress: 'Notaría Primera, Calle 6 #4-20',
    serviceFee: ERRAND_SERVICE_FEE,
    notes: 'Preguntar por la señora Rosa.',
  },
  {
    category: 'payments' as ErrandCategory,
    description: 'Pagar la factura de energía (CENS) en Efecty. Llevo el código de pago en la foto del chat.',
    pickupAddress: 'Efecty · Carrera 5 #7-15',
    dropoffAddress: 'Barrio San Francisco, Casa 8-90',
    serviceFee: ERRAND_SERVICE_FEE,
    purchaseBudget: 120000,
    notes: 'Guardar el comprobante de pago.',
  },
  {
    category: 'food' as ErrandCategory,
    description: 'Recoger un almuerzo ejecutivo encargado donde Doña Rosa y llevarlo a la universidad.',
    pickupAddress: 'Restaurante Doña Rosa · Calle 4',
    dropoffAddress: 'Universidad de Pamplona, Bloque Jorge Gaitán',
    serviceFee: ERRAND_SERVICE_FEE,
    purchaseBudget: 18000,
  },
  {
    category: 'shopping' as ErrandCategory,
    description: 'Comprar un cargador tipo C de carga rápida y un protector de pantalla para iPhone en el centro.',
    pickupAddress: 'Centro comercial · locales de tecnología',
    dropoffAddress: 'Barrio El Escorial, Casa 23',
    serviceFee: ERRAND_SERVICE_FEE,
    purchaseBudget: 60000,
    notes: 'Que el cargador sea de carga rápida.',
  },
];

// ─── Intercity Routes ─────────────────────────────────────────────────────────

import { IntercityCity } from '../types';

interface IntercityRouteInfo {
  distanceKm: number;
  durationMinutes: number;
  suggestedFarePerSeat: number;
  suggestedFareFleet: number;
}

type RoutePair = `${IntercityCity}-${IntercityCity}`;

export const INTERCITY_ROUTES: Partial<Record<RoutePair, IntercityRouteInfo>> = {
  'pamplona-cucuta': { distanceKm: 95, durationMinutes: 120, suggestedFarePerSeat: 22000, suggestedFareFleet: 70000 },
  'cucuta-pamplona': { distanceKm: 95, durationMinutes: 120, suggestedFarePerSeat: 22000, suggestedFareFleet: 70000 },
  'pamplona-bucaramanga': { distanceKm: 200, durationMinutes: 240, suggestedFarePerSeat: 42000, suggestedFareFleet: 130000 },
  'bucaramanga-pamplona': { distanceKm: 200, durationMinutes: 240, suggestedFarePerSeat: 42000, suggestedFareFleet: 130000 },
  'pamplona-chitaga': { distanceKm: 45, durationMinutes: 60, suggestedFarePerSeat: 10000, suggestedFareFleet: 35000 },
  'chitaga-pamplona': { distanceKm: 45, durationMinutes: 60, suggestedFarePerSeat: 10000, suggestedFareFleet: 35000 },
  'pamplona-malaga': { distanceKm: 80, durationMinutes: 105, suggestedFarePerSeat: 18000, suggestedFareFleet: 58000 },
  'malaga-pamplona': { distanceKm: 80, durationMinutes: 105, suggestedFarePerSeat: 18000, suggestedFareFleet: 58000 },
  'pamplona-ocana': { distanceKm: 120, durationMinutes: 150, suggestedFarePerSeat: 28000, suggestedFareFleet: 90000 },
  'ocana-pamplona': { distanceKm: 120, durationMinutes: 150, suggestedFarePerSeat: 28000, suggestedFareFleet: 90000 },
  'pamplona-bogota': { distanceKm: 500, durationMinutes: 540, suggestedFarePerSeat: 90000, suggestedFareFleet: 280000 },
  'bogota-pamplona': { distanceKm: 500, durationMinutes: 540, suggestedFarePerSeat: 90000, suggestedFareFleet: 280000 },
  'chitaga-cucuta': { distanceKm: 140, durationMinutes: 170, suggestedFarePerSeat: 30000, suggestedFareFleet: 95000 },
  'cucuta-chitaga': { distanceKm: 140, durationMinutes: 170, suggestedFarePerSeat: 30000, suggestedFareFleet: 95000 },
  'malaga-bucaramanga': { distanceKm: 130, durationMinutes: 160, suggestedFarePerSeat: 28000, suggestedFareFleet: 88000 },
  'bucaramanga-malaga': { distanceKm: 130, durationMinutes: 160, suggestedFarePerSeat: 28000, suggestedFareFleet: 88000 },
};

export function getIntercityRoute(origin: IntercityCity, dest: IntercityCity): IntercityRouteInfo | null {
  const key = `${origin}-${dest}` as RoutePair;
  return INTERCITY_ROUTES[key] ?? null;
}

// ─── Shared-ride cost basis (legal "gasto compartido") ──────────────────────────
//
// To keep pooled rides on the legal side of "gasto compartido" (cost sharing,
// not commercial transport), the per-seat fare a particular driver may charge
// is capped at the proportional running cost of the trip — fuel plus an
// estimated toll allowance — divided across the seats offered. The driver
// recovers costs but does not profit, so Nexum acts as a tech intermediary
// rather than a transport operator.

/** Estimated running cost per kilometre in COP (fuel + wear, no profit). */
export const SHARED_RIDE_COST_PER_KM = 700;

/** Estimated toll cost in COP per 100 km of intercity road. */
export const SHARED_RIDE_TOLL_PER_100KM = 9000;

/**
 * Maximum legal cost-share per seat for a route, given the number of seats
 * the driver offers. Returns 0 if the route is unknown.
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
