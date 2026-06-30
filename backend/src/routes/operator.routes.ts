import { Router, Request, Response } from 'express';
import { OperatorType, OperatorDocType, VehicleType } from '@prisma/client';
import { requestOtp, validateOtp, OtpRateLimitError } from '../services/otp.service';
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
  listOperatorDrivers,
  affiliateDriver,
  getFleetPositions,
  listOperatorTrips,
  listOperatorDocuments,
  uploadOperatorDocument,
} from '../services/operator.service';
import { documentUpload, fileToUrl } from '../lib/upload';

const router = Router();

const OPERATOR_TYPES = new Set<string>(['TAXI', 'INTERCITY', 'MIXED']);
const OPERATOR_DOC_TYPES = new Set<string>([
  'HABILITACION', 'RUT', 'CAMARA_COMERCIO', 'INSURANCE', 'OTHER',
]);
const VEHICLE_TYPES = new Set<string>(['PARTICULAR', 'TAXI', 'MOTO']);

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
      error: 'legalName, nit, contactPhone y type (TAXI|INTERCITY|MIXED) son requeridos',
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
    // Mismo mensaje exista o no el miembro (no revelar la lista).
    if (member) await requestOtp(phone.trim());
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
  const member = await findOperatorMemberByPhone(phone);
  if (!member) {
    res.status(401).json({ success: false, error: 'Código inválido' });
    return;
  }
  try {
    await validateOtp(phone.trim(), otp.trim());
  } catch {
    res.status(401).json({ success: false, error: 'Código inválido o expirado' });
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
      internalCode: typeof b['internalCode'] === 'string' ? b['internalCode'] : undefined,
    });
    res.status(201).json({ success: true, data: vehicle });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'No se pudo crear el vehículo' });
  }
});

// GET /operator/trips — viajes sellados con la empresa (trazabilidad + liquidación).
router.get('/trips', async (req: Request, res: Response): Promise<void> => {
  const raw = Number((req.query as Record<string, unknown>)['limit']);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50;
  res.json({ success: true, data: await listOperatorTrips(req.operatorId!, limit) });
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

export default router;
