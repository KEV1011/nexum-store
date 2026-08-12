import { Router, Request, Response } from 'express';
import { listSafetyAlerts } from '../services/safety-alerts.service';
import { legalConsentEnforced, recordConsent } from '../services/legal.service';
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
  setOperatorVehiclePhoto,
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
  listOperatorMembers,
  addOperatorMember,
  removeOperatorMember,
  updateOperatorProfile,
  type UpdateOperatorProfileDTO,
} from '../services/operator.service';
import { isValidColombianPhone } from '../services/auth.service';
import { documentUpload, fileToUrl } from '../lib/upload';
import {
  ManifestError,
  createManifest,
  listManifests,
  getManifest,
  updateManifest,
  setManifestItems,
  dispatchManifest,
  cancelManifest,
  type CreateManifestDTO,
  type ManifestItemInput,
} from '../services/manifest.service';
import {
  listAvailableFreights,
  listOperatorFreights,
  acceptFreight,
  updateFreightStatus,
  getFleetFinance,
  getFleetAnalytics,
  FreightError,
  listFreightEventsForOperator,
  getFreightTrackForOperator,
} from '../services/freight.service';
import {
  CargoTripError, createCargoTrip, listCargoTrips, getCargoTrip, updateCargoTrip,
  addTripLine, detachTripLine, attachTripLine, setCargoTripStatus, getCargoTripReport,
  type CreateCargoTripDTO, type AddTripLineDTO,
} from '../services/cargo-trip.service';
import {
  CobroError, createCobro, listCobros, getCobro, fillCobroFromPeriod,
  addTripToCobro, removeTripFromCobro, issueCobro, voidCobro, cobroToCsv,
  addCobroPayment, voidCobroPayment,
  type CreateCobroDTO, type AddPaymentDTO,
} from '../services/cobro.service';

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
  // Clickwrap: con LEGAL_CONSENT_ENFORCE=true el registro de empresas exige la
  // aceptación explícita (checkbox no preseleccionado en el portal).
  if (legalConsentEnforced() && b['acceptedTerms'] !== true) {
    res.status(400).json({
      success: false,
      error: 'Debes aceptar los Términos y Condiciones y la Política de Privacidad para registrar la empresa.',
      code: 'legal_consent_required',
    });
    return;
  }
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
    if (b['acceptedTerms'] === true) {
      void recordConsent('operator', operator.id, req.ip).catch(() => undefined);
    }
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
      soatExpiry: typeof b['soatExpiry'] === 'string' ? b['soatExpiry'] : undefined,
      rtmExpiry: typeof b['rtmExpiry'] === 'string' ? b['rtmExpiry'] : undefined,
      operationCardExpiry: typeof b['operationCardExpiry'] === 'string' ? b['operationCardExpiry'] : undefined,
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
      soatExpiry: typeof b['soatExpiry'] === 'string' || b['soatExpiry'] === null ? (b['soatExpiry'] as string | null) : undefined,
      rtmExpiry: typeof b['rtmExpiry'] === 'string' || b['rtmExpiry'] === null ? (b['rtmExpiry'] as string | null) : undefined,
      operationCardExpiry: typeof b['operationCardExpiry'] === 'string' || b['operationCardExpiry'] === null ? (b['operationCardExpiry'] as string | null) : undefined,
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

// GET /operator/alerts — alertas de seguridad EN VIVO de la flota (geocerca de
// destino, detención prolongada, desvío de ruta) para la Torre de Control.
router.get('/alerts', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listSafetyAlerts(req.operatorId!) });
});

// GET /operator/trips — viajes sellados con la empresa (trazabilidad + liquidación).
router.get('/trips', async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, unknown>;
  const raw = Number(q['limit']);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50;
  const from = typeof q['from'] === 'string' ? (q['from'] as string) : undefined;
  const to = typeof q['to'] === 'string' ? (q['to'] as string) : undefined;
  res.json({ success: true, data: await listOperatorTrips(req.operatorId!, limit, from, to) });
});

// GET /operator/trips/export.csv?from&to — reporte de liquidación descargable.
router.get('/trips/export.csv', async (req: Request, res: Response): Promise<void> => {
  const q = req.query as Record<string, unknown>;
  const from = typeof q['from'] === 'string' ? (q['from'] as string) : undefined;
  const to = typeof q['to'] === 'string' ? (q['to'] as string) : undefined;
  const csv = await exportOperatorTripsCsv(req.operatorId!, from, to);
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

// POST /operator/vehicles/:id/photo (multipart) — foto del vehículo.
router.post(
  '/vehicles/:id/photo',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  (req: Request, res: Response, next) => {
    documentUpload.single('file')(req, res, (err) => {
      if (err) { res.status(400).json({ success: false, error: err.message }); return; }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
      return;
    }
    if (!req.file.mimetype.startsWith('image/')) {
      res.status(400).json({ success: false, error: 'La foto debe ser una imagen (JPG, PNG o WebP).' });
      return;
    }
    try {
      const vehicle = await setOperatorVehiclePhoto(req.operatorId!, req.params['id'] as string, fileToUrl(req.file));
      res.status(201).json({ success: true, data: vehicle });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo subir la foto';
      res.status(msg.includes('no encontrado') ? 404 : 400).json({ success: false, error: msg });
    }
  },
);

// ─── Miembros del portal (accesos) ───────────────────────────────────────────
// Sin esto una flota solo podía tener el usuario del registro: un despachador
// no tenía forma de entrar, y el login le respondía que su teléfono no estaba
// asociado a ninguna empresa.

const OPERATOR_ROLES = new Set<string>(['OWNER', 'DISPATCHER', 'VIEWER']);

router.get('/members', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listOperatorMembers(req.operatorId!) });
});

router.post('/members', requireOperatorRole('OWNER'), async (req: Request, res: Response): Promise<void> => {
  const { phone, name, role } = req.body as { phone?: string; name?: string; role?: string };
  if (!phone || !isValidColombianPhone(phone)) {
    res.status(400).json({ success: false, error: 'Escribe un celular colombiano válido (+57 y 10 dígitos).' });
    return;
  }
  if (!role || !OPERATOR_ROLES.has(role)) {
    res.status(400).json({ success: false, error: `role requerido (${[...OPERATOR_ROLES].join(', ')})` });
    return;
  }
  try {
    const member = await addOperatorMember(req.operatorId!, phone, name, role as OperatorRole);
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo dar el acceso' });
  }
});

router.delete('/members/:id', requireOperatorRole('OWNER'), async (req: Request, res: Response): Promise<void> => {
  try {
    await removeOperatorMember(req.operatorId!, req.params['id'] as string);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo quitar el acceso';
    res.status(msg.includes('no existe') ? 404 : 400).json({ success: false, error: msg });
  }
});

// PUT /operator/profile — datos de contacto de la empresa.
router.put('/profile', requireOperatorRole('OWNER'), async (req: Request, res: Response): Promise<void> => {
  const dto = req.body as UpdateOperatorProfileDTO;
  if (dto.contactPhone !== undefined && dto.contactPhone !== '' && !isValidColombianPhone(dto.contactPhone)) {
    res.status(400).json({ success: false, error: 'El teléfono de contacto no es un celular colombiano válido.' });
    return;
  }
  try {
    res.json({ success: true, data: await updateOperatorProfile(req.operatorId!, dto) });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo guardar' });
  }
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
// GET /operator/freight/:id/events — trazabilidad del flete: tanqueos, paradas
// y notas registrados por el conductor en ruta + total de combustible.
router.get('/freight/:id/events', async (req: Request, res: Response): Promise<void> => {
  const data = await listFreightEventsForOperator(req.operatorId!, req.params['id']!);
  if (!data) {
    res.status(404).json({ success: false, error: 'Ese flete no pertenece a tu empresa.' });
    return;
  }
  res.json({ success: true, data });
});

// GET /operator/freight/:id/track — recorrido REAL del camión (rastro GPS) con
// kilómetros, duración y tiempo detenido. Es lo que se le muestra al cliente
// cuando reclama: por dónde pasó y dónde estuvo parado.
router.get('/freight/:id/track', async (req: Request, res: Response): Promise<void> => {
  const data = await getFreightTrackForOperator(req.operatorId!, req.params['id']!);
  if (!data) {
    res.status(404).json({ success: false, error: 'Ese flete no pertenece a tu empresa.' });
    return;
  }
  res.json({ success: true, data });
});

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

// GET /operator/fleet/analytics — rendimiento (ranking de conductores y vehículos).
router.get('/fleet/analytics', async (req: Request, res: Response): Promise<void> => {
  const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
  const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
  res.json({ success: true, data: await getFleetAnalytics(req.operatorId!, from, to) });
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
      stops?: Array<{ name?: string; lat?: number; lng?: number; order?: number }>;
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
          stops: (b.stops ?? []).map((st, i) => ({
            name: String(st.name ?? ''), lat: st.lat, lng: st.lng, order: st.order ?? i,
          })),
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

// ─── Remitos de salida de mercancía ──────────────────────────────────────────
// Reemplazo digital del formato en papel "SALIDA DE MERCANCÍA": la flota arma
// el remito con la lista de bultos, lo despacha con conductor y vehículo, y el
// conductor lo concilia al entregar.

function _errorRemito(res: Response, err: unknown): void {
  const status = err instanceof ManifestError ? 400 : 500;
  res.status(status).json({
    success: false,
    error: err instanceof Error ? err.message : 'No se pudo procesar el remito',
  });
}

// GET /operator/manifests?status=DRAFT
router.get('/manifests', async (req: Request, res: Response): Promise<void> => {
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
  res.json({ success: true, data: await listManifests(req.operatorId!, status) });
});

// GET /operator/manifests/:id
router.get('/manifests/:id', async (req: Request, res: Response): Promise<void> => {
  const m = await getManifest(req.operatorId!, req.params['id']!);
  if (!m) {
    res.status(404).json({ success: false, error: 'Remito no encontrado' });
    return;
  }
  res.json({ success: true, data: m });
});

// POST /operator/manifests — crea el remito (borrador).
router.post(
  '/manifests',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const m = await createManifest(req.operatorId!, req.body as CreateManifestDTO);
      res.status(201).json({ success: true, data: m });
    } catch (err) {
      _errorRemito(res, err);
    }
  },
);

// PATCH /operator/manifests/:id — encabezado del remito (solo borrador).
router.patch(
  '/manifests/:id',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const m = await updateManifest(req.operatorId!, req.params['id']!, req.body as CreateManifestDTO);
      res.json({ success: true, data: m });
    } catch (err) {
      _errorRemito(res, err);
    }
  },
);

// PUT /operator/manifests/:id/items — reemplaza la lista de bultos.
router.put(
  '/manifests/:id/items',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  async (req: Request, res: Response): Promise<void> => {
    const { items } = req.body as { items?: ManifestItemInput[] };
    if (!Array.isArray(items)) {
      res.status(400).json({ success: false, error: 'items (lista) es requerido' });
      return;
    }
    try {
      const m = await setManifestItems(req.operatorId!, req.params['id']!, items);
      res.json({ success: true, data: m });
    } catch (err) {
      _errorRemito(res, err);
    }
  },
);

// POST /operator/manifests/:id/dispatch { driverId, vehicleId?, freightId? }
router.post(
  '/manifests/:id/dispatch',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  async (req: Request, res: Response): Promise<void> => {
    const { driverId, vehicleId, freightId } = req.body as {
      driverId?: string; vehicleId?: string; freightId?: string;
    };
    if (!driverId) {
      res.status(400).json({ success: false, error: 'driverId es requerido' });
      return;
    }
    try {
      const m = await dispatchManifest(req.operatorId!, req.params['id']!, {
        driverId, vehicleId, freightId,
      });
      res.json({ success: true, data: m });
    } catch (err) {
      _errorRemito(res, err);
    }
  },
);

// POST /operator/manifests/:id/cancel
router.post(
  '/manifests/:id/cancel',
  requireOperatorRole('OWNER', 'DISPATCHER'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const m = await cancelManifest(req.operatorId!, req.params['id']!);
      res.json({ success: true, data: m });
    } catch (err) {
      _errorRemito(res, err);
    }
  },
);

// ─── Viajes de carga ──────────────────────────────────────────────────────────
//
// Un camión con mercancía de varios clientes: el viaje agrupa remitos, y cada
// remito es una línea (referencia, destinatario, rollos y metros).

function _errorViaje(res: Response, err: unknown): void {
  const status = err instanceof CargoTripError ? 400 : 500;
  res.status(status).json({
    success: false,
    error: err instanceof Error ? err.message : 'No se pudo procesar el viaje',
  });
}

router.get('/cargo-trips', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listCargoTrips(req.operatorId!, {
      from: req.query['from'] as string | undefined,
      to: req.query['to'] as string | undefined,
      sinFacturar: req.query['sinFacturar'] === 'true',
    });
    res.json({ success: true, data });
  } catch (err) { _errorViaje(res, err); }
});

router.get('/cargo-trips/:id', async (req: Request, res: Response): Promise<void> => {
  const t = await getCargoTrip(req.operatorId!, req.params['id']!);
  if (!t) { res.status(404).json({ success: false, error: 'Ese viaje no pertenece a tu empresa.' }); return; }
  res.json({ success: true, data: t });
});

router.post('/cargo-trips', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json({ success: true, data: await createCargoTrip(req.operatorId!, req.body as CreateCargoTripDTO) });
  } catch (err) { _errorViaje(res, err); }
});

router.patch('/cargo-trips/:id', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await updateCargoTrip(req.operatorId!, req.params['id']!, req.body as CreateCargoTripDTO) });
  } catch (err) { _errorViaje(res, err); }
});

// Añade una línea de mercancía (crea el remito y lo cuelga del viaje).
router.post('/cargo-trips/:id/lines', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json({ success: true, data: await addTripLine(req.operatorId!, req.params['id']!, req.body as AddTripLineDTO) });
  } catch (err) { _errorViaje(res, err); }
});

router.delete('/cargo-trips/:id/lines/:manifestId', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await detachTripLine(req.operatorId!, req.params['id']!, req.params['manifestId']!) });
  } catch (err) { _errorViaje(res, err); }
});

// Cuelga un remito ya existente (creado suelto) de este viaje.
router.post('/cargo-trips/:id/lines/:manifestId', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await attachTripLine(req.operatorId!, req.params['id']!, req.params['manifestId']!) });
  } catch (err) { _errorViaje(res, err); }
});

router.post('/cargo-trips/:id/status', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status?: string };
  if (status !== 'dispatched' && status !== 'completed' && status !== 'cancelled') {
    res.status(400).json({ success: false, error: "status debe ser 'dispatched', 'completed' o 'cancelled'" });
    return;
  }
  try {
    res.json({ success: true, data: await setCargoTripStatus(req.operatorId!, req.params['id']!, status) });
  } catch (err) { _errorViaje(res, err); }
});

// ─── Cuentas de cobro ─────────────────────────────────────────────────────────

function _errorCobro(res: Response, err: unknown): void {
  const status = err instanceof CobroError ? 400 : 500;
  res.status(status).json({
    success: false,
    error: err instanceof Error ? err.message : 'No se pudo procesar la cuenta de cobro',
  });
}

router.get('/cobros', async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listCobros(req.operatorId!) });
});

router.get('/cobros/:id', async (req: Request, res: Response): Promise<void> => {
  const c = await getCobro(req.operatorId!, req.params['id']!);
  if (!c) { res.status(404).json({ success: false, error: 'Esa cuenta no pertenece a tu empresa.' }); return; }
  res.json({ success: true, data: c });
});

// CSV con el mismo detalle del documento impreso.
router.get('/cobros/:id/export.csv', async (req: Request, res: Response): Promise<void> => {
  const c = await getCobro(req.operatorId!, req.params['id']!);
  if (!c) { res.status(404).json({ success: false, error: 'Esa cuenta no pertenece a tu empresa.' }); return; }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cuenta-cobro-${c.number}.csv"`);
  res.send(cobroToCsv(c));
});

router.post('/cobros', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json({ success: true, data: await createCobro(req.operatorId!, req.body as CreateCobroDTO) });
  } catch (err) { _errorCobro(res, err); }
});

// Mete todos los viajes completados del período que aún no estén facturados.
router.post('/cobros/:id/fill', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await fillCobroFromPeriod(req.operatorId!, req.params['id']!) });
  } catch (err) { _errorCobro(res, err); }
});

router.post('/cobros/:id/trips/:tripId', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await addTripToCobro(req.operatorId!, req.params['id']!, req.params['tripId']!) });
  } catch (err) { _errorCobro(res, err); }
});

router.delete('/cobros/:id/trips/:tripId', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await removeTripFromCobro(req.operatorId!, req.params['id']!, req.params['tripId']!) });
  } catch (err) { _errorCobro(res, err); }
});

router.post('/cobros/:id/issue', requireOperatorRole('OWNER'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { signedBy } = req.body as { signedBy?: string };
    res.json({ success: true, data: await issueCobro(req.operatorId!, req.params['id']!, signedBy) });
  } catch (err) { _errorCobro(res, err); }
});

router.post('/cobros/:id/void', requireOperatorRole('OWNER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await voidCobro(req.operatorId!, req.params['id']!) });
  } catch (err) { _errorCobro(res, err); }
});

// Pagos de la cuenta: anticipo, abono parcial o saldo.
router.post('/cobros/:id/payments', requireOperatorRole('OWNER', 'DISPATCHER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json({
      success: true,
      data: await addCobroPayment(req.operatorId!, req.params['id']!, req.body as AddPaymentDTO),
    });
  } catch (err) { _errorCobro(res, err); }
});

// Un pago no se borra: se anula y queda la constancia.
router.delete('/cobros/:id/payments/:paymentId', requireOperatorRole('OWNER'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await voidCobroPayment(req.operatorId!, req.params['id']!, req.params['paymentId']!),
    });
  } catch (err) { _errorCobro(res, err); }
});

// Informe final del viaje: mercancía, recorrido, gastos, tiempos y cobro en un
// solo documento. Es lo que se revisa al cerrar cada viaje y entrega.
router.get('/cargo-trips/:id/report', async (req: Request, res: Response): Promise<void> => {
  const r = await getCargoTripReport(req.operatorId!, req.params['id']!);
  if (!r) { res.status(404).json({ success: false, error: 'Ese viaje no pertenece a tu empresa.' }); return; }
  res.json({ success: true, data: r });
});

export default router;
