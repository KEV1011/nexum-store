import { Router, Request, Response } from 'express';
import { DocumentType } from '@prisma/client';
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
import {
  getDriverProfile,
  updateDriverProfile,
  upsertDriverDocument,
  uploadDriverDocument,
  reviewDriverDocument,
} from '../services/driver-profile.service';
import { getActiveDriverRide, getChatHistory } from '../services/ride-negotiation.service';
import {
  PublishPooledTripDTO,
  IntercityCity,
  UpsertDriverDocumentDTO,
  DriverDocumentType,
} from '../types';
import { documentUpload, fileToUrl, ALLOWED_TYPES } from '../lib/upload';
import { prisma } from '../lib/prisma';
import { registerDriverFcmToken } from '../services/push.service';
import { getSurgeMultiplier } from '../services/surge.service';
import {
  getDriverBalance,
  getDriverPayouts,
  requestPayout,
  PayoutError,
} from '../services/payout.service';
import { getDriverNotifications } from '../services/driver-notification.service';

const router = Router();

router.use(authMiddleware);

// GET /driver/profile — real profile with documents + verification status
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  try {
    res.status(200).json({ success: true, data: await getDriverProfile(driverId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get profile';
    res.status(404).json({ success: false, error: message });
  }
});

// PATCH /driver/profile — edit bio/name/photo/vehicle
router.patch('/profile', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const { fullName, bio, photoUrl, vehicleDescription } = req.body as Record<string, string>;
  try {
    const updated = await updateDriverProfile(driverId, { fullName, bio, photoUrl, vehicleDescription });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update profile';
    res.status(400).json({ success: false, error: message });
  }
});

// POST /driver/profile/photo — sube el avatar (multipart 'file') y lo asigna
router.post(
  '/profile/photo',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const driverId = req.driverId ?? MOCK_DRIVER.id;
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'El avatar debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const updated = await updateDriverProfile(driverId, { photoUrl: fileToUrl(req.file) });
      res.status(201).json({ success: true, data: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar la foto de perfil';
      res.status(500).json({ success: false, error: message });
    }
  },
);

// GET /driver/documents — list all documents for the authenticated driver
router.get('/documents', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  try {
    const profile = await getDriverProfile(driverId);
    res.status(200).json({ success: true, data: profile.documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get documents';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /driver/documents — upload a document file (multipart/form-data)
// Form fields: type (DocumentType), expiresAt? (ISO date string)
router.post(
  '/documents',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const driverId = req.driverId ?? MOCK_DRIVER.id;
    const { type, expiresAt } = req.body as { type?: string; expiresAt?: string };

    if (!type || !ALLOWED_TYPES.includes(type as DocumentType)) {
      res.status(400).json({
        success: false,
        error: `type es requerido. Valores válidos: ${ALLOWED_TYPES.join(', ')}`,
      });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ningún archivo.' });
      return;
    }

    try {
      const fileUrl = fileToUrl(req.file);
      const updated = await uploadDriverDocument(
        driverId,
        type as DocumentType,
        fileUrl,
        expiresAt,
      );
      res.status(201).json({ success: true, data: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar el documento';
      res.status(500).json({ success: false, error: message });
    }
  },
);

// PUT /driver/documents — legacy JSON upload (fileUrl provided by caller)
router.put('/documents', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const dto = req.body as Partial<UpsertDriverDocumentDTO>;
  if (!dto.type || !dto.fileUrl) {
    res.status(400).json({ success: false, error: 'type and fileUrl are required' });
    return;
  }
  try {
    const updated = await upsertDriverDocument(driverId, {
      type: dto.type,
      fileUrl: dto.fileUrl,
      expiresAt: dto.expiresAt,
    });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload document';
    res.status(400).json({ success: false, error: message });
  }
});

// POST /driver/documents/:type/review — demo review action (approve/reject)
router.post('/documents/:type/review', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const { approve, rejectionReason } = req.body as { approve?: boolean; rejectionReason?: string };
  try {
    const updated = await reviewDriverDocument(
      driverId,
      req.params['type'] as DriverDocumentType,
      approve === true,
      rejectionReason,
    );
    if (!updated) { res.status(404).json({ success: false, error: 'Document not found' }); return; }
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to review document';
    res.status(400).json({ success: false, error: message });
  }
});

// GET /driver/rides/active — the driver's matched ride, if any
router.get('/rides/active', (req: Request, res: Response): void => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  res.status(200).json({ success: true, data: getActiveDriverRide(driverId) });
});

// GET /driver/rides/:id/chat
router.get('/rides/:id/chat', (req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: getChatHistory(req.params['id']!) });
});

// GET /driver/status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const svc = getTripService();
  const [dailyTrips, dailyEarnings] = await Promise.all([
    svc.getDailyTrips(driverId),
    svc.getDailyEarnings(driverId),
  ]);
  res.status(200).json({
    success: true,
    data: { status: svc.getDriverStatus(), dailyTrips, dailyEarnings },
  });
});

// PUT /driver/status  – only allows online/offline
router.put('/status', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status?: string };
  const driverId = req.driverId ?? MOCK_DRIVER.id;

  if (!status || (status !== 'online' && status !== 'offline')) {
    res.status(400).json({ success: false, error: 'status must be "online" or "offline"' });
    return;
  }

  const svc = getTripService();
  await svc.setDriverStatus(status as 'online' | 'offline', driverId);

  const [dailyTrips, dailyEarnings] = await Promise.all([
    svc.getDailyTrips(driverId),
    svc.getDailyEarnings(driverId),
  ]);
  res.status(200).json({
    success: true,
    data: { status, dailyTrips, dailyEarnings },
  });
});

// ─── Push notifications ────────────────────────────────────────────────────────

// PUT /driver/fcm-token { token } — registra el token del dispositivo para push
router.put('/fcm-token', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const token = (req.body as { token?: unknown }).token;
  if (typeof token !== 'string' || token.length === 0) {
    res.status(400).json({ success: false, error: 'token (string) is required' });
    return;
  }
  await registerDriverFcmToken(driverId, token);
  res.json({ success: true, data: { registered: true } });
});

// ─── Intercity availability (matching real) ────────────────────────────────────

// GET /driver/intercity/availability — ¿recibe solicitudes intermunicipales?
router.get('/intercity/availability', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { intercityEnabled: true },
  });
  res.json({ success: true, data: { enabled: driver?.intercityEnabled ?? false } });
});

// PUT /driver/intercity/availability { enabled: boolean }
router.put('/intercity/availability', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const enabled = (req.body as { enabled?: unknown }).enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, error: 'enabled (boolean) is required' });
    return;
  }
  await prisma.driver.update({
    where: { id: driverId },
    data: { intercityEnabled: enabled },
  });
  res.json({ success: true, data: { enabled } });
});

// ─── Preferencias de servicio ────────────────────────────────────────────────
// Qué tipos de solicitud recibe el conductor. El matching las respeta al
// elegir candidatos (viajes/mandados/pedidos); intercity va aparte pero se
// incluye en la lectura para pintar una sola hoja de preferencias en la app.

// GET /driver/service-prefs
router.get('/service-prefs', async (req: Request, res: Response): Promise<void> => {
  const driver = await prisma.driver.findUnique({
    where: { id: req.driverId! },
    select: {
      acceptsTrips: true,
      acceptsErrands: true,
      acceptsOrders: true,
      intercityEnabled: true,
    },
  });
  if (!driver) {
    res.status(404).json({ success: false, error: 'Conductor no encontrado' });
    return;
  }
  res.json({
    success: true,
    data: {
      trips: driver.acceptsTrips,
      errands: driver.acceptsErrands,
      orders: driver.acceptsOrders,
      intercity: driver.intercityEnabled,
    },
  });
});

// PUT /driver/service-prefs { trips?, errands?, orders?, intercity? }
router.put('/service-prefs', async (req: Request, res: Response): Promise<void> => {
  const b = req.body as {
    trips?: unknown;
    errands?: unknown;
    orders?: unknown;
    intercity?: unknown;
  };
  const data: Record<string, boolean> = {};
  if (typeof b.trips === 'boolean') data['acceptsTrips'] = b.trips;
  if (typeof b.errands === 'boolean') data['acceptsErrands'] = b.errands;
  if (typeof b.orders === 'boolean') data['acceptsOrders'] = b.orders;
  if (typeof b.intercity === 'boolean') data['intercityEnabled'] = b.intercity;
  if (Object.keys(data).length === 0) {
    res.status(400).json({
      success: false,
      error: 'Envía al menos una preferencia booleana (trips, errands, orders, intercity).',
    });
    return;
  }
  const updated = await prisma.driver.update({
    where: { id: req.driverId! },
    data,
    select: {
      acceptsTrips: true,
      acceptsErrands: true,
      acceptsOrders: true,
      intercityEnabled: true,
    },
  });
  res.json({
    success: true,
    data: {
      trips: updated.acceptsTrips,
      errands: updated.acceptsErrands,
      orders: updated.acceptsOrders,
      intercity: updated.intercityEnabled,
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
router.post('/intercity/pool/publish', async (req: Request, res: Response): Promise<void> => {
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
    // Identidad REAL del conductor en la publicación (antes usaba MOCK_DRIVER).
    const me = await prisma.driver.findUnique({
      where: { id: req.driverId! },
      select: { name: true, phone: true },
    });
    const trip = await publishPooledTrip(
      req.driverId!,
      me?.name ?? 'Conductor Nexum',
      me?.phone ?? req.driverPhone ?? '',
      {
        origin: dto.origin,
        destination: dto.destination,
        departureTime: dto.departureTime,
        totalSeats: dto.totalSeats,
        farePerSeat: dto.farePerSeat,
        vehicleDescription: dto.vehicleDescription,
        notes: dto.notes,
        allowFleet: dto.allowFleet,
      },
    );
    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Failed to publish trip' });
  }
});

// GET /driver/intercity/pool/mine
router.get('/intercity/pool/mine', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getDriverPooledTrips(req.driverId!) });
});

// POST /driver/intercity/pool/:id/depart
router.post('/intercity/pool/:id/depart', async (req: Request, res: Response): Promise<void> => {
  const trip = await departPooledTrip(req.driverId!, req.params['id']!);
  if (!trip) { res.status(400).json({ success: false, error: 'El viaje no existe, no es tuyo o ya no está abierto para iniciar.' }); return; }
  res.json({ success: true, data: trip });
});

// POST /driver/intercity/pool/:id/complete
router.post('/intercity/pool/:id/complete', async (req: Request, res: Response): Promise<void> => {
  const trip = await completePooledTrip(req.driverId!, req.params['id']!);
  if (!trip) { res.status(400).json({ success: false, error: 'El viaje no existe o aún no está en camino.' }); return; }
  res.json({ success: true, data: trip });
});

// POST /driver/intercity/pool/:id/cancel
router.post('/intercity/pool/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const trip = await cancelPooledTrip(req.driverId!, req.params['id']!);
  if (!trip) { res.status(400).json({ success: false, error: 'El viaje no existe o ya no se puede cancelar.' }); return; }
  res.json({ success: true, data: trip });
});

// (Los handlers de /intercity/availability están definidos arriba; este bloque
// duplicado se eliminó — Express solo usaba la primera definición.)

// ─── Zonas de demanda (surge real por zona) ───────────────────────────────────

// Centroides de las zonas operativas de Pamplona usados para el mapa de
// demanda del conductor. El multiplicador se calcula con el surge real
// (viajes SEARCHING vs conductores ONLINE vía PostGIS).
const DEMAND_ZONES = [
  { id: 'centro', name: 'Centro histórico', lat: 7.3754, lng: -72.6486 },
  { id: 'unipamplona', name: 'Zona universitaria', lat: 7.3889, lng: -72.6445 },
  { id: 'terminal', name: 'Terminal de transportes', lat: 7.3698, lng: -72.6521 },
  { id: 'hospital', name: 'Hospital San Juan de Dios', lat: 7.3821, lng: -72.6512 },
  { id: 'esmeralda', name: 'Barrio La Esmeralda', lat: 7.3812, lng: -72.6423 },
] as const;

// GET /driver/demand-zones — demanda/oferta y multiplicador por zona.
router.get('/demand-zones', async (_req: Request, res: Response): Promise<void> => {
  try {
    const zones = await Promise.all(
      DEMAND_ZONES.map(async (z) => {
        const surge = await getSurgeMultiplier(z.lat, z.lng);
        return {
          id: z.id,
          name: z.name,
          lat: z.lat,
          lng: z.lng,
          multiplier: surge.multiplier,
          demand: surge.demand,
          supply: surge.supply,
          isSurge: surge.isSurge,
        };
      }),
    );
    // Zonas calientes primero.
    zones.sort((a, b) => b.multiplier - a.multiplier || b.demand - a.demand);
    res.json({ success: true, data: zones });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Notificaciones (feed derivado de viajes, pagos y documentos reales) ──────

// GET /driver/notifications — feed del conductor armado desde datos reales.
router.get('/notifications', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await getDriverNotifications(driverId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Payouts (retiros del conductor) ──────────────────────────────────────────

// GET /driver/payouts/balance — saldo disponible + datos bancarios.
router.get('/payouts/balance', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await getDriverBalance(driverId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// GET /driver/payouts — historial de retiros del conductor.
router.get('/payouts', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await getDriverPayouts(driverId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /driver/payouts { amount, method?, accountInfo?, notes? } — solicita un retiro.
router.post('/payouts', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  const b = req.body as { amount?: number; method?: string; accountInfo?: string; notes?: string };
  if (typeof b.amount !== 'number') {
    res.status(400).json({ success: false, error: 'amount (número) es requerido' });
    return;
  }
  try {
    const payout = await requestPayout(driverId, {
      amount: b.amount,
      method: typeof b.method === 'string' ? b.method : undefined,
      accountInfo: typeof b.accountInfo === 'string' ? b.accountInfo : undefined,
      notes: typeof b.notes === 'string' ? b.notes : undefined,
    });
    res.status(201).json({ success: true, data: payout });
  } catch (err) {
    const status = err instanceof PayoutError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

export default router;
