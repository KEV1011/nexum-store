import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getTripService } from '../services/trip.service';

const router = Router();

router.use(authMiddleware);

// GET /trips/active
router.get('/active', async (_req: Request, res: Response): Promise<void> => {
  const trip = getTripService().getActiveTrip();
  res.status(200).json({ success: true, data: trip ?? null });
});

// POST /trips/:id/accept
router.post('/:id/accept', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const trip = await getTripService().acceptTrip(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not accept trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/reject
router.post('/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const trip = await getTripService().rejectTrip(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reject trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/start  → going_to_pickup
router.post('/:id/start', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const trip = await getTripService().startTrip(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/arrive  → arrived_at_pickup
router.post('/:id/arrive', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const trip = await getTripService().arriveAtPickup(id);
    res.status(200).json({ success: true, data: trip });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

// POST /trips/:id/finish  → completed, returns TripSummaryDTO
router.post('/:id/finish', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const summary = await getTripService().finishTrip(id, req.driverId);
    res.status(200).json({ success: true, data: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not finish trip';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

export default router;
