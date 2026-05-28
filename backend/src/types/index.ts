// ─── Location ────────────────────────────────────────────────────────────────

export interface Location {
  lat: number;
  lng: number;
  address: string;
}

// ─── Vehicle ─────────────────────────────────────────────────────────────────

export interface Vehicle {
  brand: string;
  model: string;
  year: number;
  plate: string;
  color: string;
}

// ─── Bank Account ─────────────────────────────────────────────────────────────

export interface BankAccount {
  bank: string;
  type: string;
  number: string;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export type DriverStatus = 'online' | 'offline' | 'busy';

export interface Driver {
  id: string;
  name: string;
  phone: string;
  rating: number;
  totalTrips: number;
  vehicle: Vehicle;
  bankAccount: BankAccount;
}

export interface DriverDTO {
  id: string;
  name: string;
  phone: string;
  rating: number;
  totalTrips: number;
  vehicle: Vehicle;
  bankAccount: BankAccount;
}

export interface DriverStatusDTO {
  status: DriverStatus;
  dailyTrips: number;
  dailyEarnings: number;
}

// ─── Passenger ───────────────────────────────────────────────────────────────

export interface Passenger {
  id: string;
  name: string;
  rating: number;
}

// ─── Trip ─────────────────────────────────────────────────────────────────────

export type TripState =
  | 'pending'
  | 'accepted'
  | 'going_to_pickup'
  | 'arrived_at_pickup'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface Trip {
  id: string;
  passenger: Passenger;
  origin: Location;
  destination: Location;
  distanceKm: number;
  estimatedMinutes: number;
  state: TripState;
  grossFare: number;
  netEarning: number;
  createdAt: Date;
  acceptedAt?: Date;
  startedAt?: Date;
  arrivedAt?: Date;
  completedAt?: Date;
  driverId?: string;
}

export interface TripRequestDTO {
  id: string;
  passenger: Passenger;
  origin: Location;
  destination: Location;
  distanceKm: number;
  estimatedMinutes: number;
  estimatedFare: number;
}

export interface TripSummaryDTO {
  id: string;
  passenger: Passenger;
  origin: Location;
  destination: Location;
  distanceKm: number;
  durationMinutes: number;
  grossFare: number;
  commission: number;
  netEarning: number;
  completedAt: string;
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export interface TripEarningEntry {
  tripId: string;
  origin: string;
  destination: string;
  grossFare: number;
  netEarning: number;
  completedAt: string;
}

export interface DailyEarningsDTO {
  date: string;
  totalEarnings: number;
  totalTrips: number;
  averagePerTrip: number;
  trips: TripEarningEntry[];
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  driverId: string;  // documentNumber for new (unregistered) drivers during registration
  phone: string;
}

export interface RegisterDriverDTO {
  phone: string;
  fullName: string;
  documentType: 'CC' | 'CE' | 'PA';  // Cédula, Cédula Extranjería, Pasaporte
  documentNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;      // Formato colombiano ABC-123
  vehicleColor: string;
  vehicleType: 'particular' | 'taxi';
  bankName: string;
  bankAccountType: 'Ahorros' | 'Corriente';
  bankAccountNumber: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

// ─── WebSocket Messages ───────────────────────────────────────────────────────

export type WsMessageType =
  | 'auth'
  | 'auth_ok'
  | 'auth_error'
  | 'trip_request'
  | 'accept'
  | 'reject'
  | 'trip_cancelled'
  | 'trip_accepted'
  | 'trip_rejected'
  | 'status_update'
  | 'ping'
  | 'pong'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  [key: string]: unknown;
}

export interface WsAuthMessage {
  type: 'auth';
  token: string;
}

export interface WsAcceptMessage {
  type: 'accept';
  tripId: string;
}

export interface WsRejectMessage {
  type: 'reject';
  tripId: string;
}

export interface WsTripRequestMessage {
  type: 'trip_request';
  trip: TripRequestDTO;
}

export interface WsTripCancelledMessage {
  type: 'trip_cancelled';
  tripId: string;
  reason: string;
}
