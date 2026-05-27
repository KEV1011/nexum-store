import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getDailyEarnings, getWeeklyHistory } from '../services/earnings.service';

const router = Router();

router.use(authMiddleware);

// GET /earnings/daily
router.get('/daily', (_req: Request, res: Response): void => {
  const data = getDailyEarnings();
  res.status(200).json({ success: true, data });
});

// GET /earnings/weekly
router.get('/weekly', (_req: Request, res: Response): void => {
  const data = getWeeklyHistory();
  res.status(200).json({ success: true, data });
});

export default router;
