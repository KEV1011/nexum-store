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
import { getDriverProStatus } from '../services/pro.service';
import {
  getDriverKyc,
  setDriverSelfie,
  submitDriverKyc,
  isDriverCleared,
  kycEnforced,
  KycError,
} from '../services/kyc.service';
import {
  docKillSwitchEnforced,
  getDriverCompliance,
} from '../services/document-expiry.service';
import {
  listDriverFreights,
  updateDriverFreightStatus,
  listDriverAvailableFreights,
  takeDriverFreight,
  FreightError,
} from '../services/freight.service';
import { getTripChat, postTripChatPhoto, TripChatError } from '../services/trip-chat.service';
import {
  createTicket,
  listTicketsFor,
  getTicketDetail,
  addRequesterMessage,
  SupportError,
} from '../services/support.service';

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

// ── KYC / verificación de identidad ──────────────────────────────────────────

// GET /driver/kyc — estado de la verificación de identidad del conductor.
router.get('/kyc', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await getDriverKyc(driverId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /driver/kyc/selfie — sube la selfie de liveness (multipart 'file').
router.post(
  '/kyc/selfie',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, error: err.message }); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const driverId = req.driverId;
    if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
    if (!req.file) { res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' }); return; }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La selfie debe ser una imagen.' }); return;
    }
    try {
      await setDriverSelfie(driverId, fileToUrl(req.file));
      res.status(201).json({ success: true, data: await getDriverKyc(driverId) });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
    }
  },
);

// POST /driver/kyc/submit — envía la verificación de identidad.
router.post('/kyc/submit', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await submitDriverKyc(driverId) });
  } catch (err) {
    const status = err instanceof KycError ? 422 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

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

  // Gating de habilitación: SOLO cuando KYC_ENFORCE=true se bloquea el ponerse
  // EN LÍNEA a quien no esté "cleared" (documentos aprobados + identidad
  // VERIFIED). Con KYC_ENFORCE=false el comportamiento es como antes: cualquiera
  // se conecta y el matching ya filtra a los no verificados (nunca les ofrece
  // viajes) — así el gate no bloquea de golpe a los conductores existentes.
  if (
    status === 'online' &&
    req.driverId &&
    kycEnforced() &&
    !(await isDriverCleared(req.driverId))
  ) {
    res.status(403).json({
      success: false,
      error: 'Debes completar la verificación de identidad y documentos antes de conectarte.',
      code: 'driver_not_cleared',
    });
    return;
  }

  // Kill-switch documental: con DOC_KILL_SWITCH_ENFORCE=true, un conductor con
  // documentos obligatorios VENCIDOS (BLOCKED) no puede ponerse en línea.
  if (status === 'online' && req.driverId && docKillSwitchEnforced()) {
    const compliance = await getDriverCompliance(req.driverId);
    if (compliance.status === 'BLOCKED') {
      res.status(403).json({
        success: false,
        error: `Tu cuenta está suspendida: ${compliance.reason ?? 'documentos vencidos'}. Renueva tus documentos en Verificación para volver a conectarte.`,
        code: 'documents_expired',
      });
      return;
    }
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
      me?.name ?? 'Conductor ZIPA',
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

// ── ZIPA Pro: nivel del conductor con datos reales ──────────────────────────

// GET /driver/pro-status — nivel, progreso al siguiente y escalera completa.
router.get('/pro-status', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await getDriverProStatus(driverId) });
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

// GET /driver/freights — fletes de carga asignados por la flota a este conductor
router.get('/freights', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  res.json({ success: true, data: await listDriverFreights(driverId) });
});

// GET /driver/freight/available — fletes abiertos que puede tomar (su flota)
router.get('/freight/available', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  res.json({ success: true, data: await listDriverAvailableFreights(driverId) });
});

// POST /driver/freight/:id/take { vehicleId } — el conductor toma el flete
router.post('/freight/:id/take', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const { vehicleId } = req.body as { vehicleId?: string };
  if (!vehicleId) { res.status(400).json({ success: false, error: 'vehicleId es requerido' }); return; }
  try {
    const freight = await takeDriverFreight(driverId, req.params['id']!, vehicleId);
    res.json({ success: true, data: freight });
  } catch (err) {
    const status = err instanceof FreightError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo tomar el flete' });
  }
});

// POST /driver/freight/:id/status { status: 'in_progress' | 'completed' } —
// el conductor asignado inicia la ruta o confirma la entrega desde su app
// (misma liquidación y avisos que el portal de la flota).
router.post('/freight/:id/status', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const status = (req.body as { status?: string }).status;
  if (status !== 'in_progress' && status !== 'completed') {
    res.status(400).json({ success: false, error: "status debe ser 'in_progress' o 'completed'" });
    return;
  }
  try {
    const freight = await updateDriverFreightStatus(driverId, req.params['id']!, status);
    res.json({ success: true, data: freight });
  } catch (err) {
    const st = err instanceof FreightError ? 400 : 500;
    res.status(st).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo actualizar el flete' });
  }
});

// ─── Prueba de recogida/entrega ────────────────────────────────────────────────

// POST /driver/proof/:kind/:id — sube la foto de prueba (multipart 'file' +
// campo 'phase' pickup|delivery) de un viaje, pedido o mandado del conductor.
// La prueba queda visible para el cliente y el negocio (pickupPhotoUrl /
// deliveryPhotoUrl; en mandados la recogida es proofPhotoUrl).
router.post(
  '/proof/:kind/:id',
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
    const driverId = req.driverId;
    if (!driverId) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const kind = req.params['kind'];
    const id = req.params['id']!;
    const phase = (req.body as { phase?: string }).phase === 'pickup' ? 'pickup' : 'delivery';
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La prueba debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    const url = fileToUrl(req.file);
    try {
      // updateMany con driverId en el where = verificación de pertenencia
      // y escritura en una sola operación.
      let count = 0;
      if (kind === 'trip') {
        const r = await prisma.trip.updateMany({
          where: { id, driverId },
          data: phase === 'pickup' ? { pickupPhotoUrl: url } : { deliveryPhotoUrl: url },
        });
        count = r.count;
      } else if (kind === 'order') {
        const r = await prisma.order.updateMany({
          where: { id, driverId },
          data: phase === 'pickup' ? { pickupPhotoUrl: url } : { deliveryPhotoUrl: url },
        });
        count = r.count;
      } else if (kind === 'errand') {
        const r = await prisma.errand.updateMany({
          where: { id, driverId },
          data: phase === 'pickup' ? { proofPhotoUrl: url } : { deliveryPhotoUrl: url },
        });
        count = r.count;
      } else {
        res.status(400).json({ success: false, error: 'kind debe ser trip, order o errand.' });
        return;
      }
      if (count === 0) {
        res.status(404).json({ success: false, error: 'El servicio no existe o no está asignado a ti.' });
        return;
      }
      res.status(201).json({ success: true, data: { url, phase } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al guardar la prueba';
      res.status(500).json({ success: false, error: message });
    }
  },
);

// ─── Chat del viaje (conductor ↔ pasajero) ─────────────────────────────────────

// GET /driver/trips/:id/chat — historial del chat del viaje.
router.get('/trips/:id/chat', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await getTripChat(req.params['id']!, driverId) });
  } catch (err) {
    const status = err instanceof TripChatError ? 403 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /driver/trips/:id/chat/photo — envía una foto en el chat del viaje.
router.post(
  '/trips/:id/chat/photo',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, error: err.message }); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const driverId = req.driverId;
    if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
    if (!req.file) { res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' }); return; }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'El archivo debe ser una imagen.' }); return;
    }
    try {
      const data = await postTripChatPhoto(req.params['id']!, 'driver', driverId, fileToUrl(req.file));
      res.status(201).json({ success: true, data });
    } catch (err) {
      const status = err instanceof TripChatError ? 403 : 500;
      res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
    }
  },
);

// ─── Soporte con tickets ────────────────────────────────────────────────────────

router.get('/support/tickets', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await listTicketsFor('driver', driverId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.post('/support/tickets', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  const { subject, body, category } = req.body as { subject?: string; body?: string; category?: string };
  if (!subject || !body) { res.status(400).json({ success: false, error: 'subject y body son requeridos' }); return; }
  try {
    const driver = await prisma.driver.findUnique({ where: { id: driverId }, select: { name: true } });
    const ticket = await createTicket('driver', driverId, {
      subject, body, category, requesterName: driver?.name ?? null,
    });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    const status = err instanceof SupportError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.get('/support/tickets/:id', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    res.json({ success: true, data: await getTicketDetail(req.params['id']!, 'driver', driverId) });
  } catch (err) {
    const status = err instanceof SupportError ? 404 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.post('/support/tickets/:id/messages', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  const { body } = req.body as { body?: string };
  if (!body) { res.status(400).json({ success: false, error: 'body es requerido' }); return; }
  try {
    res.json({ success: true, data: await addRequesterMessage(req.params['id']!, 'driver', driverId, body) });
  } catch (err) {
    const status = err instanceof SupportError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

export default router;
