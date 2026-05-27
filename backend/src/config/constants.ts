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

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? '*';

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
