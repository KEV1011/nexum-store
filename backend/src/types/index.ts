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
  /** Identidad del pasajero verificada (KYC) — el conductor decide con confianza. */
  verified?: boolean;
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
  /** TAXI | MOTO | PARTICULAR | ENVIOS | MANDADO — ENVIOS exige prueba de foto. */
  serviceType?: string;
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
  | 'operator_auth'
  | 'operator_auth_ok'
  | 'operator_auth_error'
  | 'freight_new'
  | 'business_auth'
  | 'business_auth_ok'
  | 'business_auth_error'
  | 'new_order'
  // Trip status updates from driver
  | 'trip_status'
  | 'trip_status_ack'
  // Mandado (errand) messages
  | 'driver_mode'
  | 'errand_request'
  | 'accept_errand'
  | 'reject_errand'
  | 'errand_accepted'
  | 'errand_rejected'
  | 'errand_status'
  | 'errand_status_ack'
  | 'errand_update'
  | 'errand_cancelled'
  | 'subscribe_errand'
  | 'unsubscribe_errand'
  // Pedidos: despacho real a repartidores
  | 'order_request' // server → driver: oferta de pedido para entregar
  | 'accept_order'
  | 'reject_order'
  | 'order_accept_ok'
  | 'order_rejected'
  | 'order_status'
  | 'order_status_ack'
  | 'order_cancelled' // server → driver: el cliente canceló el pedido
  // Intercity messages
  | 'subscribe_intercity'
  | 'unsubscribe_intercity'
  | 'intercity_update'
  | 'intercity_request' // server → driver: oferta de reserva intermunicipal
  | 'intercity_accept' // driver → server: acepta (counterFare opcional)
  | 'intercity_reject' // driver → server: rechaza la oferta
  | 'intercity_accept_ok' // server → driver: aceptación registrada
  | 'intercity_cancelled' // server → driver: el cliente canceló la reserva
  | 'intercity_start' // driver → server: inicia el viaje confirmado
  | 'intercity_start_ok' // server → driver: inicio registrado (IN_PROGRESS)
  | 'intercity_complete' // driver → server: finaliza el viaje
  | 'intercity_complete_ok' // server → driver: viaje liquidado (COMPLETED)
  // Shared pooled-ride (Modelo A) messages
  | 'subscribe_pooled'
  | 'unsubscribe_pooled'
  | 'pooled_update'
  // Ride negotiation (inDriver-style: multi-driver + bids + chat)
  | 'driver_register' // driver joins the live pool to receive ride requests
  | 'ride_request_new' // server → drivers: a new ride is open for bidding
  | 'ride_bid' // driver → server: place/counter a bid
  | 'ride_bid_withdraw' // driver → server: withdraw bid
  | 'ride_accept_bid' // client → server: accept a driver's bid
  | 'ride_cancel' // either party cancels
  | 'ride_status' // matched driver advances lifecycle
  | 'ride_update' // server → both: ride state changed
  | 'subscribe_ride' // client/driver watch a specific ride
  | 'unsubscribe_ride'
  | 'ride_location' // matched driver GPS → client
  // Chat (Feature A)
  | 'chat_send'
  | 'chat_message'
  | 'subscribe_chat'
  | 'unsubscribe_chat'
  // Chat del viaje normal (persistente)
  | 'subscribe_trip_chat'
  | 'unsubscribe_trip_chat'
  | 'trip_chat_send'
  | 'trip_chat_message'
  | 'trip_chat_history';

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
  imageUrl?: string;       // foto de portada del local (null = sin portada)
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
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
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
  | 'operator_auth'
  | 'operator_auth_ok'
  | 'operator_auth_error'
  | 'freight_new'
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

export interface ClientProfileDTO {
  id: string;
  phone: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  memberSince: string;
}

// ─── Products & Public Business ──────────────────────────────────────────────

export interface ProductPhotoDTO {
  id: string;
  url: string;
}

export interface ProductOptionDTO {
  id: string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface OptionGroupDTO {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ProductOptionDTO[];
}

export interface ProductDTO {
  id: string;
  businessId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  // Galería adicional (además de `imageUrl`). Vacía si no hay más fotos.
  images: ProductPhotoDTO[];
  // Variantes/opciones del producto (tamaños, adiciones, quitar). Vacío si no.
  optionGroups: OptionGroupDTO[];
}

// Payload para reemplazar TODAS las opciones de un producto de una vez (el
// portal edita la estructura completa y la guarda con un PUT).
export interface SetProductOptionsDTO {
  groups: Array<{
    name: string;
    required?: boolean;
    minSelect?: number;
    maxSelect?: number;
    options: Array<{ name: string; priceDelta?: number; isAvailable?: boolean }>;
  }>;
}

// El dueño gestiona su catálogo desde el portal (`/negocio/[token]`).
export interface CreateProductDTO {
  name: string;
  price: number;
  description?: string;
  category?: string;
  imageUrl?: string;
}

export interface UpdateProductDTO {
  name?: string;
  price?: number;
  description?: string;
  category?: string;
  imageUrl?: string;
  isAvailable?: boolean;
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
  imageUrl?: string;
  openingHours?: string;
  products: ProductDTO[];
}

// Ajustes que el dueño edita desde el portal (perfil + vitrina).
export interface BusinessSettingsDTO {
  name?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  deliveryFee?: number;
  etaMinutes?: number;
  acceptingOrders?: boolean;
  openingHours?: string;
}

// Estadísticas de ventas del negocio en un rango de fechas.
export interface BusinessStatsDTO {
  from: string;
  to: string;
  ordersCount: number;
  deliveredCount: number;
  cancelledCount: number;
  inProgressCount: number;
  revenue: number; // suma de subtotales de pedidos no cancelados
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
}

// ─── Client Orders ────────────────────────────────────────────────────────────

export interface ClientOrderLineDTO {
  productId: string;
  quantity: number;
  unitPrice: number;
  // Resumen de las opciones elegidas (el unitPrice ya incluye sus deltas).
  optionsSummary?: string;
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
    optionsSummary?: string;
  }>;
  deliveryAddress: string;
  driverName?: string;
  driverPhone?: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
  pickupPhotoUrl?: string;
  deliveryPhotoUrl?: string;
  hasSignature: boolean;
  createdAt: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  // Cocina: tiempo de preparación fijado por el restaurante y sus marcas de
  // tiempo. Permiten al cliente ver un ETA en vivo (aceptado + prep → listo).
  prepMinutes?: number;
  acceptedAt?: string;
  readyAt?: string;
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
  /** Tarifa final liquidada por el backend (solo al completar). */
  finalFare?: number;
  distanceKm: number;
  etaMinutes: number;
  status: ClientTripStatus;
  driverName?: string;
  driverPhone?: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
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
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  recipientName?: string;
  recipientPhone?: string;
  packageDescription?: string;
}

// ─── Work Mode ────────────────────────────────────────────────────────────────

export type WorkMode = 'pasajero' | 'pedido' | 'paquete' | 'mandado';

// ─── Mandados (Errands) ───────────────────────────────────────────────────────

export type ErrandCategory =
  | 'pharmacy'
  | 'groceries'
  | 'documents'
  | 'payments'
  | 'food'
  | 'shopping'
  | 'other';

export type ErrandStatus =
  | 'searching'
  | 'accepted'
  | 'shopping'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export interface RequestClientErrandDTO {
  category: ErrandCategory;
  description: string;
  pickupAddress: string;
  dropoffAddress: string;
  purchaseBudget?: number;
  notes?: string;
}

export interface ClientErrandDTO {
  id: string;
  requestRef: string;
  category: ErrandCategory;
  description: string;
  pickupAddress: string;
  dropoffAddress: string;
  serviceFee: number;
  purchaseBudget?: number;
  actualPurchaseCost?: number;
  notes?: string;
  status: ErrandStatus;
  driverName?: string;
  driverPhone?: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
  createdAt: string;
  acceptedAt?: string;
  deliveredAt?: string;
  /** Prueba de custodia del mandadero (recogida y entrega). */
  pickupPhotoUrl?: string;
  deliveryPhotoUrl?: string;
}

// Sent to driver when a mandado is dispatched
export interface ErrandRequestDTO {
  id: string;
  category: ErrandCategory;
  description: string;
  pickupAddress: string;
  dropoffAddress: string;
  serviceFee: number;
  purchaseBudget?: number;
  notes?: string;
}

// ─── Intercity Bookings ───────────────────────────────────────────────────────

export type IntercityCity =
  | 'pamplona'
  | 'cucuta'
  | 'bucaramanga'
  | 'chitaga'
  | 'malaga'
  | 'ocana'
  | 'bogota';

export type IntercitySeats = 'one' | 'two' | 'three' | 'fleet';

export type IntercityStatus =
  | 'searching'
  | 'driver_found'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface RequestIntercityDTO {
  origin: IntercityCity;
  destination: IntercityCity;
  departureTime: string;
  seats: IntercitySeats;
  offeredFare: number;
  pickupAddress?: string;
  dropoffAddress?: string;
  notes?: string;
}

export interface IntercityBookingDTO {
  id: string;
  requestRef: string;
  origin: IntercityCity;
  destination: IntercityCity;
  departureTime: string;
  seats: IntercitySeats;
  offeredFare: number;
  counterFare?: number;
  status: IntercityStatus;
  driverName?: string;
  driverPhone?: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
  driverVehicle?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  notes?: string;
  createdAt: string;
  confirmedAt?: string;
  /** Calificación del pasajero al viaje completado (1-5). */
  rating?: number;
  ratingComment?: string;
  /** Posición en vivo del conductor asignado (heartbeat GPS), solo cuando el
   *  viaje está CONFIRMED/IN_PROGRESS — para el mapa de seguimiento. */
  driverLat?: number;
  driverLng?: number;
}

// ─── Shared Pooled Rides (Modelo A: conductor publica → pasajero reserva) ───────

/**
 * A trip published by a particular driver who shares the cost of an
 * intercity ride. Passengers book individual seats until the vehicle fills.
 */
export type PooledTripStatus =
  | 'open' // accepting seat bookings
  | 'full' // all seats booked
  | 'departed' // trip in progress
  | 'completed'
  | 'cancelled';

export type SeatBookingStatus = 'confirmed' | 'cancelled';

/** Driver-supplied payload when publishing a shared trip. */
export interface PublishPooledTripDTO {
  origin: IntercityCity;
  destination: IntercityCity;
  departureTime: string;
  totalSeats: number; // total seats offered (1-7)
  farePerSeat: number; // cost-share per seat (validated against legal cap)
  vehicleDescription: string; // e.g. "Toyota Corolla Blanco • ABC 123"
  notes?: string;
  allowFleet?: boolean; // passenger may book the whole vehicle at once
}

/** A single passenger's booking on a pooled trip. */
export interface SeatBookingDTO {
  id: string;
  tripId: string;
  passengerName: string;
  passengerPhone: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
  seatsBooked: number;
  pickupAddress?: string;
  notes?: string;
  status: SeatBookingStatus;
  bookedAt: string;
}

/** Client-supplied payload when reserving seats on a pooled trip. */
export interface BookSeatsDTO {
  seatsBooked: number;
  pickupAddress?: string;
  notes?: string;
}

/** Full pooled-trip view returned to drivers and passengers. */
export interface PooledTripDTO {
  id: string;
  tripRef: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
  vehicleDescription: string;
  origin: IntercityCity;
  destination: IntercityCity;
  departureTime: string;
  totalSeats: number;
  availableSeats: number;
  farePerSeat: number;
  maxFarePerSeat: number; // legal cost-share cap for this route
  allowFleet: boolean;
  status: PooledTripStatus;
  notes?: string;
  distanceKm?: number;
  durationMinutes?: number;
  createdAt: string;
  /** Empresa que publicó la salida (null/ausente = conductor particular). */
  operatorId?: string;
  /** Razón social de la empresa, para mostrar confianza en la búsqueda. */
  operatorName?: string;
  /** Present only on driver-facing responses. */
  bookings?: SeatBookingDTO[];
}

// ─── Ride Negotiation (inDriver-style: bids + chat + multi-driver) ──────────────

export type RideNegotiationStatus =
  | 'open' // accepting bids from drivers
  | 'matched' // client accepted a bid, driver assigned
  | 'arriving' // driver en route to pickup
  | 'arrived' // driver at pickup
  | 'in_progress' // trip underway
  | 'completed'
  | 'cancelled';

export type BidStatus = 'pending' | 'accepted' | 'rejected';

export type ChatRole = 'client' | 'driver';

export interface CreateRideRequestDTO {
  serviceType: TransportServiceType;
  originAddress: string;
  destinationAddress: string;
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  offeredFare: number;
  distanceKm: number;
  etaMinutes: number;
  notes?: string;
}

export interface PlaceBidDTO {
  fare: number;
  etaMinutes: number;
}

export interface RideBidDTO {
  id: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
  driverRating: number;
  driverTotalTrips: number;
  vehicleDescription: string;
  fare: number;
  etaMinutes: number;
  status: BidStatus;
  createdAt: string;
}

export interface RideRequestDTO {
  id: string;
  rideRef: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  contactChannel?: 'in_app_chat' | 'call_proxy';
  maskedPhone?: string;
  serviceType: TransportServiceType;
  originAddress: string;
  destinationAddress: string;
  originLat?: number;
  originLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  offeredFare: number;
  distanceKm: number;
  etaMinutes: number;
  notes?: string;
  status: RideNegotiationStatus;
  bids: RideBidDTO[];
  bidCount: number;
  matchedDriverId?: string;
  matchedBidId?: string;
  driverLat?: number;
  driverLng?: number;
  createdAt: string;
  matchedAt?: string;
  completedAt?: string;
}

export interface ChatMessageDTO {
  id: string;
  rideId: string;
  fromRole: ChatRole;
  fromId: string;
  text: string;
  sentAt: string;
}

// ─── Driver Profile & Document Verification (Features D + E) ────────────────────

// These match the Prisma DocumentType / DocumentStatus enums.
export type DriverDocumentType =
  | 'CEDULA'
  | 'LICENSE'
  | 'SOAT'
  | 'PROPERTY_CARD'
  | 'PROFILE_PHOTO';

// 'missing' is a synthetic front-end-only status (no DB row yet).
export type DocumentStatus = 'missing' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface UpsertDriverDocumentDTO {
  type: DriverDocumentType;
  fileUrl: string;
  expiresAt?: string;
}

export interface DriverDocumentDTO {
  type: DriverDocumentType;
  label: string;
  fileUrl: string;
  status: DocumentStatus;
  expiresAt?: string;
  rejectionReason?: string;
  uploadedAt: string;
  reviewedAt?: string;
}

export interface DriverProfileDTO {
  driverId: string;
  fullName: string;
  phone: string;
  photoUrl?: string;
  bio?: string;
  rating: number;
  totalTrips: number;
  vehicleDescription: string;
  // Desglose del vehículo activo (para la pantalla de perfil del conductor).
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehiclePlate?: string;
  vehicleColor?: string;
  vehicleType?: string;
  // Identidad y datos bancarios (ya existen en el modelo Driver).
  documentNumber?: string;
  bankName?: string;
  bankAccountType?: string;
  bankAccountNumber?: string;
  memberSince: string;
  isVerified: boolean;
  // false en modo piloto (PILOT_SKIP_VERIFICATION) → la app deja conectarse sin
  // esperar la aprobación; true = comportamiento normal (exige verificación).
  verificationRequired: boolean;
  // Kill-switch documental: BLOCKED = documento obligatorio vencido (la app
  // muestra el banner rojo y deshabilita Conectarse). blockedReason lo detalla.
  complianceStatus: 'CLEAR' | 'EXPIRING' | 'BLOCKED';
  blockedReason?: string;
  documents: DriverDocumentDTO[];
  requiredDocsCount: number;
  approvedDocsCount: number;
  // Afiliación a empresa/operador. Ausente = conductor independiente. Permite que la
  // app conductor muestre "Conduces para {empresa}" y su estado de verificación.
  affiliation?: DriverAffiliationDTO;
}

export interface DriverAffiliationDTO {
  operatorId: string;
  legalName: string;
  type: string; // TAXI | INTERCITY | MIXED
  status: string; // PENDING | ACTIVE | SUSPENDED
  isVerified: boolean;
  employmentType: string; // OWN | AFFILIATED
}

export interface DriverPublicProfileDTO {
  driverId: string;
  fullName: string;
  photoUrl?: string;
  bio?: string;
  rating: number;
  totalTrips: number;
  vehicleDescription: string;
  memberSince: string;
  isVerified: boolean;
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
