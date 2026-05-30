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
  | 'client_auth'
  | 'client_auth_ok'
  | 'client_auth_error'
  | 'subscribe_order'
  | 'unsubscribe_order'
  | 'order_update'
  | 'trip_request'
  | 'accept'
  | 'reject'
  | 'trip_cancelled'
  | 'trip_accepted'
  | 'trip_rejected'
  | 'status_update'
  | 'subscribe_trip'
  | 'unsubscribe_trip'
  | 'trip_update'
  | 'location_update'
  | 'driver_location'
  | 'trip_request_client'
  | 'ping'
  | 'pong'
  | 'error'
  | 'business_auth'
  | 'business_auth_ok'
  | 'business_auth_error'
  | 'new_order';

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

// ─── Business ─────────────────────────────────────────────────────────────────

export type BusinessCategory = 'restaurant' | 'supermarket' | 'pharmacy' | 'other';

export interface Business {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  category: BusinessCategory;
  accessToken: string;     // short unique token for portal URL /negocio/[token]
  whatsapp?: string;       // optional WhatsApp number for notifications
  createdAt: Date;
  isActive: boolean;
}

export interface RegisterBusinessDTO {
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  category: BusinessCategory;
  whatsapp?: string;
}

// ─── Delivery Orders ──────────────────────────────────────────────────────────

export type DeliveryOrderStatus =
  | 'pending'     // driver heading to business
  | 'at_pickup'   // driver arrived at business
  | 'in_transit'  // picked up with photo, heading to customer
  | 'delivered';  // delivered with proof

export interface DeliveryOrder {
  id: string;
  businessId: string;
  orderRef: string;           // e.g. "#4521"
  customerName: string;
  customerAddress: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  status: DeliveryOrderStatus;
  grossFare: number;
  createdAt: Date;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  pickupPhotoUrl?: string;
  deliveryPhotoUrl?: string;
  hasSignature: boolean;
}

export interface CreateDeliveryOrderDTO {
  businessId: string;
  orderRef: string;
  customerName: string;
  customerAddress: string;
  grossFare: number;
}

export interface OrderStatusUpdateDTO {
  status: DeliveryOrderStatus;
  pickupPhotoUrl?: string;
  deliveryPhotoUrl?: string;
  hasSignature?: boolean;
}

export interface DeliveryOrderSummaryDTO {
  id: string;
  orderRef: string;
  customerName: string;
  customerAddress: string;
  status: DeliveryOrderStatus;
  grossFare: number;
  createdAt: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  pickupPhotoUrl?: string;
  deliveryPhotoUrl?: string;
  hasSignature: boolean;
  driverName: string;
  driverPhone: string;
  hasPickupProof: boolean;
  hasDeliveryProof: boolean;
  hasFullCustody: boolean;
}

// ─── WhatsApp Notifications ───────────────────────────────────────────────────

export type WhatsAppTemplateId =
  | 'driver_arriving'      // conductor en camino al local
  | 'order_picked_up'      // pedido recogido (con foto)
  | 'order_delivered';     // pedido entregado al cliente

export interface WhatsAppNotification {
  to: string;              // +57XXXXXXXXXX
  templateId: WhatsAppTemplateId;
  variables: Record<string, string>;
  sentAt: Date;
}

// ─── Business WebSocket Messages ──────────────────────────────────────────────

export type BusinessWsMessageType =
  | 'business_auth'
  | 'business_auth_ok'
  | 'business_auth_error'
  | 'order_status_update'
  | 'new_order'
  | 'ping'
  | 'pong';

export interface BusinessWsMessage {
  type: BusinessWsMessageType;
  [key: string]: unknown;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export interface ClientDTO {
  id: string;
  phone: string;
  name: string;
}

export interface ClientJwtPayload {
  clientId: string;
  phone: string;
  role: 'client';
}

// ─── Products & Public Business ──────────────────────────────────────────────

export interface ProductDTO {
  id: string;
  businessId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  isAvailable: boolean;
}

export interface BusinessPublicDTO {
  id: string;
  name: string;
  category: BusinessCategory;
  address: string;
  rating: number;
  etaMinutes: number;
  deliveryFee: number;
  isOpen: boolean;
  products: ProductDTO[];
}

// ─── Client Orders ────────────────────────────────────────────────────────────

export interface ClientOrderLineDTO {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface ClientPlaceOrderDTO {
  businessId: string;
  deliveryAddress: string;
  items: ClientOrderLineDTO[];
}

export interface ClientOrderSummaryDTO {
  id: string;
  orderRef: string;
  businessId: string;
  businessName: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  etaMinutes: number;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  deliveryAddress: string;
  driverName?: string;
  driverPhone?: string;
  pickupPhotoUrl?: string;
  deliveryPhotoUrl?: string;
  hasSignature: boolean;
  createdAt: string;
  pickedUpAt?: string;
  deliveredAt?: string;
}

// ─── Client Trips ─────────────────────────────────────────────────────────────

export type ClientTripStatus =
  | 'searching'
  | 'accepted'
  | 'arriving'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TransportServiceType = 'taxi' | 'moto' | 'particular' | 'envios';

export interface ClientTripDTO {
  id: string;
  requestRef: string;
  serviceType: TransportServiceType;
  originAddress: string;
  destinationAddress: string;
  estimatedFare: number;
  distanceKm: number;
  etaMinutes: number;
  status: ClientTripStatus;
  driverName?: string;
  driverPhone?: string;
  driverVehicle?: string;
  driverLat?: number;
  driverLng?: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  recipientName?: string;
  recipientPhone?: string;
  packageDescription?: string;
}

export interface RequestClientTripDTO {
  serviceType: TransportServiceType;
  originAddress: string;
  destinationAddress: string;
  estimatedFare: number;
  distanceKm: number;
  etaMinutes: number;
  recipientName?: string;
  recipientPhone?: string;
  packageDescription?: string;
}

// ─── Wompi Payments ───────────────────────────────────────────────────────────

export interface PaymentInitDTO {
  amount: number;
  description: string;
  orderId?: string;
  tripId?: string;
  customerEmail?: string;
}

export interface PaymentLinkResponseDTO {
  paymentId: string;
  referenceCode: string;
  paymentUrl: string;
  amount: number;
}
