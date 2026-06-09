import { Router, Request } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';
import { JwtPayload } from '../types';
import { verifyClientToken } from '../services/client.service';
import {
  recordEmergencyEvent,
  getTrustedContact,
  setTrustedContact,
  createTripShareToken,
  getSharedTripStatus,
  SafetyRole,
} from '../services/safety.service';

const router = Router();

// Resolve the caller from either a client or a driver bearer token. SOS and
// trusted-contact management are available to both passenger and driver apps.
function resolveActor(req: Request): { role: SafetyRole; actorId: string } | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  try {
    const payload = verifyClientToken(token);
    return { role: 'client', actorId: payload.clientId };
  } catch { /* not a client token — try driver */ }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (decoded.driverId) return { role: 'driver', actorId: decoded.driverId };
  } catch { /* not a driver token either */ }

  return null;
}

// ─── SOS panic button ─────────────────────────────────────────────────────────

router.post('/sos', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }

  const { tripId, lat, lng, type } = req.body as {
    tripId?: string; lat?: number; lng?: number; type?: 'PANIC' | 'SHARE';
  };
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ success: false, error: 'lat and lng are required numbers' });
    return;
  }

  try {
    const result = await recordEmergencyEvent({
      role: actor.role, actorId: actor.actorId, tripId, lat, lng, type,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to record SOS' });
  }
});

// ─── Trusted contact ────────────────────────────────────────────────────────

router.get('/trusted-contact', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }
  res.json({ success: true, data: await getTrustedContact(actor.role, actor.actorId) });
});

router.put('/trusted-contact', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }

  const { name, phone } = req.body as { name?: string; phone?: string };
  if (!name?.trim() || !phone?.trim()) {
    res.status(400).json({ success: false, error: 'name and phone are required' });
    return;
  }
  try {
    const saved = await setTrustedContact(actor.role, actor.actorId, name, phone);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to save contact' });
  }
});

// ─── Share trip with trusted contact ──────────────────────────────────────────

router.post('/share-trip', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) { res.status(401).json({ success: false, error: 'Authentication required' }); return; }

  const { tripId } = req.body as { tripId?: string };
  if (!tripId) { res.status(400).json({ success: false, error: 'tripId is required' }); return; }

  const share = await createTripShareToken(actor.role, actor.actorId, tripId);
  if (!share) { res.status(404).json({ success: false, error: 'Trip not found or not yours' }); return; }
  res.status(201).json({ success: true, data: share });
});

// Public tracking endpoint for the trusted contact. The opaque token carries no
// PII; the response is a minimal, sanitised view (no phones, fares, full names).
router.get('/track/:token', async (req, res) => {
  const status = await getSharedTripStatus(req.params['token']!);
  if (!status) { res.status(404).json({ success: false, error: 'Invalid or expired tracking link' }); return; }
  res.json({ success: true, data: status });
});

export default router;
