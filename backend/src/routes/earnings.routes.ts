import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getDailyEarnings, getWeeklyHistory, getDriverTripHistory } from '../services/earnings.service';

const router = Router();

router.use(authMiddleware);

// GET /earnings/daily
router.get('/daily', async (req: Request, res: Response): Promise<void> => {
  const data = await getDailyEarnings(req.driverId);
  res.status(200).json({ success: true, data });
});

// GET /earnings/weekly
router.get('/weekly', async (req: Request, res: Response): Promise<void> => {
  const data = await getWeeklyHistory(req.driverId);
  res.status(200).json({ success: true, data });
});

// GET /earnings/history — viajes completados del conductor (historial real).
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  if (!req.driverId) { res.status(401).json({ success: false, error: 'No autenticado' }); return; }
  const data = await getDriverTripHistory(req.driverId);
  res.status(200).json({ success: true, data });
});

export default router;
