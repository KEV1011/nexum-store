import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getTripService } from '../services/trip.service';

const router = Router();

router.use(authMiddleware);

// GET /trips/active
router.get('/active', (_req: Request, res: Response): void => {
  const trip = getTripService().getActiveTrip();
  res.status(200).json({ success: true, data: trip ?? null });
});

// POST /trips/:id/accept
router.post('/:id/accept', (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  try {
    const trip = getTripService().acceptTrip(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not accept trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/reject
router.post('/:id/reject', (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  try {
    const trip = getTripService().rejectTrip(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reject trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/start  → going_to_pickup
router.post('/:id/start', (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  try {
    const trip = getTripService().startTrip(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/arrive  → arrived_at_pickup
router.post('/:id/arrive', (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  try {
    const trip = getTripService().arriveAtPickup(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/finish  → completed, returns TripSummaryDTO
router.post('/:id/finish', (req: Request, res: Response): void => {
  const { id } = req.params as { id: string };
  try {
    // finishTrip already records earnings internally
    const summary = getTripService().finishTrip(id);
    res.status(200).json({ success: true, data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not finish trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

export default router;
