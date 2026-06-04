import { Router } from 'express';
import { clientAuthMiddleware } from '../middleware/client-auth.middleware';
import {
  sendClientOtp,
  verifyClientOtp,
  getClientBusinesses,
  getClientBusinessById,
  placeClientOrder,
  getClientOrders,
  getClientOrderById,
  requestClientTrip,
  getActiveClientTrip,
  cancelClientTrip,
  getClientNameByPhone,
  getClientById,
} from '../services/client.service';
import {
  createRideRequest,
  getActiveClientRide,
  getRideById,
  getChatHistory,
  RideNegotiationError,
} from '../services/ride-negotiation.service';
import { getDriverPublicProfile } from '../services/driver-profile.service';
import {
  searchPooledTrips,
  getPooledTripById,
  bookSeats,
  cancelSeatBooking,
  getClientBookings,
  PooledTripError,
} from '../services/intercity-pool.service';
import {
  requestClientErrand,
  getActiveClientErrand,
  getClientErrandById,
  cancelClientErrand,
} from '../services/errand.service';
import {
  requestIntercityBooking,
  confirmIntercityBooking,
  rejectIntercityOffer,
  cancelIntercityBooking,
  getActiveIntercityBooking,
  getIntercityBookingById,
} from '../services/intercity.service';
import { getIntercityRoute } from '../config/constants';
import { createPaymentLink } from '../services/payment.service';
import {
  geocodeAddress,
  calculateRoute,
  placesAutocomplete,
  placeDetails,
} from '../services/maps.service';
import { rateLimit } from '../middleware/rate-limit.middleware';
import {
  RequestClientErrandDTO,
  RequestIntercityDTO,
  BookSeatsDTO,
  IntercityCity,
} from '../types';

const router = Router();

// Limita los flujos de OTP del cliente (mismo criterio que el portal driver).
const clientOtpLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: 'Demasiados intentos de código. Espera un minuto e inténtalo de nuevo.',
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/send-otp', clientOtpLimiter, async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }
  try {
    await sendClientOtp(phone);
    res.json({ success: true, data: { success: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error sending OTP';
    res.status(400).json({ success: false, error: msg });
  }
});

router.post('/auth/verify-otp', clientOtpLimiter, async (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ success: false, error: 'phone and otp are required' });
    return;
  }
  try {
    const result = await verifyClientOtp(phone, otp);
    res.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification failed';
    res.status(401).json({ success: false, error: msg });
  }
});

// ─── Businesses ───────────────────────────────────────────────────────────────

router.get('/businesses', async (_req, res) => {
  const data = await getClientBusinesses();
  res.json({ success: true, data });
});

router.get('/businesses/:id', async (req, res) => {
  try {
    const data = await getClientBusinessById(req.params['id']!);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: 'Business not found' });
  }
});

// ─── Orders (auth required) ───────────────────────────────────────────────────

router.post('/orders', clientAuthMiddleware, async (req, res) => {
  const clientId = req.clientId!;
  const clientPhone = req.clientPhone!;
  const dto = req.body as { businessId?: string; deliveryAddress?: string; items?: unknown[] };

  if (!dto.businessId || !dto.deliveryAddress || !Array.isArray(dto.items) || dto.items.length === 0) {
    res.status(400).json({ success: false, error: 'businessId, deliveryAddress and items are required' });
    return;
  }

  try {
    const order = await placeClientOrder(clientId, clientPhone, {
      businessId: dto.businessId,
      deliveryAddress: dto.deliveryAddress,
      items: dto.items as Array<{ productId: string; quantity: number; unitPrice: number }>,
    });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to place order';
    res.status(400).json({ success: false, error: msg });
  }
});

router.get('/orders', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getClientOrders(req.clientId!) });
});

router.get('/orders/:id', clientAuthMiddleware, async (req, res) => {
  const order = await getClientOrderById(req.clientId!, req.params['id']!);
  if (!order) { res.status(404).json({ success: false, error: 'Order not found' }); return; }
  res.json({ success: true, data: order });
});

// ─── Trips (auth required) ────────────────────────────────────────────────────

router.post('/trips/request', clientAuthMiddleware, (req, res) => {
  const dto = req.body as {
    serviceType?: string;
    originAddress?: string;
    destinationAddress?: string;
    estimatedFare?: number;
    distanceKm?: number;
    etaMinutes?: number;
    recipientName?: string;
    recipientPhone?: string;
    packageDescription?: string;
  };

  if (!dto.serviceType || !dto.originAddress || !dto.destinationAddress) {
    res.status(400).json({ success: false, error: 'serviceType, originAddress, destinationAddress required' });
    return;
  }

  try {
    const trip = requestClientTrip(req.clientId!, {
      serviceType: dto.serviceType as import('../types').TransportServiceType,
      originAddress: dto.originAddress,
      destinationAddress: dto.destinationAddress,
      estimatedFare: dto.estimatedFare ?? 0,
      distanceKm: dto.distanceKm ?? 0,
      etaMinutes: dto.etaMinutes ?? 0,
      recipientName: dto.recipientName,
      recipientPhone: dto.recipientPhone,
      packageDescription: dto.packageDescription,
    });
    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to request trip';
    res.status(400).json({ success: false, error: msg });
  }
});

router.get('/trips/active', clientAuthMiddleware, (req, res) => {
  const trip = getActiveClientTrip(req.clientId!);
  res.json({ success: true, data: trip });
});

router.post('/trips/:id/cancel', clientAuthMiddleware, (req, res) => {
  const ok = cancelClientTrip(req.clientId!, req.params['id']!);
  if (!ok) { res.status(400).json({ success: false, error: 'Trip not found or cannot be cancelled' }); return; }
  res.json({ success: true });
});

// ─── Errands (Mandados) ───────────────────────────────────────────────────────

router.post('/errands/request', clientAuthMiddleware, (req, res) => {
  const dto = req.body as Partial<RequestClientErrandDTO>;

  if (!dto.category || !dto.description || !dto.pickupAddress || !dto.dropoffAddress) {
    res.status(400).json({
      success: false,
      error: 'category, description, pickupAddress, dropoffAddress are required',
    });
    return;
  }

  try {
    const errand = requestClientErrand(req.clientId!, {
      category: dto.category,
      description: dto.description,
      pickupAddress: dto.pickupAddress,
      dropoffAddress: dto.dropoffAddress,
      purchaseBudget: dto.purchaseBudget,
      notes: dto.notes,
    });
    res.status(201).json({ success: true, data: errand });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to request errand';
    res.status(400).json({ success: false, error: msg });
  }
});

router.get('/errands/active', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getActiveClientErrand(req.clientId!) });
});

router.get('/errands/:id', clientAuthMiddleware, (req, res) => {
  const errand = getClientErrandById(req.clientId!, req.params['id']!);
  if (!errand) { res.status(404).json({ success: false, error: 'Errand not found' }); return; }
  res.json({ success: true, data: errand });
});

router.post('/errands/:id/cancel', clientAuthMiddleware, (req, res) => {
  const ok = cancelClientErrand(req.clientId!, req.params['id']!);
  if (!ok) {
    res.status(400).json({ success: false, error: 'Errand not found or cannot be cancelled' });
    return;
  }
  res.json({ success: true });
});

// ─── Intercity ────────────────────────────────────────────────────────────────

router.get('/intercity/routes', (_req, res) => {
  // Return all available city pairs with fare info
  const cities = ['pamplona', 'cucuta', 'bucaramanga', 'chitaga', 'malaga', 'ocana', 'bogota'] as const;
  type City = typeof cities[number];
  const routes: Record<string, unknown>[] = [];
  for (const origin of cities) {
    for (const dest of cities) {
      if (origin === dest) continue;
      const info = getIntercityRoute(origin as City, dest as City);
      if (info) routes.push({ origin, destination: dest, ...info });
    }
  }
  res.json({ success: true, data: routes });
});

router.post('/intercity/request', clientAuthMiddleware, (req, res) => {
  const dto = req.body as Partial<RequestIntercityDTO>;

  if (!dto.origin || !dto.destination || !dto.departureTime || !dto.seats || dto.offeredFare === undefined) {
    res.status(400).json({
      success: false,
      error: 'origin, destination, departureTime, seats, offeredFare are required',
    });
    return;
  }

  try {
    const booking = requestIntercityBooking(req.clientId!, {
      origin: dto.origin,
      destination: dto.destination,
      departureTime: dto.departureTime,
      seats: dto.seats,
      offeredFare: dto.offeredFare,
      pickupAddress: dto.pickupAddress,
      dropoffAddress: dto.dropoffAddress,
      notes: dto.notes,
    });
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to request intercity booking';
    res.status(400).json({ success: false, error: msg });
  }
});

router.get('/intercity/active', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getActiveIntercityBooking(req.clientId!) });
});

router.get('/intercity/:id', clientAuthMiddleware, (req, res) => {
  const booking = getIntercityBookingById(req.clientId!, req.params['id']!);
  if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }
  res.json({ success: true, data: booking });
});

router.post('/intercity/:id/confirm', clientAuthMiddleware, (req, res) => {
  const booking = confirmIntercityBooking(req.clientId!, req.params['id']!);
  if (!booking) {
    res.status(400).json({ success: false, error: 'Booking not found or not in driver_found state' });
    return;
  }
  res.json({ success: true, data: booking });
});

router.post('/intercity/:id/reject-offer', clientAuthMiddleware, (req, res) => {
  const ok = rejectIntercityOffer(req.clientId!, req.params['id']!);
  if (!ok) {
    res.status(400).json({ success: false, error: 'No counter offer to reject' });
    return;
  }
  res.json({ success: true });
});

router.post('/intercity/:id/cancel', clientAuthMiddleware, (req, res) => {
  const ok = cancelIntercityBooking(req.clientId!, req.params['id']!);
  if (!ok) {
    res.status(400).json({ success: false, error: 'Booking not found or cannot be cancelled' });
    return;
  }
  res.json({ success: true });
});

// ─── Shared pooled rides (Modelo A) ─────────────────────────────────────────────

// GET /client/intercity/pool/search?origin=&destination=&date=
router.get('/intercity/pool/search', clientAuthMiddleware, (req, res) => {
  const trips = searchPooledTrips({
    origin: req.query['origin'] as IntercityCity | undefined,
    destination: req.query['destination'] as IntercityCity | undefined,
    date: req.query['date'] as string | undefined,
  });
  res.json({ success: true, data: trips });
});

// GET /client/intercity/pool/bookings  – the caller's own seat bookings
router.get('/intercity/pool/bookings', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getClientBookings(req.clientId!) });
});

// GET /client/intercity/pool/:id
router.get('/intercity/pool/:id', clientAuthMiddleware, (req, res) => {
  const trip = getPooledTripById(req.params['id']!, false);
  if (!trip) { res.status(404).json({ success: false, error: 'Trip not found' }); return; }
  res.json({ success: true, data: trip });
});

// POST /client/intercity/pool/:id/book
router.post('/intercity/pool/:id/book', clientAuthMiddleware, async (req, res) => {
  const dto = req.body as Partial<BookSeatsDTO>;
  if (dto.seatsBooked === undefined) {
    res.status(400).json({ success: false, error: 'seatsBooked is required' });
    return;
  }
  const passengerName = (await getClientNameByPhone(req.clientPhone!)) ?? 'Pasajero Nexum';
  try {
    const result = bookSeats(req.clientId!, passengerName, req.clientPhone!, req.params['id']!, {
      seatsBooked: dto.seatsBooked,
      pickupAddress: dto.pickupAddress,
      notes: dto.notes,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to book seats' });
  }
});

// POST /client/intercity/pool/bookings/:bookingId/cancel
router.post('/intercity/pool/bookings/:bookingId/cancel', clientAuthMiddleware, (req, res) => {
  try {
    const trip = cancelSeatBooking(req.clientId!, req.params['bookingId']!);
    if (!trip) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }
    res.json({ success: true, data: trip });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to cancel booking' });
  }
});

// ─── Ride negotiation (inDriver-style bids + chat) ─────────────────────────────

// POST /client/rides/request — publish a ride with an offered fare
router.post('/rides/request', clientAuthMiddleware, async (req, res) => {
  const dto = req.body as Record<string, unknown>;
  const required = ['serviceType', 'originAddress', 'destinationAddress', 'offeredFare', 'distanceKm', 'etaMinutes'];
  for (const f of required) {
    if (dto[f] === undefined) {
      res.status(400).json({ success: false, error: `${f} is required` });
      return;
    }
  }
  const client = await getClientById(req.clientId!);
  const clientName = client?.name ?? (await getClientNameByPhone(req.clientPhone!)) ?? 'Usuario Nexum';
  try {
    const ride = createRideRequest(req.clientId!, clientName, req.clientPhone!, {
      serviceType: dto['serviceType'] as never,
      originAddress: String(dto['originAddress']),
      destinationAddress: String(dto['destinationAddress']),
      originLat: dto['originLat'] as number | undefined,
      originLng: dto['originLng'] as number | undefined,
      destinationLat: dto['destinationLat'] as number | undefined,
      destinationLng: dto['destinationLng'] as number | undefined,
      offeredFare: Number(dto['offeredFare']),
      distanceKm: Number(dto['distanceKm']),
      etaMinutes: Number(dto['etaMinutes']),
      notes: dto['notes'] as string | undefined,
    });
    res.status(201).json({ success: true, data: ride });
  } catch (err) {
    const status = err instanceof RideNegotiationError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to create ride' });
  }
});

// GET /client/rides/active
router.get('/rides/active', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getActiveClientRide(req.clientId!) });
});

// GET /client/rides/:id
router.get('/rides/:id', clientAuthMiddleware, (req, res) => {
  const ride = getRideById(req.params['id']!);
  if (!ride || ride.clientId !== req.clientId) {
    res.status(404).json({ success: false, error: 'Ride not found' });
    return;
  }
  res.json({ success: true, data: ride });
});

// GET /client/rides/:id/chat
router.get('/rides/:id/chat', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getChatHistory(req.params['id']!) });
});

// GET /client/drivers/:id/profile — public driver profile (Feature E)
router.get('/drivers/:id/profile', clientAuthMiddleware, (req, res) => {
  const profile = getDriverPublicProfile(req.params['id']!);
  if (!profile) { res.status(404).json({ success: false, error: 'Driver not found' }); return; }
  res.json({ success: true, data: profile });
});

// ─── Payments ─────────────────────────────────────────────────────────────────

router.post('/payments/init', clientAuthMiddleware, (req, res) => {
  const { amount, description, orderId, tripId, customerEmail } = req.body as {
    amount?: number;
    description?: string;
    orderId?: string;
    tripId?: string;
    customerEmail?: string;
  };

  if (!amount || !description) {
    res.status(400).json({ success: false, error: 'amount and description are required' });
    return;
  }

  try {
    const result = createPaymentLink(req.clientId!, { amount, description, orderId, tripId, customerEmail });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create payment';
    res.status(400).json({ success: false, error: msg });
  }
});

// ─── Maps (proxy — clave no expuesta al cliente) ───────────────────────────────

// GET /client/maps/geocode?address=...
router.get('/maps/geocode', async (req, res): Promise<void> => {
  const { address } = req.query as { address?: string };
  if (!address) { res.status(400).json({ success: false, error: 'address is required' }); return; }
  const result = await geocodeAddress(address);
  if (!result) { res.status(404).json({ success: false, error: 'Address not found or Maps not configured' }); return; }
  res.status(200).json({ success: true, data: result });
});

// GET /client/maps/route?origin=...&destination=...
router.get('/maps/route', async (req, res): Promise<void> => {
  const { origin, destination } = req.query as { origin?: string; destination?: string };
  if (!origin || !destination) {
    res.status(400).json({ success: false, error: 'origin and destination are required' });
    return;
  }
  const result = await calculateRoute(origin, destination);
  if (!result) { res.status(404).json({ success: false, error: 'Route not found or Maps not configured' }); return; }
  res.status(200).json({ success: true, data: result });
});

// GET /client/maps/places/autocomplete?input=...&lat=...&lng=...
router.get('/maps/places/autocomplete', async (req, res): Promise<void> => {
  const { input, lat, lng } = req.query as { input?: string; lat?: string; lng?: string };
  if (!input) { res.status(400).json({ success: false, error: 'input is required' }); return; }
  const bias = lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined;
  const predictions = await placesAutocomplete(input, bias);
  res.status(200).json({ success: true, data: predictions });
});

// GET /client/maps/places/details?placeId=...
router.get('/maps/places/details', async (req, res): Promise<void> => {
  const { placeId } = req.query as { placeId?: string };
  if (!placeId) { res.status(400).json({ success: false, error: 'placeId is required' }); return; }
  const result = await placeDetails(placeId);
  if (!result) { res.status(404).json({ success: false, error: 'Place not found or Maps not configured' }); return; }
  res.status(200).json({ success: true, data: result });
});

export default router;
