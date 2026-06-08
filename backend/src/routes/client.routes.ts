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
  RequestClientErrandDTO,
  RequestIntercityDTO,
  BookSeatsDTO,
  IntercityCity,
} from '../types';

const router = Router();

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/send-otp', async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ success: false, error: 'phone is required' }); return; }
  try {
    await sendClientOtp(phone);
    res.json({ success: true, data: { success: true } });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Error sending OTP' });
  }
});

router.post('/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) { res.status(400).json({ success: false, error: 'phone and otp are required' }); return; }
  try {
    const result = await verifyClientOtp(phone, otp);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(401).json({ success: false, error: err instanceof Error ? err.message : 'Verification failed' });
  }
});

// ─── Businesses ───────────────────────────────────────────────────────────────

router.get('/businesses', async (_req, res) => {
  try {
    res.json({ success: true, data: await getClientBusinesses() });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.get('/businesses/:id', async (req, res) => {
  try {
    res.json({ success: true, data: await getClientBusinessById(req.params['id']!) });
  } catch {
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
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to place order' });
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

router.post('/trips/request', clientAuthMiddleware, async (req, res) => {
  const dto = req.body as {
    serviceType?: string; originAddress?: string; destinationAddress?: string;
    estimatedFare?: number; distanceKm?: number; etaMinutes?: number;
    recipientName?: string; recipientPhone?: string; packageDescription?: string;
  };

  if (!dto.serviceType || !dto.originAddress || !dto.destinationAddress) {
    res.status(400).json({ success: false, error: 'serviceType, originAddress, destinationAddress required' });
    return;
  }

  try {
    const trip = await requestClientTrip(req.clientId!, {
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
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to request trip' });
  }
});

router.get('/trips/active', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getActiveClientTrip(req.clientId!) });
});

router.post('/trips/:id/cancel', clientAuthMiddleware, async (req, res) => {
  const ok = await cancelClientTrip(req.clientId!, req.params['id']!);
  if (!ok) { res.status(400).json({ success: false, error: 'Trip not found or cannot be cancelled' }); return; }
  res.json({ success: true });
});

// ─── Errands (Mandados) ───────────────────────────────────────────────────────

router.post('/errands/request', clientAuthMiddleware, async (req, res) => {
  const dto = req.body as Partial<RequestClientErrandDTO>;
  if (!dto.category || !dto.description || !dto.pickupAddress || !dto.dropoffAddress) {
    res.status(400).json({ success: false, error: 'category, description, pickupAddress, dropoffAddress are required' });
    return;
  }
  try {
    const errand = await requestClientErrand(req.clientId!, {
      category: dto.category, description: dto.description,
      pickupAddress: dto.pickupAddress, dropoffAddress: dto.dropoffAddress,
      purchaseBudget: dto.purchaseBudget, notes: dto.notes,
    });
    res.status(201).json({ success: true, data: errand });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to request errand' });
  }
});

router.get('/errands/active', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getActiveClientErrand(req.clientId!) });
});

router.get('/errands/:id', clientAuthMiddleware, async (req, res) => {
  const errand = await getClientErrandById(req.clientId!, req.params['id']!);
  if (!errand) { res.status(404).json({ success: false, error: 'Errand not found' }); return; }
  res.json({ success: true, data: errand });
});

router.post('/errands/:id/cancel', clientAuthMiddleware, async (req, res) => {
  const ok = await cancelClientErrand(req.clientId!, req.params['id']!);
  if (!ok) { res.status(400).json({ success: false, error: 'Errand not found or cannot be cancelled' }); return; }
  res.json({ success: true });
});

// ─── Intercity ────────────────────────────────────────────────────────────────

router.get('/intercity/routes', (_req, res) => {
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

router.post('/intercity/request', clientAuthMiddleware, async (req, res) => {
  const dto = req.body as Partial<RequestIntercityDTO>;
  if (!dto.origin || !dto.destination || !dto.departureTime || !dto.seats || dto.offeredFare === undefined) {
    res.status(400).json({ success: false, error: 'origin, destination, departureTime, seats, offeredFare are required' });
    return;
  }
  try {
    const booking = await requestIntercityBooking(req.clientId!, {
      origin: dto.origin, destination: dto.destination, departureTime: dto.departureTime,
      seats: dto.seats, offeredFare: dto.offeredFare,
      pickupAddress: dto.pickupAddress, dropoffAddress: dto.dropoffAddress, notes: dto.notes,
    });
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to request intercity booking' });
  }
});

router.get('/intercity/active', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getActiveIntercityBooking(req.clientId!) });
});

router.get('/intercity/:id', clientAuthMiddleware, async (req, res) => {
  const booking = await getIntercityBookingById(req.clientId!, req.params['id']!);
  if (!booking) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }
  res.json({ success: true, data: booking });
});

router.post('/intercity/:id/confirm', clientAuthMiddleware, async (req, res) => {
  const booking = await confirmIntercityBooking(req.clientId!, req.params['id']!);
  if (!booking) { res.status(400).json({ success: false, error: 'Booking not found or not in driver_found state' }); return; }
  res.json({ success: true, data: booking });
});

router.post('/intercity/:id/reject-offer', clientAuthMiddleware, async (req, res) => {
  const ok = await rejectIntercityOffer(req.clientId!, req.params['id']!);
  if (!ok) { res.status(400).json({ success: false, error: 'No counter offer to reject' }); return; }
  res.json({ success: true });
});

router.post('/intercity/:id/cancel', clientAuthMiddleware, async (req, res) => {
  const ok = await cancelIntercityBooking(req.clientId!, req.params['id']!);
  if (!ok) { res.status(400).json({ success: false, error: 'Booking not found or cannot be cancelled' }); return; }
  res.json({ success: true });
});

// ─── Shared pooled rides ─────────────────────────────────────────────────────

router.get('/intercity/pool/search', clientAuthMiddleware, async (req, res) => {
  const trips = await searchPooledTrips({
    origin: req.query['origin'] as IntercityCity | undefined,
    destination: req.query['destination'] as IntercityCity | undefined,
    date: req.query['date'] as string | undefined,
  });
  res.json({ success: true, data: trips });
});

router.get('/intercity/pool/bookings', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getClientBookings(req.clientId!) });
});

router.get('/intercity/pool/:id', clientAuthMiddleware, async (req, res) => {
  const trip = await getPooledTripById(req.params['id']!, false);
  if (!trip) { res.status(404).json({ success: false, error: 'Trip not found' }); return; }
  res.json({ success: true, data: trip });
});

router.post('/intercity/pool/:id/book', clientAuthMiddleware, async (req, res) => {
  const dto = req.body as Partial<BookSeatsDTO>;
  if (dto.seatsBooked === undefined) { res.status(400).json({ success: false, error: 'seatsBooked is required' }); return; }
  const passengerName = (await getClientNameByPhone(req.clientPhone!)) ?? 'Pasajero Nexum';
  try {
    const result = await bookSeats(req.clientId!, passengerName, req.clientPhone!, req.params['id']!, {
      seatsBooked: dto.seatsBooked, pickupAddress: dto.pickupAddress, notes: dto.notes,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to book seats' });
  }
});

router.post('/intercity/pool/bookings/:bookingId/cancel', clientAuthMiddleware, async (req, res) => {
  try {
    const trip = await cancelSeatBooking(req.clientId!, req.params['bookingId']!);
    if (!trip) { res.status(404).json({ success: false, error: 'Booking not found' }); return; }
    res.json({ success: true, data: trip });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to cancel booking' });
  }
});

// ─── Ride negotiation ─────────────────────────────────────────────────────────

router.post('/rides/request', clientAuthMiddleware, async (req, res) => {
  const dto = req.body as Record<string, unknown>;
  const required = ['serviceType', 'originAddress', 'destinationAddress', 'offeredFare', 'distanceKm', 'etaMinutes'];
  for (const f of required) {
    if (dto[f] === undefined) { res.status(400).json({ success: false, error: `${f} is required` }); return; }
  }
  const client = await getClientById(req.clientId!);
  const clientName = client?.name ?? (await getClientNameByPhone(req.clientPhone!)) ?? 'Usuario Nexum';
  try {
    const ride = await createRideRequest(req.clientId!, clientName, req.clientPhone!, {
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

router.get('/rides/active', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getActiveClientRide(req.clientId!) });
});

router.get('/rides/:id', clientAuthMiddleware, (req, res) => {
  const ride = getRideById(req.params['id']!);
  if (!ride || ride.clientId !== req.clientId) {
    res.status(404).json({ success: false, error: 'Ride not found' }); return;
  }
  res.json({ success: true, data: ride });
});

router.get('/rides/:id/chat', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getChatHistory(req.params['id']!) });
});

router.get('/drivers/:id/profile', clientAuthMiddleware, async (req, res) => {
  const profile = await getDriverPublicProfile(req.params['id']!);
  if (!profile) { res.status(404).json({ success: false, error: 'Driver not found' }); return; }
  res.json({ success: true, data: profile });
});

// ─── Payments ─────────────────────────────────────────────────────────────────

router.post('/payments/init', clientAuthMiddleware, async (req, res) => {
  const { amount, description, orderId, tripId, customerEmail } = req.body as {
    amount?: number; description?: string; orderId?: string; tripId?: string; customerEmail?: string;
  };
  if (!amount || !description) { res.status(400).json({ success: false, error: 'amount and description are required' }); return; }
  try {
    const result = await createPaymentLink(req.clientId!, { amount, description, orderId, tripId, customerEmail });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to create payment' });
  }
});

export default router;
