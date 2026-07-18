import { Router } from 'express';
import { clientAuthMiddleware } from '../middleware/client-auth.middleware';
import { clientRequestRateLimit } from '../middleware/client-rate-limit.middleware';
import { OtpRateLimitError } from '../services/otp.service';
import {
  sendClientOtp,
  verifyClientOtp,
  getClientBusinesses,
  getClientBusinessById,
  placeClientOrder,
  getClientOrders,
  getClientOrderById,
  cancelClientOrder,
  requestClientTrip,
  getActiveClientTrip,
  getClientTripHistory,
  getClientTripRaw,
  getClientTripSnapshot,
  cancelClientTrip,
  getClientNameByPhone,
  getClientById,
  getClientProfile,
  updateClientProfile,
} from '../services/client.service';
import { documentUpload, fileToUrl } from '../lib/upload';
import {
  createFreightRequest,
  listClientFreights,
  cancelClientFreight,
  FreightError,
  CreateFreightDTO,
} from '../services/freight.service';
import { registerClientFcmToken } from '../services/push.service';
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
import { startErrandMatchingCycle, getNearbyDriverPositions } from '../services/matching.service';
import {
  requestIntercityBooking,
  confirmIntercityBooking,
  rejectIntercityOffer,
  cancelIntercityBooking,
  getActiveIntercityBooking,
  getIntercityBookingById,
  getIntercityHistory,
  rateIntercityBooking,
  IntercityError,
} from '../services/intercity.service';
import {
  getIntercityRoute,
  INTERCITY_REMOVE_CAP,
  INTERCITY_DUAL_MODEL,
  INTERCITY_CITY_COORDS,
} from '../config/constants';
import { createPaymentLink, getPaymentByReference, reconcilePayment } from '../services/payment.service';
import { requestTripTip, requestOrderTip, TipError } from '../services/tip.service';
import {
  getClientPromoOverview,
  validatePromo,
  redeemPromo,
  redeemReferral,
  PromoError,
} from '../services/promo.service';
import { getFareEstimate } from '../services/surge.service';
import { getTripChat, postTripChatPhoto, TripChatError } from '../services/trip-chat.service';
import {
  getClientKyc,
  setClientSelfie,
  submitClientKyc,
  ClientKycError,
} from '../services/client-kyc.service';
import {
  createTicket,
  listTicketsFor,
  getTicketDetail,
  addRequesterMessage,
  SupportError,
} from '../services/support.service';
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
    const status = err instanceof OtpRateLimitError ? 429 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error sending OTP' });
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

// ─── Perfil ───────────────────────────────────────────────────────────────────

router.get('/profile', clientAuthMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await getClientProfile(req.clientId!) });
  } catch (err) {
    res.status(404).json({ success: false, error: err instanceof Error ? err.message : 'Usuario no encontrado' });
  }
});

router.put('/profile', clientAuthMiddleware, async (req, res) => {
  const { name, email } = req.body as { name?: string; email?: string };
  try {
    res.json({ success: true, data: await updateClientProfile(req.clientId!, { name, email }) });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo actualizar el perfil' });
  }
});

// Sube el avatar del cliente (multipart 'file') y lo asigna al perfil.
router.post(
  '/profile/photo',
  clientAuthMiddleware,
  (req, res, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'El avatar debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const updated = await updateClientProfile(req.clientId!, { avatarUrl: fileToUrl(req.file) });
      res.status(201).json({ success: true, data: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar la foto de perfil';
      res.status(500).json({ success: false, error: message });
    }
  },
);

// ─── Fletes de carga (turbo/camión/mula) ──────────────────────────────────────

router.post('/freight/request', clientAuthMiddleware, clientRequestRateLimit, async (req, res) => {
  try {
    const freight = await createFreightRequest(req.clientId!, req.body as CreateFreightDTO);
    res.status(201).json({ success: true, data: freight });
  } catch (err) {
    const status = err instanceof FreightError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo publicar el flete' });
  }
});

router.get('/freight', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await listClientFreights(req.clientId!) });
});

router.post('/freight/:id/cancel', clientAuthMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await cancelClientFreight(req.clientId!, req.params['id']!) });
  } catch (err) {
    const status = err instanceof FreightError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo cancelar el flete' });
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

router.post('/orders', clientAuthMiddleware, clientRequestRateLimit, async (req, res) => {
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

    // El pedido nace PENDING: el despacho al repartidor ya NO es inmediato. Se
    // dispara cuando el restaurante ACEPTA y fija el tiempo de preparación
    // (acceptOrderByBusiness → startOrderMatchingCycle), para que el conductor
    // no espere en la puerta mientras se cocina.
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

// Cancela un pedido (hasta que el repartidor lo recoja); avisa al repartidor.
router.post('/orders/:id/cancel', clientAuthMiddleware, async (req, res) => {
  const ok = await cancelClientOrder(req.clientId!, req.params['id']!);
  if (!ok) {
    res.status(400).json({ success: false, error: 'El pedido no existe o ya no se puede cancelar' });
    return;
  }
  res.json({ success: true });
});

// POST /client/orders/:id/tip { amount } — propina al repartidor (pago Wompi).
router.post('/orders/:id/tip', clientAuthMiddleware, async (req, res) => {
  const { amount } = req.body as { amount?: number };
  if (typeof amount !== 'number') { res.status(400).json({ success: false, error: 'amount (número) es requerido' }); return; }
  try {
    const payment = await requestOrderTip(req.clientId!, req.params['id']!, amount);
    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    const status = err instanceof TipError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Trips (auth required) ────────────────────────────────────────────────────

// Posiciones anónimas de conductores en línea cercanos, para el mapa del home.
router.get('/drivers/nearby', clientAuthMiddleware, async (req, res) => {
  const lat = Number(req.query['lat']);
  const lng = Number(req.query['lng']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ success: false, error: 'lat y lng son requeridos' });
    return;
  }
  res.json({ success: true, data: await getNearbyDriverPositions(lat, lng) });
});

router.get('/trips/estimate', async (req, res) => {
  const lat = parseFloat(req.query['lat'] as string);
  const lng = parseFloat(req.query['lng'] as string);
  const distanceKm = parseFloat(req.query['distanceKm'] as string);
  const etaMinutes = parseFloat(req.query['etaMinutes'] as string);

  if (isNaN(lat) || isNaN(lng) || isNaN(distanceKm) || isNaN(etaMinutes)) {
    res.status(400).json({ success: false, error: 'lat, lng, distanceKm, etaMinutes are required numbers' });
    return;
  }

  try {
    const estimate = await getFareEstimate(lat, lng, distanceKm, etaMinutes);
    res.json({ success: true, data: estimate });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error computing estimate' });
  }
});

router.post('/trips/request', clientAuthMiddleware, clientRequestRateLimit, async (req, res) => {
  const dto = req.body as {
    serviceType?: string; originAddress?: string; destinationAddress?: string;
    estimatedFare?: number; distanceKm?: number; etaMinutes?: number;
    originLat?: number; originLng?: number; destLat?: number; destLng?: number;
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
      originLat: dto.originLat,
      originLng: dto.originLng,
      destLat: dto.destLat,
      destLng: dto.destLng,
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

// Historial de viajes finalizados (completados/cancelados), más reciente primero.
router.get('/trips/history', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getClientTripHistory(req.clientId!) });
});

// Snapshot de un viaje propio: fallback de seguimiento por polling cuando el
// WS no está disponible (p. ej. cliente web).
router.get('/trips/:id', clientAuthMiddleware, async (req, res) => {
  const tripId = req.params['id']!;
  const raw = await getClientTripRaw(tripId);
  if (!raw || raw.clientId !== req.clientId) {
    res.status(404).json({ success: false, error: 'Viaje no encontrado' });
    return;
  }
  res.json({ success: true, data: await getClientTripSnapshot(tripId) });
});

router.post('/trips/:id/cancel', clientAuthMiddleware, async (req, res) => {
  const ok = await cancelClientTrip(req.clientId!, req.params['id']!);
  if (!ok) { res.status(400).json({ success: false, error: 'Trip not found or cannot be cancelled' }); return; }
  res.json({ success: true });
});

// POST /client/trips/:id/tip { amount } — propina al conductor (pago Wompi).
router.post('/trips/:id/tip', clientAuthMiddleware, async (req, res) => {
  const { amount } = req.body as { amount?: number };
  if (typeof amount !== 'number') { res.status(400).json({ success: false, error: 'amount (número) es requerido' }); return; }
  try {
    const payment = await requestTripTip(req.clientId!, req.params['id']!, amount);
    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    const status = err instanceof TipError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Push notifications ───────────────────────────────────────────────────────

// PUT /client/fcm-token { token } — registra el token del dispositivo para push
router.put('/fcm-token', clientAuthMiddleware, async (req, res) => {
  const token = (req.body as { token?: unknown }).token;
  if (typeof token !== 'string' || token.length === 0) {
    res.status(400).json({ success: false, error: 'token (string) is required' });
    return;
  }
  await registerClientFcmToken(req.clientId!, token);
  res.json({ success: true, data: { registered: true } });
});

// ─── Errands (Mandados) ───────────────────────────────────────────────────────

router.post('/errands/request', clientAuthMiddleware, clientRequestRateLimit, async (req, res) => {
  const dto = req.body as Partial<RequestClientErrandDTO> & { pickupLat?: number; pickupLng?: number };
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

    // Matching real: ofrece el mandado a conductores cercanos en línea (mismo
    // motor geoespacial que los viajes). La ubicación de recogida la envía el
    // cliente; si no llega, se ancla al centro de Pamplona. Fire-and-forget para
    // no demorar la respuesta HTTP.
    const lat = typeof dto.pickupLat === 'number' ? dto.pickupLat : INTERCITY_CITY_COORDS.pamplona.lat;
    const lng = typeof dto.pickupLng === 'number' ? dto.pickupLng : INTERCITY_CITY_COORDS.pamplona.lng;
    void startErrandMatchingCycle(errand.id, lat, lng);
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
  res.json({
    success: true,
    data: routes,
    // Legal model flags so the client can show the right copy / disclaimers.
    legal: {
      capEnforced: !INTERCITY_REMOVE_CAP,
      dualModel: INTERCITY_DUAL_MODEL,
    },
  });
});

router.post('/intercity/request', clientAuthMiddleware, clientRequestRateLimit, async (req, res) => {
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
    const status = err instanceof IntercityError ? 422 : 400;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to request intercity booking' });
  }
});

router.get('/intercity/active', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getActiveIntercityBooking(req.clientId!) });
});

// Nota: registrada antes de '/intercity/:id' para que 'history' no se
// interprete como un id de reserva.
router.get('/intercity/history', clientAuthMiddleware, async (req, res) => {
  res.json({ success: true, data: await getIntercityHistory(req.clientId!) });
});

router.post('/intercity/:id/rate', clientAuthMiddleware, async (req, res) => {
  const { rating, comment } = req.body as { rating?: number; comment?: string };
  if (rating === undefined) { res.status(400).json({ success: false, error: 'rating is required' }); return; }
  try {
    const booking = await rateIntercityBooking(req.clientId!, req.params['id']!, rating, comment);
    res.json({ success: true, data: booking });
  } catch (err) {
    const status = err instanceof IntercityError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to rate booking' });
  }
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
  const passengerName = (await getClientNameByPhone(req.clientPhone!)) ?? 'Pasajero ZIPA';
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
  const clientName = client?.name ?? (await getClientNameByPhone(req.clientPhone!)) ?? 'Usuario ZIPA';
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

// ─── Promociones y referidos ─────────────────────────────────────────────────

// GET /client/promos — código de referido propio + cupones personales vigentes.
router.get('/promos', clientAuthMiddleware, async (req, res) => {
  try {
    const overview = await getClientPromoOverview(req.clientId!);
    res.json({ success: true, data: overview });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /client/promos/validate { code, amount, context } — previsualiza el descuento.
router.post('/promos/validate', clientAuthMiddleware, async (req, res) => {
  const { code, amount, context } = req.body as { code?: string; amount?: number; context?: string };
  if (!code || typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ success: false, error: 'code y amount son requeridos' });
    return;
  }
  const ctx: 'trip' | 'order' = context === 'trip' ? 'trip' : 'order';
  try {
    const quote = await validatePromo(req.clientId!, code, amount, ctx);
    res.json({ success: true, data: quote });
  } catch (err) {
    const status = err instanceof PromoError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /client/promos/redeem { code, amount, context } — canjea (registra la redención).
router.post('/promos/redeem', clientAuthMiddleware, async (req, res) => {
  const { code, amount, context } = req.body as { code?: string; amount?: number; context?: string };
  if (!code || typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ success: false, error: 'code y amount son requeridos' });
    return;
  }
  const ctx: 'trip' | 'order' = context === 'trip' ? 'trip' : 'order';
  try {
    const quote = await redeemPromo(req.clientId!, code, amount, ctx);
    res.json({ success: true, data: quote });
  } catch (err) {
    const status = err instanceof PromoError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /client/promos/redeem-referral { code } — canjea un código de referido.
router.post('/promos/redeem-referral', clientAuthMiddleware, async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ success: false, error: 'code es requerido' }); return; }
  try {
    const result = await redeemReferral(req.clientId!, code);
    res.json({ success: true, data: result });
  } catch (err) {
    const status = err instanceof PromoError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// GET /client/payments/:ref — estado del pago (la app hace poll tras abrir el
// checkout). Reconcilia contra Wompi si sigue pendiente, por si el webhook
// se perdió.
router.get('/payments/:ref', clientAuthMiddleware, async (req, res) => {
  const ref = req.params['ref']!;
  await reconcilePayment(ref);
  const payment = await getPaymentByReference(ref);
  if (!payment || payment.clientId !== req.clientId) {
    res.status(404).json({ success: false, error: 'Payment not found' });
    return;
  }
  res.json({
    success: true,
    data: {
      referenceCode: payment.referenceCode,
      status: payment.status,
      amount: payment.amount,
      orderId: payment.orderId ?? null,
      tripId: payment.tripId ?? null,
    },
  });
});

// ─── Chat del viaje (pasajero ↔ conductor) ─────────────────────────────────────

// GET /client/trips/:id/chat — historial del chat del viaje.
router.get('/trips/:id/chat', clientAuthMiddleware, async (req, res) => {
  try {
    const data = await getTripChat(req.params['id']!, req.clientId!);
    res.json({ success: true, data });
  } catch (err) {
    const status = err instanceof TripChatError ? 403 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /client/trips/:id/chat/photo — envía una foto en el chat del viaje.
router.post(
  '/trips/:id/chat/photo',
  clientAuthMiddleware,
  (req, res, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, error: err.message }); return; }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) { res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' }); return; }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'El archivo debe ser una imagen.' }); return;
    }
    try {
      const data = await postTripChatPhoto(req.params['id']!, 'client', req.clientId!, fileToUrl(req.file));
      res.status(201).json({ success: true, data });
    } catch (err) {
      const status = err instanceof TripChatError ? 403 : 500;
      res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
    }
  },
);

// ─── Verificación de identidad del pasajero (KYC cliente) ──────────────────────

router.get('/kyc', clientAuthMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await getClientKyc(req.clientId!) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.post(
  '/kyc/selfie',
  clientAuthMiddleware,
  (req, res, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, error: err.message }); return; }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) { res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' }); return; }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La selfie debe ser una imagen.' }); return;
    }
    try {
      await setClientSelfie(req.clientId!, fileToUrl(req.file));
      res.status(201).json({ success: true, data: await getClientKyc(req.clientId!) });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
    }
  },
);

router.post('/kyc/submit', clientAuthMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await submitClientKyc(req.clientId!) });
  } catch (err) {
    const status = err instanceof ClientKycError ? 422 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Soporte con tickets ────────────────────────────────────────────────────────

// GET /client/support/tickets — mis tickets.
router.get('/support/tickets', clientAuthMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await listTicketsFor('client', req.clientId!) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /client/support/tickets { subject, body, category? } — abre un ticket.
router.post('/support/tickets', clientAuthMiddleware, async (req, res) => {
  const { subject, body, category } = req.body as { subject?: string; body?: string; category?: string };
  if (!subject || !body) { res.status(400).json({ success: false, error: 'subject y body son requeridos' }); return; }
  try {
    const client = await getClientById(req.clientId!).catch(() => null);
    const ticket = await createTicket('client', req.clientId!, {
      subject, body, category, requesterName: client?.name ?? null,
    });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    const status = err instanceof SupportError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// GET /client/support/tickets/:id — detalle con mensajes.
router.get('/support/tickets/:id', clientAuthMiddleware, async (req, res) => {
  try {
    res.json({ success: true, data: await getTicketDetail(req.params['id']!, 'client', req.clientId!) });
  } catch (err) {
    const status = err instanceof SupportError ? 404 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /client/support/tickets/:id/messages { body } — responde en el ticket.
router.post('/support/tickets/:id/messages', clientAuthMiddleware, async (req, res) => {
  const { body } = req.body as { body?: string };
  if (!body) { res.status(400).json({ success: false, error: 'body es requerido' }); return; }
  try {
    res.json({ success: true, data: await addRequesterMessage(req.params['id']!, 'client', req.clientId!, body) });
  } catch (err) {
    const status = err instanceof SupportError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

export default router;
