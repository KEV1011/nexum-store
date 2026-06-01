import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { MOCK_DRIVER, getMaxFarePerSeat, getIntercityRoute } from '../config/constants';
import { getTripService } from '../services/trip.service';
import {
  publishPooledTrip,
  getDriverPooledTrips,
  departPooledTrip,
  completePooledTrip,
  cancelPooledTrip,
  PooledTripError,
} from '../services/intercity-pool.service';
import { PublishPooledTripDTO, IntercityCity } from '../types';

const router = Router();

router.use(authMiddleware);

// GET /driver/profile
router.get('/profile', (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: MOCK_DRIVER });
});

// GET /driver/status
router.get('/status', (_req: Request, res: Response): void => {
  const svc = getTripService();
  res.status(200).json({
    success: true,
    data: {
      status: svc.getDriverStatus(),
      dailyTrips: svc.getDailyTrips(),
      dailyEarnings: svc.getDailyEarnings(),
    },
  });
});

// PUT /driver/status  – only allows online/offline
router.put('/status', (req: Request, res: Response): void => {
  const { status } = req.body as { status?: string };

  if (!status || (status !== 'online' && status !== 'offline')) {
    res.status(400).json({ success: false, error: 'status must be "online" or "offline"' });
    return;
  }

  const svc = getTripService();
  svc.setDriverStatus(status);

  res.status(200).json({
    success: true,
    data: {
      status,
      dailyTrips: svc.getDailyTrips(),
      dailyEarnings: svc.getDailyEarnings(),
    },
  });
});

// ─── Shared pooled rides (Modelo A) ─────────────────────────────────────────────

// GET /driver/intercity/pool/fare-cap?origin=&destination=&seats=
// Helper for the publish form: returns the legal cost-share cap and route info.
router.get('/intercity/pool/fare-cap', (req: Request, res: Response): void => {
  const origin = req.query['origin'] as IntercityCity | undefined;
  const destination = req.query['destination'] as IntercityCity | undefined;
  const seats = Number(req.query['seats'] ?? 4);

  if (!origin || !destination) {
    res.status(400).json({ success: false, error: 'origin and destination are required' });
    return;
  }
  const route = getIntercityRoute(origin, destination);
  if (!route) {
    res.status(404).json({ success: false, error: 'No route defined for that city pair' });
    return;
  }
  res.json({
    success: true,
    data: {
      origin,
      destination,
      seats,
      maxFarePerSeat: getMaxFarePerSeat(origin, destination, seats),
      suggestedFarePerSeat: route.suggestedFarePerSeat,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
    },
  });
});

// POST /driver/intercity/pool/publish
router.post('/intercity/pool/publish', (req: Request, res: Response): void => {
  const dto = req.body as Partial<PublishPooledTripDTO>;
  if (
    !dto.origin || !dto.destination || !dto.departureTime ||
    dto.totalSeats === undefined || dto.farePerSeat === undefined || !dto.vehicleDescription
  ) {
    res.status(400).json({
      success: false,
      error: 'origin, destination, departureTime, totalSeats, farePerSeat, vehicleDescription are required',
    });
    return;
  }
  try {
    const trip = publishPooledTrip(req.driverId!, MOCK_DRIVER.name, req.driverPhone ?? MOCK_DRIVER.phone, {
      origin: dto.origin,
      destination: dto.destination,
      departureTime: dto.departureTime,
      totalSeats: dto.totalSeats,
      farePerSeat: dto.farePerSeat,
      vehicleDescription: dto.vehicleDescription,
      notes: dto.notes,
      allowFleet: dto.allowFleet,
    });
    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to publish trip' });
  }
});

// GET /driver/intercity/pool/mine
router.get('/intercity/pool/mine', (req: Request, res: Response): void => {
  res.json({ success: true, data: getDriverPooledTrips(req.driverId!) });
});

// POST /driver/intercity/pool/:id/depart
router.post('/intercity/pool/:id/depart', (req: Request, res: Response): void => {
  const trip = departPooledTrip(req.driverId!, req.params['id']!);
  if (!trip) { res.status(400).json({ success: false, error: 'Trip not found or cannot depart' }); return; }
  res.json({ success: true, data: trip });
});

// POST /driver/intercity/pool/:id/complete
router.post('/intercity/pool/:id/complete', (req: Request, res: Response): void => {
  const trip = completePooledTrip(req.driverId!, req.params['id']!);
  if (!trip) { res.status(400).json({ success: false, error: 'Trip not found or not in progress' }); return; }
  res.json({ success: true, data: trip });
});

// POST /driver/intercity/pool/:id/cancel
router.post('/intercity/pool/:id/cancel', (req: Request, res: Response): void => {
  const trip = cancelPooledTrip(req.driverId!, req.params['id']!);
  if (!trip) { res.status(400).json({ success: false, error: 'Trip not found or cannot be cancelled' }); return; }
  res.json({ success: true, data: trip });
});

export default router;
