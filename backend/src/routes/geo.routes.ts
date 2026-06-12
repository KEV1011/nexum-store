import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';
import { verifyClientToken } from '../services/client.service';
import {
  autocomplete,
  placeDetails,
  reverseGeocode,
  directions,
  geoHealth,
  GeoError,
} from '../services/geo.service';

const router = Router();

// GET /geo/health — diagnóstico del proxy de Google Maps. Público y sin PII:
// abre https://<api>/geo/health en el navegador para ver por qué fallan los
// mapas (key ausente, API no habilitada, billing, restricciones de la key…).
router.get('/health', async (_req: Request, res: Response) => {
  const health = await geoHealth();
  res.status(health.upstreamOk ? 200 : 503).json({ success: health.upstreamOk, data: health });
});

// Acepta token de cliente O de conductor: ambos usan los servicios geo.
function anyAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    verifyClientToken(token);
    next();
    return;
  } catch {
    // not a client token — try driver
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

router.use(anyAuthMiddleware);

function handleGeoError(res: Response, err: unknown): void {
  if (err instanceof GeoError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }
  res.status(502).json({ success: false, error: 'Geo service error' });
}

// GET /geo/autocomplete?input=cra+5&lat=&lng=
router.get('/autocomplete', async (req, res) => {
  const input = (req.query['input'] as string | undefined)?.trim();
  if (!input || input.length < 3) {
    res.json({ success: true, data: [] });
    return;
  }
  const lat = req.query['lat'] ? parseFloat(req.query['lat'] as string) : undefined;
  const lng = req.query['lng'] ? parseFloat(req.query['lng'] as string) : undefined;
  try {
    const suggestions = await autocomplete(input, lat, lng);
    res.json({ success: true, data: suggestions });
  } catch (err) {
    handleGeoError(res, err);
  }
});

// GET /geo/place/:placeId — coordenadas + dirección formateada
router.get('/place/:placeId', async (req, res) => {
  try {
    const details = await placeDetails(req.params['placeId']!);
    res.json({ success: true, data: details });
  } catch (err) {
    handleGeoError(res, err);
  }
});

// GET /geo/reverse?lat=&lng= — dirección legible desde coordenadas GPS
router.get('/reverse', async (req, res) => {
  const lat = parseFloat(req.query['lat'] as string);
  const lng = parseFloat(req.query['lng'] as string);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    res.status(400).json({ success: false, error: 'lat and lng are required' });
    return;
  }
  try {
    const address = await reverseGeocode(lat, lng);
    res.json({ success: true, data: { address } });
  } catch (err) {
    handleGeoError(res, err);
  }
});

// GET /geo/directions?originLat=&originLng=&destLat=&destLng=
router.get('/directions', async (req, res) => {
  const originLat = parseFloat(req.query['originLat'] as string);
  const originLng = parseFloat(req.query['originLng'] as string);
  const destLat = parseFloat(req.query['destLat'] as string);
  const destLng = parseFloat(req.query['destLng'] as string);
  if ([originLat, originLng, destLat, destLng].some(Number.isNaN)) {
    res.status(400).json({ success: false, error: 'originLat, originLng, destLat and destLng are required' });
    return;
  }
  try {
    const route = await directions(originLat, originLng, destLat, destLng);
    res.json({ success: true, data: route });
  } catch (err) {
    handleGeoError(res, err);
  }
});

export default router;
