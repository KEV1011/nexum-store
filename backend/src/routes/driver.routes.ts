import { Router, Request, Response } from 'express';
import { DocumentType } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { getMaxFarePerSeat, getIntercityRoute } from '../config/constants';
import { getTripService } from '../services/trip.service';
import { declararEtaDeMandado } from '../services/errand.service';
import {
  publishPooledTrip,
  getDriverPooledTrips,
  departPooledTrip,
  completePooledTrip,
  cancelPooledTrip,
  publicarPuestoUrbano,
  topeDelPuestoUrbano,
  listarPuestosSinConductor,
  tomarPuestoDePasajero,
  plazaDelPasajero,
  PooledTripError,
} from '../services/intercity-pool.service';
import {
  getDriverProfile,
  updateDriverProfile,
  upsertDriverDocument,
  uploadDriverDocument,
} from '../services/driver-profile.service';
import { getActiveDriverRide, getChatHistory } from '../services/ride-negotiation.service';
import {
  PublishPooledTripDTO,
  PublishUrbanSeatDTO,
  IntercityCity,
  UpsertDriverDocumentDTO,
} from '../types';
import { documentUpload, fileToUrl, ALLOWED_TYPES } from '../lib/upload';
import {
  ManifestError,
  listDriverManifests,
  getDriverManifest,
  receiveManifest,
  setManifestReceiptPhoto,
  type ReceiveManifestDTO,
} from '../services/manifest.service';
import { CustodyPinError } from '../lib/custody-pin';
import {
  driverUpdateTripStatus,
  rateTripPassenger,
  TripDriverError,
} from '../services/client.service';
import type { ClientTripStatus } from '../types';
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
  KycError,
} from '../services/kyc.service';
import { motivoParaNoConectar } from '../services/driver-online-guard';
import {
  sanearCostos,
  SHARED_RIDE_COST_PER_KM,
  SHARED_RIDE_TOLL_PER_100KM,
} from '../config/constants';
import {
  listDriverFreights,
  updateDriverFreightStatus,
  listDriverAvailableFreights,
  takeDriverFreight,
  FreightError,
  addFreightEvent,
  listFreightEventsForDriver,
} from '../services/freight.service';
import {
  listarReservasLibres,
  listarMisReservas,
  apartarReserva,
  soltarReserva,
  ReservaError,
} from '../services/reservas.service';
import { getTripChat, postTripChatPhoto, TripChatError } from '../services/trip-chat.service';
import {
  AccountDeletionError,
  borrarCuentaConductor,
  motivoBloqueoConductor,
} from '../services/account-deletion.service';
import { crearReporte, bloquear, desbloquear, listarBloqueos } from '../services/moderacion.service';
import { ReporteInvalido, motivosParaApps } from '../lib/reportes';
import {
  createTicket,
  listTicketsFor,
  getTicketDetail,
  addRequesterMessage,
  SupportError,
} from '../services/support.service';
import { abordarConTiquete } from '../services/intercity-pool.service';
import { faseDePrueba, nombreDeFirmante } from '../lib/prueba-de-entrega';
import {
  subirDocumentoEnvio, listarDocumentosEnvio, borrarDocumentoEnvio,
  DocumentoEnvioInvalido,
} from '../services/documentos-envio.service';

const router = Router();

/**
 * «Conductor no encontrado» no es un fallo del servidor: es un 404.
 *
 * El token que emite `/auth/verify-otp` a un teléfono todavía sin registrar
 * lleva el teléfono como `driverId` (es la sesión intermedia que necesita
 * `/auth/register`). Con ese token, cualquier consulta de perfil no encuentra
 * fila — y devolverlo como 500 le dice a la app «el servidor está roto»
 * cuando lo que pasa es que esa cuenta aún no existe. La app no puede
 * distinguir un caso del otro y acaba mostrando un error genérico.
 */
function _estadoDeError(err: unknown): number {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('no encontrado') || msg.includes('not found') ? 404 : 500;
}

router.use(authMiddleware);

// Cinturón sobre el tirante. `authMiddleware` ya responde 401 sin token válido,
// así que `req.driverId` está siempre puesto de aquí para abajo y por eso las
// rutas usan `req.driverId!`.
//
// Antes escribían `req.driverId ?? MOCK_DRIVER.id`, y MOCK_DRIVER.id es un
// conductor REAL de los datos de prueba: si alguna ruta acababa quedando fuera
// del middleware, no fallaba — operaba sobre la cuenta de ese conductor. Un
// respaldo silencioso que cruza cuentas es peor que un error.
router.use((req: Request, res: Response, next) => {
  if (!req.driverId) {
    res.status(401).json({ success: false, error: 'No autenticado' });
    return;
  }
  next();
});

// GET /driver/profile — real profile with documents + verification status
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  try {
    res.status(200).json({ success: true, data: await getDriverProfile(driverId) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get profile';
    res.status(404).json({ success: false, error: message });
  }
});

// PATCH /driver/profile — edit bio/name/photo/vehicle
router.patch('/profile', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  const { fullName, bio, photoUrl, vehicleDescription } = req.body as Record<string, string>;
  try {
    const updated = await updateDriverProfile(driverId, { fullName, bio, photoUrl, vehicleDescription });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update profile';
    res.status(400).json({ success: false, error: message });
  }
});

// ── Eliminar la cuenta ────────────────────────────────────────────────────────
// Exigido por App Store y Play. Se anonimiza en vez de borrarse porque los
// viajes liquidados del conductor sostienen la liquidación de su empresa, las
// cuentas de cobro y los remitos firmados: no son solo datos suyos.

// GET /driver/account/deletion — si se puede eliminar ahora, y si no, por qué.
router.get('/account/deletion', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  try {
    const bloqueo = await motivoBloqueoConductor(driverId);
    res.json({ success: true, data: { puedeEliminar: bloqueo === null, motivo: bloqueo } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// ─── Moderación: reportar y bloquear ─────────────────────────────────────────
//
// El conductor también publica y recibe contenido: chatea con el pasajero y
// aparece calificado con comentario. Apple 1.2 pide reporte y bloqueo en las
// DOS direcciones, no solo en la app del cliente.

router.get('/reports/reasons', (_req: Request, res: Response): void => {
  res.json({ success: true, data: motivosParaApps() });
});

router.post('/reports', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await crearReporte('driver', req.driverId!, req.body ?? {}) });
  } catch (err) {
    const status = err instanceof ReporteInvalido ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo enviar el reporte',
    });
  }
});

router.get('/blocks', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await listarBloqueos('driver', req.driverId!) });
  } catch {
    res.status(500).json({ success: false, error: 'No pudimos cargar tu lista.' });
  }
});

router.post('/blocks', async (req: Request, res: Response): Promise<void> => {
  try {
    await bloquear('driver', req.driverId!, req.body ?? {});
    res.json({ success: true, data: { ok: true } });
  } catch (err) {
    const status = err instanceof ReporteInvalido ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo bloquear',
    });
  }
});

router.delete('/blocks/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await desbloquear('driver', req.driverId!, String(req.params['id']));
    res.json({ success: true, data: { ok: true } });
  } catch {
    res.status(500).json({ success: false, error: 'No se pudo desbloquear.' });
  }
});

// DELETE /driver/account — anonimiza la cuenta. Irreversible.
router.delete('/account', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  try {
    res.json({ success: true, data: await borrarCuentaConductor(driverId) });
  } catch (err) {
    const status = err instanceof AccountDeletionError ? 409 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo eliminar la cuenta',
    });
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
    const driverId = req.driverId!;
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
    res.status(_estadoDeError(err)).json({
      success: false, error: err instanceof Error ? err.message : 'Error',
    });
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
  const driverId = req.driverId!;
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
    const driverId = req.driverId!;
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
  const driverId = req.driverId!;
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

// RUTA RETIRADA: POST /driver/documents/:type/review
//
// Estaba marcada como "demo review action (approve/reject)" y ninguna pantalla
// la llamaba, pero seguía montada y autenticada con el JWT DEL PROPIO
// CONDUCTOR: cualquiera podía aprobarse sus propios papeles con
// {approve: true}. `reviewDriverDocument` marca el documento APPROVED y
// sincroniza `Driver.isVerified`, así que bastaba una petición para empezar a
// recibir pasajeros sin que un administrador hubiera visto la licencia ni el
// SOAT — y de paso desactivaba el kill-switch documental.
//
// La revisión vive donde le corresponde: /admin/verifications/:docId/approve
// y /reject, detrás de requireAdmin.

// GET /driver/rides/active — the driver's matched ride, if any
router.get('/rides/active', (req: Request, res: Response): void => {
  const driverId = req.driverId!;
  res.status(200).json({ success: true, data: getActiveDriverRide(driverId) });
});

// GET /driver/rides/:id/chat
router.get('/rides/:id/chat', (req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: getChatHistory(req.params['id']!) });
});

// GET /driver/status
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
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
  const driverId = req.driverId!;

  if (!status || (status !== 'online' && status !== 'offline')) {
    res.status(400).json({ success: false, error: 'status must be "online" or "offline"' });
    return;
  }

  // Puede conectarse o no lo decide `motivoParaNoConectar`, compartido con el
  // WebSocket — que es por donde el conductor se pone en línea de verdad.
  if (status === 'online' && req.driverId) {
    const motivo = await motivoParaNoConectar(req.driverId);
    if (motivo) {
      res.status(403).json({ success: false, ...motivo });
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
      acceptsChained: true,
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
      chained: driver.acceptsChained,
      intercity: driver.intercityEnabled,
    },
  });
});

// PUT /driver/service-prefs { trips?, errands?, orders?, chained?, intercity? }
router.put('/service-prefs', async (req: Request, res: Response): Promise<void> => {
  const b = req.body as {
    trips?: unknown;
    errands?: unknown;
    orders?: unknown;
    chained?: unknown;
    intercity?: unknown;
  };
  const data: Record<string, boolean> = {};
  if (typeof b.trips === 'boolean') data['acceptsTrips'] = b.trips;
  if (typeof b.errands === 'boolean') data['acceptsErrands'] = b.errands;
  if (typeof b.orders === 'boolean') data['acceptsOrders'] = b.orders;
  if (typeof b.chained === 'boolean') data['acceptsChained'] = b.chained;
  if (typeof b.intercity === 'boolean') data['intercityEnabled'] = b.intercity;
  if (Object.keys(data).length === 0) {
    res.status(400).json({
      success: false,
      error: 'Envía al menos una preferencia booleana (trips, errands, orders, chained, intercity).',
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
      acceptsChained: true,
      intercityEnabled: true,
    },
  });
  res.json({
    success: true,
    data: {
      trips: updated.acceptsTrips,
      errands: updated.acceptsErrands,
      orders: updated.acceptsOrders,
      chained: updated.acceptsChained,
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
  // El conductor puede declarar SUS costos del trayecto; si no los manda, se
  // usan los promedios de siempre.
  const costos = sanearCostos({
    costPerKm: req.query['costPerKm'],
    tollTotal: req.query['tollTotal'],
  });

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
      maxFarePerSeat: getMaxFarePerSeat(origin, destination, seats, costos),
      suggestedFarePerSeat: route.suggestedFarePerSeat,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      // Se devuelve lo que se usó para el cálculo: así la app puede prellenar
      // los campos y el conductor ve de dónde sale la cifra.
      costPerKm: costos.costPerKm ?? SHARED_RIDE_COST_PER_KM,
      tollTotal: Math.round(
        costos.tollTotal ?? (route.distanceKm / 100) * SHARED_RIDE_TOLL_PER_100KM,
      ),
      costosDeclarados: costos.costPerKm != null || costos.tollTotal != null,
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

// ─── Puesto de taxi urbano ────────────────────────────────────────────────────

// GET /driver/pool/urbano/tope?ciudad=&origen=&destino=&puestos=
// Lo que el formulario necesita para proponer un precio: cuánto costaría la
// carrera sola, el tope por puesto y la sugerencia. Sin esto el conductor
// escribiría una cifra a ciegas y la publicación se le rechazaría después.
router.get('/pool/urbano/tope', async (req: Request, res: Response): Promise<void> => {
  const ciudad = String(req.query['ciudad'] ?? '').trim();
  const origen = String(req.query['origen'] ?? '').trim();
  const destino = String(req.query['destino'] ?? '').trim();
  const puestos = Number(req.query['puestos'] ?? 4);
  if (!ciudad || !origen || !destino) {
    res.status(400).json({ success: false, error: 'ciudad, origen y destino son obligatorios' });
    return;
  }
  res.json({
    success: true,
    data: await topeDelPuestoUrbano({
      ciudad, origenTexto: origen, destinoTexto: destino, puestos,
    }),
  });
});

// POST /driver/pool/urbano/publish
router.post('/pool/urbano/publish', async (req: Request, res: Response): Promise<void> => {
  const dto = req.body as Partial<PublishUrbanSeatDTO>;
  if (
    !dto.city || !dto.originLabel || !dto.destLabel || !dto.departureTime ||
    dto.totalSeats === undefined || dto.farePerSeat === undefined || !dto.vehicleDescription
  ) {
    res.status(400).json({
      success: false,
      error: 'city, originLabel, destLabel, departureTime, totalSeats, farePerSeat y vehicleDescription son obligatorios',
    });
    return;
  }
  try {
    const me = await prisma.driver.findUnique({
      where: { id: req.driverId! },
      select: { name: true, phone: true, operatorId: true },
    });
    const trip = await publicarPuestoUrbano(
      req.driverId!,
      me?.name ?? 'Conductor ZIPA',
      me?.phone ?? req.driverPhone ?? '',
      dto as PublishUrbanSeatDTO,
      // Si conduce para una empresa, la salida queda sellada con ella: es la
      // misma regla que ya sigue cualquier otro servicio suyo.
      me?.operatorId ? { operatorId: me.operatorId } : undefined,
    );
    res.status(201).json({ success: true, data: trip });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo publicar el viaje por puestos',
    });
  }
});

// GET /driver/pool/urbano/sin-conductor — el tablero de viajes que armaron
// PASAJEROS y que todavía no tiene nadie.
//
// La plaza sale del último latido del conductor: es la misma con la que el
// despacho lo cuenta, y pedírsela a la app abriría la puerta a mirar el
// tablero de otra ciudad.
router.get('/pool/urbano/sin-conductor', async (req: Request, res: Response): Promise<void> => {
  const me = await prisma.driver.findUnique({
    where: { id: req.driverId! },
    select: { citySlug: true, lastLat: true, lastLng: true },
  });
  let ciudad = me?.citySlug ?? '';
  if (!ciudad && me?.lastLat != null && me.lastLng != null) {
    const plaza = await plazaDelPasajero(me.lastLat, me.lastLng);
    ciudad = plaza?.slug ?? '';
  }
  if (!ciudad) {
    // Sin plaza no se devuelve una lista vacía a secas: se leería como «no hay
    // viajes» cuando lo que falta es saber dónde está.
    res.json({
      success: true,
      data: {
        city: null,
        trips: [],
        aviso: 'Conéctate para que sepamos en qué ciudad estás y puedas ver los viajes de tu zona.',
      },
    });
    return;
  }
  const horas = Number(req.query['horas']);
  const trips = await listarPuestosSinConductor(
    ciudad,
    Number.isFinite(horas) && horas > 0 ? horas : 24,
  );
  res.json({ success: true, data: { city: ciudad, trips } });
});

// POST /driver/pool/urbano/:id/tomar
router.post('/pool/urbano/:id/tomar', async (req: Request, res: Response): Promise<void> => {
  try {
    const trip = await tomarPuestoDePasajero(req.driverId!, req.params['id']!);
    res.json({ success: true, data: trip });
  } catch (err) {
    const status = err instanceof PooledTripError ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo tomar el viaje',
    });
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
    res.status(_estadoDeError(err)).json({
      success: false, error: err instanceof Error ? err.message : 'Error',
    });
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

// ── Reservas (viajes programados que el conductor aparta con antelación) ─────
//
// El tablero: el pasajero reservó para mañana a las 6:00 y aquí el conductor lo
// ve, lo aparta y llega a casa con la mañana cuadrada. Ver `reservas.service`
// para las reglas (toma atómica, tope por conductor y liberación si no aparece).

// GET /driver/reservas — reservas libres que puede atender su vehículo
router.get('/reservas', async (req: Request, res: Response): Promise<void> => {
  try {
    const { reservas, aviso } = await listarReservasLibres(req.driverId!);
    res.json({ success: true, data: reservas, ...(aviso ? { aviso } : {}) });
  } catch (err) {
    const status = err instanceof ReservaError ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos cargar las reservas',
    });
  }
});

// GET /driver/reservas/mias — las que ya apartó, con los datos del pasajero
router.get('/reservas/mias', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listarMisReservas(req.driverId!) });
});

// POST /driver/reservas/:id/apartar — se compromete a esa reserva
router.post('/reservas/:id/apartar', async (req: Request, res: Response): Promise<void> => {
  try {
    const reserva = await apartarReserva(req.driverId!, req.params['id']!);
    res.json({ success: true, data: reserva });
  } catch (err) {
    // 409 y no 400 cuando otro llegó antes: la app lo usa para recargar el
    // tablero en vez de solo enseñar el error.
    const conflicto =
      err instanceof ReservaError && /tomó esa reserva primero/.test(err.message);
    const status = conflicto ? 409 : err instanceof ReservaError ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos apartar la reserva',
    });
  }
});

// POST /driver/reservas/:id/soltar — la devuelve al tablero
router.post('/reservas/:id/soltar', async (req: Request, res: Response): Promise<void> => {
  try {
    await soltarReserva(req.driverId!, req.params['id']!);
    res.json({ success: true });
  } catch (err) {
    const status = err instanceof ReservaError ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos soltar la reserva',
    });
  }
});

// GET /driver/freights — fletes de carga asignados por la flota a este conductor
router.get('/freights', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  res.json({ success: true, data: await listDriverFreights(driverId) });
});

// GET /driver/freight/available — fletes abiertos que puede tomar (su flota)
router.get('/freight/available', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  res.json({ success: true, data: await listDriverAvailableFreights(driverId) });
});

// POST /driver/freight/:id/take { vehicleId } — el conductor toma el flete
router.post('/freight/:id/take', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
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
  const driverId = req.driverId!;
  const { status, pin } = req.body as { status?: string; pin?: string };
  if (status !== 'in_progress' && status !== 'completed') {
    res.status(400).json({ success: false, error: "status debe ser 'in_progress' o 'completed'" });
    return;
  }
  try {
    const freight = await updateDriverFreightStatus(driverId, req.params['id']!, status, pin);
    res.json({ success: true, data: freight });
  } catch (err) {
    // El PIN inválido es un 400 con mensaje en español para mostrar tal cual.
    const st = err instanceof FreightError || err instanceof CustodyPinError ? 400 : 500;
    res.status(st).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo actualizar el flete' });
  }
});

// ─── Trazabilidad del flete: tanqueos, paradas y notas en ruta ────────────────

// POST /driver/freight/:id/events — registra un evento del flete (multipart
// opcional 'photo' con la factura/recibo; campos como form-data o JSON).
router.post(
  '/freight/:id/events',
  (req: Request, res: Response, next) => {
    documentUpload.single('photo')(req, res, (err) => {
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
      res.status(401).json({ success: false, error: 'No autenticado' });
      return;
    }
    if (req.file && !req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La foto debe ser una imagen.' });
      return;
    }
    const b = req.body as Record<string, string | undefined>;
    const num = (v?: string): number | undefined => {
      const n = v !== undefined ? Number(v) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    try {
      const event = await addFreightEvent(driverId, req.params['id']!, {
        type: b['type'] ?? '',
        lat: num(b['lat']),
        lng: num(b['lng']),
        address: b['address'],
        amountCop: num(b['amountCop']),
        gallons: num(b['gallons']),
        odometerKm: num(b['odometerKm']),
        note: b['note'],
        photoUrl: req.file ? fileToUrl(req.file) : undefined,
      });
      res.status(201).json({ success: true, data: event });
    } catch (err) {
      const st = err instanceof FreightError ? 400 : 500;
      res.status(st).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo registrar el evento' });
    }
  },
);

// GET /driver/freight/:id/events — línea de tiempo del flete del conductor
router.get('/freight/:id/events', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  res.json({ success: true, data: await listFreightEventsForDriver(driverId, req.params['id']!) });
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
    // Las dos reglas viven en `lib/prueba-de-entrega` con sus pruebas: lo
    // desconocido cae en 'delivery' (una app vieja no sabe de firmas) y
    // nunca en 'signature'.
    const body = req.body as { phase?: unknown; signedBy?: unknown };
    const phase = faseDePrueba(body.phase);
    const firmante = nombreDeFirmante(body.signedBy);
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
      // La firma lleva su nombre y su hora; las fotos, solo la URL. El
      // `signedAt` se sella aquí y no en el teléfono: la hora del servidor
      // es la que vale como constancia, y la del dispositivo se puede
      // cambiar en ajustes.
      const datosFirma = {
        signatureUrl: url,
        signedByName: firmante,
        signedAt: new Date(),
      };
      let count = 0;
      if (kind === 'trip') {
        const r = await prisma.trip.updateMany({
          where: { id, driverId },
          data: phase === 'signature'
            ? datosFirma
            : phase === 'pickup' ? { pickupPhotoUrl: url } : { deliveryPhotoUrl: url },
        });
        count = r.count;
      } else if (kind === 'order') {
        const r = await prisma.order.updateMany({
          where: { id, driverId },
          data: phase === 'signature'
            ? datosFirma
            : phase === 'pickup' ? { pickupPhotoUrl: url } : { deliveryPhotoUrl: url },
        });
        count = r.count;
      } else if (kind === 'errand') {
        const r = await prisma.errand.updateMany({
          where: { id, driverId },
          data: phase === 'signature'
            ? datosFirma
            : phase === 'pickup' ? { proofPhotoUrl: url } : { deliveryPhotoUrl: url },
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

// POST /driver/errands/:id/eta { minutos } — el repartidor dice en cuánto
// entrega.
//
// En una compra a un comercio que no está conectado no hay cocina que declare
// un tiempo ni ruta que medir hasta que la compra empiece: el cliente no tenía
// NINGUNA forma de saber cuánto falta. Se le pregunta al único que lo sabe.
router.post('/errands/:id/eta', async (req, res) => {
  const driverId = req.driverId;
  if (!driverId) {
    res.status(401).json({ success: false, error: 'No autenticado' });
    return;
  }
  const r = await declararEtaDeMandado(
    driverId,
    req.params['id']!,
    (req.body as { minutos?: unknown }).minutos,
  );
  if (!r.ok) {
    res.status(400).json({ success: false, error: r.motivo });
    return;
  }
  res.json({ success: true, data: { minutos: r.minutos } });
});

// ─── Estado del viaje por HTTP ────────────────────────────────────────────────

/** Estados que el conductor puede fijar desde su app. */
const ESTADOS_DEL_CONDUCTOR = [
  'arriving', 'arrived', 'in_progress', 'completed', 'cancelled',
] as const;

/**
 * POST /driver/trips/:id/status — mover el viaje, con respuesta.
 *
 * El mismo cambio de estado que ya se podía mandar por WebSocket, pero por HTTP.
 * No es un duplicado por gusto: el socket no acusa recibo, y su emisor descarta
 * en silencio lo que se manda con la conexión caída. Para "he llegado" eso es un
 * incordio; para "he terminado" es dinero — liquida la tarifa, le paga al
 * conductor y lo libera para el siguiente viaje. Esa no puede ser una operación
 * que la app crea hecha sin que nadie se lo haya confirmado.
 */
// POST /driver/trips/:id/rate-passenger { stars } — el conductor califica.
//
// La hoja ya existía en la app y no mandaba nada: puntuaba, lanzaba confeti y
// cerraba. Sin esto, `Passenger.rating` no puede ser nunca un dato real.
router.post('/trips/:id/rate-passenger', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await rateTripPassenger(req.driverId!, req.params['id']!, req.body?.['stars']);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo calificar al pasajero',
    });
  }
});

router.post('/trips/:id/status', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId!;
  const status = req.body?.['status'];
  if (typeof status !== 'string' ||
      !(ESTADOS_DEL_CONDUCTOR as readonly string[]).includes(status)) {
    res.status(400).json({
      success: false,
      error: `El estado debe ser uno de: ${ESTADOS_DEL_CONDUCTOR.join(', ')}`,
    });
    return;
  }
  const pin = typeof req.body?.['pin'] === 'string' ? (req.body['pin'] as string) : undefined;

  try {
    const { trip, settlement } = await driverUpdateTripStatus(
      driverId, req.params['id']!, status as ClientTripStatus, pin,
    );
    res.json({ success: true, data: { trip, settlement } });
  } catch (err) {
    if (err instanceof TripDriverError) {
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    // PIN de custodia que no cuadra: es culpa del dato, no del servidor, y el
    // conductor tiene que poder leer el motivo y volver a pedirlo.
    if (err instanceof CustodyPinError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo actualizar el viaje',
    });
  }
});

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

// ─── Remitos de salida de mercancía ──────────────────────────────────────────
// El conductor ve los remitos que le despachó su flota y los concilia bulto por
// bulto al entregar: ahí es donde un faltante deja de ser la palabra de uno
// contra la del otro.

// GET /driver/manifests
router.get('/manifests', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listDriverManifests(req.driverId!) });
});

// GET /driver/manifests/:id
router.get('/manifests/:id', async (req: Request, res: Response): Promise<void> => {
  const m = await getDriverManifest(req.driverId!, req.params['id']!);
  if (!m) {
    res.status(404).json({ success: false, error: 'Remito no encontrado' });
    return;
  }
  res.json({ success: true, data: m });
});

// POST /driver/manifests/:id/receive — conciliación de la entrega.
router.post('/manifests/:id/receive', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ReceiveManifestDTO;
  if (!body?.receivedByName) {
    res.status(400).json({ success: false, error: 'receivedByName es requerido' });
    return;
  }
  try {
    const m = await receiveManifest(req.driverId!, req.params['id']!, {
      ...body,
      items: Array.isArray(body.items) ? body.items : [],
    });
    res.json({ success: true, data: m });
  } catch (err) {
    const status = err instanceof ManifestError ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo registrar la entrega',
    });
  }
});

// POST /driver/manifests/:id/receipt-photo — foto del acta/firma (multipart).
router.post('/manifests/:id/receipt-photo', (req: Request, res: Response): void => {
  documentUpload.single('file')(req, res, (err) => {
    void (async () => {
      if (err || !req.file) {
        res.status(400).json({ success: false, error: 'Archivo requerido' });
        return;
      }
      if (!req.file.mimetype?.startsWith('image/')) {
        res.status(400).json({ success: false, error: 'El archivo debe ser una imagen' });
        return;
      }
      const ok = await setManifestReceiptPhoto(
        req.driverId!, req.params['id']!, fileToUrl(req.file),
      );
      if (!ok) {
        res.status(404).json({ success: false, error: 'Remito no encontrado' });
        return;
      }
      res.status(201).json({ success: true, data: { url: fileToUrl(req.file) } });
    })();
  });
});

// ─── Los papeles que viajan CON la carga ─────────────────────────────────────
//
// Remesa, manifiesto, factura, guía. Hasta ahora iban en una carpeta en la
// cabina: cuando se mojan, se pierden o se quedan en la bodega, el viaje se
// para. El conductor los sube desde donde esté y los abre en un retén.
//
// `clase` es cargoTrip | freight | trip. La pertenencia la comprueba el
// servicio contra la fila real, no contra lo que diga la petición.

router.get('/envio-docs/:clase/:id', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    const data = await listarDocumentosEnvio(
      req.params['clase'], req.params['id'], { rol: 'conductor', id: driverId },
    );
    res.json({ success: true, data });
  } catch (err) {
    const status = err instanceof DocumentoEnvioInvalido ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

router.post(
  '/envio-docs/:clase/:id',
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, error: err.message }); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const driverId = req.driverId;
    if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
    if (!req.file) { res.status(400).json({ success: false, error: 'No se recibió ningún archivo.' }); return; }
    // Imagen o PDF: una remesa llega tanto como foto del papel como en el
    // PDF que manda el cliente por correo. Rechazar el PDF obligaría a
    // imprimirlo para fotografiarlo, que es lo que esto viene a quitar.
    const tipo = req.file.mimetype ?? '';
    if (!tipo.startsWith('image/') && tipo !== 'application/pdf') {
      res.status(400).json({ success: false, error: 'El documento debe ser una imagen o un PDF.' });
      return;
    }
    try {
      const data = await subirDocumentoEnvio({
        clase: req.params['clase'],
        servicioId: req.params['id'],
        quien: { rol: 'conductor', id: driverId },
        fileUrl: fileToUrl(req.file),
        datos: req.body,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      const status = err instanceof DocumentoEnvioInvalido ? 400 : 500;
      res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
    }
  },
);

router.delete('/envio-docs/:docId', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  try {
    await borrarDocumentoEnvio(req.params['docId']!, { rol: 'conductor', id: driverId });
    res.json({ success: true });
  } catch (err) {
    const status = err instanceof DocumentoEnvioInvalido ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

export default router;

// ─── El tiquete en la puerta del bus ─────────────────────────────────────────
//
// El conductor teclea el código que el pasajero le dicta. Validar y marcar
// como abordado es UNA sola llamada: si fueran dos, el conductor podría
// validar y olvidarse de marcar —va con el motor andando— y el mismo tiquete
// serviría dos veces, que es justo lo que esto impide.
router.post('/pool/:id/abordar', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId;
  if (!driverId) {
    res.status(401).json({ success: false, error: 'Sesión no válida' });
    return;
  }
  const { id } = req.params as { id: string };
  const { codigo } = (req.body ?? {}) as { codigo?: string };
  try {
    const r = await abordarConTiquete(driverId, id, codigo ?? '');
    // 200 también cuando no puede subir: no es un error de la petición, es la
    // respuesta —y la app necesita el motivo y la hora para enseñárselos al
    // conductor, no un código de estado.
    res.json({ success: r.ok, data: r, ...(r.ok ? {} : { error: r.motivo }) });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'No pudimos validar el tiquete',
    });
  }
});
