import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { clientAuthMiddleware } from '../middleware/client-auth.middleware';
import {
  isGeoConfigured,
  autocomplete,
  placeDetails,
  reverseGeocode,
  directions,
} from '../services/geo.service';

const router = Router();

// Accept either driver or client JWT — any authenticated user may use geo proxy.
function anyAuth(req: Request, res: Response, next: () => void): void {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Authorization header' });
    return;
  }
  // Try driver token first, then client token
  authMiddleware(req, res, () => {
    if (req.driverId) { next(); return; }
    clientAuthMiddleware(req, res, () => next());
  });
}

function geoGuard(_req: Request, res: Response, next: () => void): void {
  if (!isGeoConfigured()) {
    res.status(503).json({ success: false, error: 'Geo service not configured' });
    return;
  }
  next();
}

// GET /geo/autocomplete?input=&sessionToken=
router.get('/autocomplete', anyAuth, geoGuard, async (req: Request, res: Response): Promise<void> => {
  const input = String(req.query['input'] ?? '').trim();
  if (!input) { res.status(400).json({ success: false, error: 'input is required' }); return; }
  try {
    const suggestions = await autocomplete(input, req.query['sessionToken'] as string | undefined);
    res.json({ success: true, data: suggestions });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'Autocomplete failed' });
  }
});

// GET /geo/place/:placeId
router.get('/place/:placeId', anyAuth, geoGuard, async (req: Request, res: Response): Promise<void> => {
  try {
    const details = await placeDetails(req.params['placeId']!);
    res.json({ success: true, data: details });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'Place details failed' });
  }
});

// GET /geo/reverse?lat=&lng=
router.get('/reverse', anyAuth, geoGuard, async (req: Request, res: Response): Promise<void> => {
  const lat = parseFloat(String(req.query['lat'] ?? ''));
  const lng = parseFloat(String(req.query['lng'] ?? ''));
  if (isNaN(lat) || isNaN(lng)) { res.status(400).json({ success: false, error: 'lat and lng are required' }); return; }
  try {
    const address = await reverseGeocode(lat, lng);
    res.json({ success: true, data: { address } });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'Reverse geocode failed' });
  }
});

// GET /geo/directions?originLat=&originLng=&destLat=&destLng=
router.get('/directions', anyAuth, geoGuard, async (req: Request, res: Response): Promise<void> => {
  const originLat = parseFloat(String(req.query['originLat'] ?? ''));
  const originLng = parseFloat(String(req.query['originLng'] ?? ''));
  const destLat   = parseFloat(String(req.query['destLat']   ?? ''));
  const destLng   = parseFloat(String(req.query['destLng']   ?? ''));
  if ([originLat, originLng, destLat, destLng].some(isNaN)) {
    res.status(400).json({ success: false, error: 'originLat, originLng, destLat, destLng are required' });
    return;
  }
  try {
    const route = await directions(originLat, originLng, destLat, destLng);
    res.json({ success: true, data: route });
  } catch (err) {
    res.status(502).json({ success: false, error: err instanceof Error ? err.message : 'Directions failed' });
  }
});

export default router;
