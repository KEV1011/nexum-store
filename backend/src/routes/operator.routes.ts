import { Router, Request, Response } from 'express';
import { OperatorType, OperatorDocType, VehicleType } from '@prisma/client';
import { requestOtp, validateOtp, OtpRateLimitError } from '../services/otp.service';
import { isSmsConfigured } from '../services/sms.service';
import { prisma } from '../lib/prisma';
import {
  publishPooledTrip,
  getOperatorPooledTrips,
  cancelPooledTripByOperator,
  PooledTripError,
} from '../services/intercity-pool.service';
import { IntercityCity } from '../types';
import {
  signOperatorToken,
  requireOperator,
  requireOperatorRole,
  OperatorRole,
} from '../middleware/operator-auth.middleware';
import {
  registerOperator,
  findOperatorMemberByPhone,
  getOperatorProfile,
  listOperatorVehicles,
  createOperatorVehicle,
  updateOperatorVehicle,
  deleteOperatorVehicle,
  listOperatorDrivers,
  affiliateDriver,
  unaffiliateDriver,
  getFleetPositions,
  listOperatorTrips,
  exportOperatorTripsCsv,
  listOperatorRoutes,
  addOperatorRoute,
  removeOperatorRoute,
  listOperatorDocuments,
  uploadOperatorDocument,
} from '../services/operator.service';
import { documentUpload, fileToUrl } from '../lib/upload';
import {
  listAvailableFreights,
  listOperatorFreights,
  acceptFreight,
  updateFreightStatus,
  getFleetFinance,
  FreightError,
} from '../services/freight.service';

const router = Router();

const OPERATOR_TYPES = new Set<string>(['TAXI', 'INTERCITY', 'MIXED', 'CARGA']);
const OPERATOR_DOC_TYPES = new Set<string>([
  'HABILITACION', 'RUT', 'CAMARA_COMERCIO', 'INSURANCE', 'OTHER',
]);
const VEHICLE_TYPES = new Set<string>(['PARTICULAR', 'TAXI', 'MOTO', 'TURBO', 'CAMION', 'MULA']);

// ─── Registro (público) ──────────────────────────────────────────────────────

// POST /operator/register — alta de empresa + miembro OWNER. Queda PENDING hasta
// que el admin verifique su habilitación.
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  if (
    typeof b['legalName'] !== 'string' ||
    typeof b['nit'] !== 'string' ||
    typeof b['contactPhone'] !== 'string' ||
    typeof b['type'] !== 'string' ||
    !OPERATOR_TYPES.has(b['type'])
  ) {
    res.status(400).json({
      success: false,
      error: 'legalName, nit, contactPhone y type (TAXI|INTERCITY|MIXED|CARGA) son requeridos',
    });
    return;
  }
  try {
    const operator = await registerOperator({
      legalName: b['legalName'],
      nit: b['nit'],
      type: b['type'] as OperatorType,
      contactPhone: b['contactPhone'],
      contactName: typeof b['contactName'] === 'string' ? b['contactName'] : undefined,
      contactEmail: typeof b['contactEmail'] === 'string' ? b['contactEmail'] : undefined,
      city: typeof b['city'] === 'string' ? b['city'] : undefined,
      tradeName: typeof b['tradeName'] === 'string' ? b['tradeName'] : undefined,
      // PERSONA = dueño natural de vehículos (nombre + cédula en los mismos campos).
      kind: b['kind'] === 'PERSONA' ? 'PERSONA' : 'EMPRESA',
    });
    res.status(201).json({ success: true, data: { id: operator.id, status: operator.status } });
  } catch (err) {
    // NIT duplicado u otro error de unicidad.
    const msg = err instanceof Error && /unique|nit/i.test(err.message)
      ? 'Ya existe una empresa registrada con ese NIT.'
      : 'No se pudo registrar la empresa.';
    res.status(400).json({ success: false, error: msg });
  }
});

// ─── Auth del portal (OTP → JWT) ─────────────────────────────────────────────

// POST /operator/auth/send-otp { phone }
router.post('/auth/send-otp', async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone es requerido' });
    return;
  }
  try {
    const member = await findOperatorMemberByPhone(phone);
    // Con Twilio, solo se envía SMS real a miembros (evita SMS-pumping y no
    // revela la lista: la respuesta es la misma). En modo local (código fijo)
    // la sesión se crea SIEMPRE: así el verify puede validar el código primero
    // y, ya probada la posesión del teléfono, explicar si falta la empresa —
    // antes un teléfono sin empresa moría en un "Código inválido" indescifrable.
    if (member || !isSmsConfigured()) await requestOtp(phone.trim());
    res.json({ success: true, data: { success: true } });
  } catch (err) {
    const status = err instanceof OtpRateLimitError ? 429 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'Error' });
  }
});

// POST /operator/auth/verify-otp { phone, otp } → { token, operator }
router.post('/auth/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp) {
    res.status(400).json({ success: false, error: 'phone y otp son requeridos' });
    return;
  }
  // 1) Validar el código PRIMERO (prueba posesión del teléfono)...
  try {
    await validateOtp(phone.trim(), otp.trim());
  } catch (err) {
    const status = err instanceof OtpRateLimitError ? 429 : 401;
    res.status(status).json({
      success: false,
      error: err instanceof Error ? err.message : 'Código inválido',
    });
    return;
  }
  // 2) ...y solo entonces revelar el estado de la cuenta: quien validó el OTP
  // es dueño del teléfono, no hay enumeración posible por terceros.
  const member = await findOperatorMemberByPhone(phone);
  if (!member) {
    res.status(403).json({
      success: false,
      error:
        'Este teléfono no está asociado a ninguna empresa. Regístrala en ' +
        '"Regístrala aquí" (o entra con el teléfono de contacto que usaste al registrarla).',
    });
    return;
  }
  const token = signOperatorToken({
    operatorId: member.operatorId,
    memberId: member.id,
    role: member.role as OperatorRole,
  });
  res.json({
    success: true,
    data: {
      token,
      operator: {
        id: member.operator.id,
        legalName: member.operator.legalName,
        type: member.operator.type,
        status: member.operator.status,
        isVerified: member.operator.isVerified,
      },
      role: member.role,
    },
  });
});

// ─── API del portal (requiere JWT de empresa) ────────────────────────────────

router.use(requireOperator);

// GET /operator/profile
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  const data = await getOperatorProfile(req.operatorId!);
  if (!data) { res.status(404).json({ success: false, error: 'Empresa no encontrada' }); return; }
  res.json({ success: true, data });
});

// GET /operator/fleet — posiciones de la flota en vivo (última posición de cada conductor).
router.get('/fleet', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getFleetPositions(req.operatorId!) });
});

// GET /operator/vehicles · POST /operator/vehicles
router.get('/vehicles', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listOperatorVehicles(req.operatorId!) });
});

router.post('/vehicles', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  if (
    typeof b['driverId'] !== 'string' ||
    typeof b['type'] !== 'string' || !VEHICLE_TYPES.has(b['type']) ||
    typeof b['brand'] !== 'string' || typeof b['model'] !== 'string' ||
    typeof b['year'] !== 'number' || typeof b['plate'] !== 'string' ||
    typeof b['color'] !== 'string'
  ) {
    res.status(400).json({ success: false, error: 'driverId, type, brand, model, year, plate, color son requeridos' });
    return;
  }
  try {
    const vehicle = await createOperatorVehicle(req.operatorId!, {
      driverId: b['driverId'],
      type: b['type'] as VehicleType,
      brand: b['brand'],
      model: b['model'],
      year: b['year'],
      plate: b['plate'],
      color: b['color'],
      operationCardNo: typeof b['operationCardNo'] === 'string' ? b['operationCardNo'] : undefined,
      capacity: typeof b['capacity'] === 'number' ? b['capacity'] : undefined,
      capacityKg: typeof b['capacityKg'] === 'number' ? b['capacityKg'] : undefined,
      internalCode: typeof b['internalCode'] === 'string' ? b['internalCode'] : undefined,
    });
    res.status(201).json({ success: true, data: vehicle });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo crear el vehículo' });
  }
});

// PATCH /operator/vehicles/:id — editar / activar-desactivar / reasignar conductor.
router.patch('/vehicles/:id', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  if (typeof b['type'] === 'string' && !VEHICLE_TYPES.has(b['type'])) {
    res.status(400).json({ success: false, error: 'Tipo de vehículo inválido' });
    return;
  }
  try {
    const vehicle = await updateOperatorVehicle(req.operatorId!, req.params['id'] as string, {
      driverId: typeof b['driverId'] === 'string' ? b['driverId'] : undefined,
      type: typeof b['type'] === 'string' ? (b['type'] as VehicleType) : undefined,
      brand: typeof b['brand'] === 'string' ? b['brand'] : undefined,
      model: typeof b['model'] === 'string' ? b['model'] : undefined,
      year: typeof b['year'] === 'number' ? b['year'] : undefined,
      plate: typeof b['plate'] === 'string' ? b['plate'] : undefined,
      color: typeof b['color'] === 'string' ? b['color'] : undefined,
      operationCardNo: typeof b['operationCardNo'] === 'string' ? b['operationCardNo'] : undefined,
      capacityKg: typeof b['capacityKg'] === 'number' ? b['capacityKg'] : undefined,
      internalCode: typeof b['internalCode'] === 'string' ? b['internalCode'] : undefined,
      isActive: typeof b['isActive'] === 'boolean' ? b['isActive'] : undefined,
    });
    res.json({ success: true, data: vehicle });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo actualizar el vehículo';
    res.status(msg.includes('no encontrado') ? 404 : 400).json({ success: false, error: msg });
  }
});

// DELETE /operator/vehicles/:id — eliminar un vehículo de la flota.
router.delete('/vehicles/:id', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const ok = await deleteOperatorVehicle(req.operatorId!, req.params['id'] as string);
  if (!ok) { res.status(404).json({ success: false, error: 'Vehículo no encontrado' }); return; }
  res.json({ success: true, data: { deleted: true } });
});

// GET /operator/trips — viajes sellados con la empresa (trazabilidad + liquidación).
router.get('/trips', async (req: Request, res: Response): Promise<void> => {
  const raw = Number((req.query as Record<string, unknown>)['limit']);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50;
  res.json({ success: true, data: await listOperatorTrips(req.operatorId!, limit) });
});

// GET /operator/trips/export.csv — reporte de liquidación descargable.
router.get('/trips/export.csv', async (req: Request, res: Response): Promise<void> => {
  const csv = await exportOperatorTripsCsv(req.operatorId!);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nexum-viajes.csv"');
  // BOM para que Excel reconozca UTF-8 (acentos en direcciones/nombres).
  res.send('﻿' + csv);
});

// ─── Rutas troncales (intermunicipal) ────────────────────────────────────────
// GET /operator/routes · POST /operator/routes · DELETE /operator/routes/:id
router.get('/routes', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listOperatorRoutes(req.operatorId!) });
});

router.post('/routes', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const { originCity, destCity } = req.body as { originCity?: string; destCity?: string };
  if (!originCity || !destCity) {
    res.status(400).json({ success: false, error: 'originCity y destCity son requeridos' });
    return;
  }
  try {
    const route = await addOperatorRoute(req.operatorId!, originCity, destCity);
    res.status(201).json({ success: true, data: route });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo registrar la ruta' });
  }
});

router.delete('/routes/:id', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const ok = await removeOperatorRoute(req.operatorId!, req.params['id'] as string);
  if (!ok) { res.status(404).json({ success: false, error: 'Ruta no encontrada' }); return; }
  res.json({ success: true, data: { deleted: true } });
});

// GET /operator/drivers · POST /operator/drivers/invite
router.get('/drivers', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listOperatorDrivers(req.operatorId!) });
});

router.post('/drivers/invite', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const { phone, name } = req.body as { phone?: string; name?: string };
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone es requerido' });
    return;
  }
  try {
    const driver = await affiliateDriver(req.operatorId!, phone, typeof name === 'string' ? name : undefined);
    res.status(201).json({ success: true, data: driver });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo afiliar el conductor' });
  }
});

// DELETE /operator/drivers/:id — desafiliar un conductor de la empresa.
router.delete('/drivers/:id', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const ok = await unaffiliateDriver(req.operatorId!, req.params['id'] as string);
  if (!ok) { res.status(404).json({ success: false, error: 'Conductor no encontrado' }); return; }
  res.json({ success: true, data: { unaffiliated: true } });
});

// GET /operator/documents · POST /operator/documents (multipart)
router.get('/documents', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listOperatorDocuments(req.operatorId!) });
});

router.post(
  '/documents',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, error: err.message }); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const { type, expiresAt } = req.body as { type?: string; expiresAt?: string };
    if (!type || !OPERATOR_DOC_TYPES.has(type)) {
      res.status(400).json({ success: false, error: `type requerido (${[...OPERATOR_DOC_TYPES].join(', ')})` });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ningún archivo.' });
      return;
    }
    try {
      const doc = await uploadOperatorDocument(req.operatorId!, type as OperatorDocType, fileToUrl(req.file), expiresAt);
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error al guardar el documento' });
    }
  },
);

// ─── Salidas programadas (cupos intermunicipales de la empresa) ───────────────
// La empresa publica salidas con horario/puestos asignando un conductor
// afiliado; el cliente las ve y reserva en "Cupos compartidos" (mismo motor
// pooled). Empresa verificada ⇒ las rutas troncales del modelo dual están
// permitidas (licensedOperator).

// GET /operator/pool — salidas publicadas por la empresa.
// ─── Fletes de carga (tablero + gestión) ──────────────────────────────────────

// Fletes abiertos que la flota puede tomar (según sus tipos de camión).
router.get('/freight/available', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listAvailableFreights(req.operatorId!) });
});

// Fletes de MI flota (aceptados, en ruta, completados).
router.get('/freight', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listOperatorFreights(req.operatorId!) });
});

// Tomar un flete asignando conductor + vehículo de la flota.
router.post('/freight/:id/accept', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const { driverId, vehicleId } = req.body as { driverId?: string; vehicleId?: string };
  if (!driverId || !vehicleId) {
    res.status(400).json({ success: false, error: 'driverId y vehicleId son requeridos' });
    return;
  }
  try {
    const freight = await acceptFreight(req.operatorId!, req.params['id']!, driverId, vehicleId);
    res.json({ success: true, data: freight });
  } catch (err) {
    const status = err instanceof FreightError ? 400 : 500;
    res.status(status).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo tomar el flete' });
  }
});

// in_progress | completed | cancelled (cancelar lo devuelve al tablero).
router.post('/freight/:id/status', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status?: string };
  if (status !== 'in_progress' && status !== 'completed' && status !== 'cancelled') {
    res.status(400).json({ success: false, error: "status debe ser 'in_progress', 'completed' o 'cancelled'" });
    return;
  }
  try {
    const freight = await updateFreightStatus(req.operatorId!, req.params['id']!, status);
    res.json({ success: true, data: freight });
  } catch (err) {
    const st = err instanceof FreightError ? 400 : 500;
    res.status(st).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo actualizar el flete' });
  }
});

// ─── Panel financiero de la flota (todos los servicios sellados) ──────────────

router.get('/finance/summary', async (req: Request, res: Response): Promise<void> => {
  const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
  const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
  res.json({ success: true, data: await getFleetFinance(req.operatorId!, from, to) });
});

router.get('/pool', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await getOperatorPooledTrips(req.operatorId!) });
});

// POST /operator/pool/publish
router.post(
  '/pool/publish',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  async (req: Request, res: Response): Promise<void> => {
    const b = req.body as {
      driverId?: string;
      origin?: string;
      destination?: string;
      departureTime?: string;
      totalSeats?: number;
      farePerSeat?: number;
      vehicleDescription?: string;
      notes?: string;
    };
    if (
      !b.driverId || !b.origin || !b.destination || !b.departureTime ||
      b.totalSeats === undefined || b.farePerSeat === undefined
    ) {
      res.status(400).json({
        success: false,
        error: 'driverId, origin, destination, departureTime, totalSeats y farePerSeat son requeridos',
      });
      return;
    }
    const driver = await prisma.driver.findFirst({
      where: { id: b.driverId, operatorId: req.operatorId! },
      select: {
        id: true,
        name: true,
        phone: true,
        vehicles: {
          where: { isActive: true },
          take: 1,
          select: { brand: true, model: true, plate: true },
        },
      },
    });
    if (!driver) {
      res.status(404).json({ success: false, error: 'Ese conductor no está afiliado a tu empresa.' });
      return;
    }
    const operator = await prisma.operator.findUnique({
      where: { id: req.operatorId! },
      select: { isVerified: true },
    });
    const v = driver.vehicles[0];
    const vehicleDescription =
      b.vehicleDescription?.trim() ||
      (v ? `${v.brand} ${v.model} · ${v.plate}` : 'Vehículo de la empresa');
    try {
      const trip = await publishPooledTrip(
        driver.id,
        driver.name,
        driver.phone,
        {
          origin: b.origin as IntercityCity,
          destination: b.destination as IntercityCity,
          departureTime: b.departureTime,
          totalSeats: b.totalSeats,
          farePerSeat: b.farePerSeat,
          vehicleDescription,
          notes: b.notes,
          allowFleet: true,
        },
        { operatorId: req.operatorId!, licensedOperator: operator?.isVerified === true },
      );
      res.status(201).json({ success: true, data: trip });
    } catch (err) {
      const status = err instanceof PooledTripError ? 400 : 500;
      res.status(status).json({
        success: false,
        error: err instanceof Error ? err.message : 'No se pudo publicar la salida',
      });
    }
  },
);

// POST /operator/pool/:id/cancel — cancela una salida propia.
router.post(
  '/pool/:id/cancel',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  async (req: Request, res: Response): Promise<void> => {
    const trip = await cancelPooledTripByOperator(req.operatorId!, req.params['id']!);
    if (!trip) {
      res.status(404).json({ success: false, error: 'Salida no encontrada o ya no se puede cancelar.' });
      return;
    }
    res.json({ success: true, data: trip });
  },
);

export default router;
