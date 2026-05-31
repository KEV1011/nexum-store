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
} from '../services/client.service';
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
import { RequestClientErrandDTO, RequestIntercityDTO } from '../types';

const router = Router();

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.post('/auth/send-otp', (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }
  try {
    sendClientOtp(phone);
    res.json({ success: true, data: { success: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error sending OTP';
    res.status(400).json({ success: false, error: msg });
  }
});

router.post('/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ success: false, error: 'phone and otp are required' });
    return;
  }
  try {
    const result = verifyClientOtp(phone, otp);
    res.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification failed';
    res.status(401).json({ success: false, error: msg });
  }
});

// ─── Businesses ───────────────────────────────────────────────────────────────

router.get('/businesses', (_req, res) => {
  res.json({ success: true, data: getClientBusinesses() });
});

router.get('/businesses/:id', (req, res) => {
  try {
    res.json({ success: true, data: getClientBusinessById(req.params['id']!) });
  } catch (err) {
    res.status(404).json({ success: false, error: 'Business not found' });
  }
});

// ─── Orders (auth required) ───────────────────────────────────────────────────

router.post('/orders', clientAuthMiddleware, (req, res) => {
  const clientId = req.clientId!;
  const clientPhone = req.clientPhone!;
  const dto = req.body as { businessId?: string; deliveryAddress?: string; items?: unknown[] };

  if (!dto.businessId || !dto.deliveryAddress || !Array.isArray(dto.items) || dto.items.length === 0) {
    res.status(400).json({ success: false, error: 'businessId, deliveryAddress and items are required' });
    return;
  }

  try {
    const order = placeClientOrder(clientId, clientPhone, {
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

router.get('/orders', clientAuthMiddleware, (req, res) => {
  res.json({ success: true, data: getClientOrders(req.clientId!) });
});

router.get('/orders/:id', clientAuthMiddleware, (req, res) => {
  const order = getClientOrderById(req.clientId!, req.params['id']!);
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

export default router;
