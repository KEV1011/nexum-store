import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';
import { verifyClientToken } from '../services/client.service';
import {
  isGeoConfigured,
  autocomplete,
  placeDetails,
  reverseGeocode,
  directions,
} from '../services/geo.service';

const router = Router();

// Auth: accepts either a client token or a driver token.
router.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  const token = auth.slice(7);
  try {
    verifyClientToken(token);
    return next();
  } catch {
    // not a client token — try driver token
  }
  try {
    jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
});

function geoCheck(res: import('express').Response): boolean {
  if (!isGeoConfigured()) {
    res.status(503).json({ success: false, error: 'Geo service not configured' });
    return false;
  }
  return true;
}

// GET /geo/autocomplete?input=&lat=&lng=
router.get('/autocomplete', async (req, res) => {
  if (!geoCheck(res)) return;
  const { input, lat, lng } = req.query as Record<string, string>;
  if (!input) { res.status(400).json({ success: false, error: 'input is required' }); return; }
  try {
    const suggestions = await autocomplete(
      input,
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
    );
    res.json({ success: true, data: suggestions });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Geo error' });
  }
});

// GET /geo/place/:placeId
router.get('/place/:placeId', async (req, res) => {
  if (!geoCheck(res)) return;
  try {
    const details = await placeDetails(req.params['placeId']!);
    res.json({ success: true, data: details });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Geo error' });
  }
});

// GET /geo/reverse?lat=&lng=
router.get('/reverse', async (req, res) => {
  if (!geoCheck(res)) return;
  const lat = parseFloat(req.query['lat'] as string);
  const lng = parseFloat(req.query['lng'] as string);
  if (isNaN(lat) || isNaN(lng)) { res.status(400).json({ success: false, error: 'lat and lng are required' }); return; }
  try {
    const address = await reverseGeocode(lat, lng);
    res.json({ success: true, data: address });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Geo error' });
  }
});

// GET /geo/directions?originLat=&originLng=&destLat=&destLng=
router.get('/directions', async (req, res) => {
  if (!geoCheck(res)) return;
  const originLat = parseFloat(req.query['originLat'] as string);
  const originLng = parseFloat(req.query['originLng'] as string);
  const destLat = parseFloat(req.query['destLat'] as string);
  const destLng = parseFloat(req.query['destLng'] as string);
  if ([originLat, originLng, destLat, destLng].some(isNaN)) {
    res.status(400).json({ success: false, error: 'originLat, originLng, destLat, destLng are required' });
    return;
  }
  try {
    const route = await directions(originLat, originLng, destLat, destLng);
    res.json({ success: true, data: route });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Geo error' });
  }
});

export default router;
