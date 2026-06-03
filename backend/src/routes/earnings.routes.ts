import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getDailyEarnings, getWeeklyHistory } from '../services/earnings.service';
import { MOCK_DRIVER } from '../config/constants';

const router = Router();

router.use(authMiddleware);

router.get('/daily', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const data = await getDailyEarnings(driverId);
  res.status(200).json({ success: true, data });
});

router.get('/weekly', async (req: Request, res: Response): Promise<void> => {
  const driverId = req.driverId ?? MOCK_DRIVER.id;
  const data = await getWeeklyHistory(driverId);
  res.status(200).json({ success: true, data });
});

export default router;
