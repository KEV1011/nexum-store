import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { MOCK_DRIVER } from '../config/constants';
import { getTripService } from '../services/trip.service';

const router = Router();

router.use(authMiddleware);

// GET /driver/profile
router.get('/profile', (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: MOCK_DRIVER });
});

// GET /driver/status
router.get('/status', (_req: Request, res: Response): void => {
  const svc = getTripService();
  res.status(200).json({
    success: true,
    data: {
      status: svc.getDriverStatus(),
      dailyTrips: svc.getDailyTrips(),
      dailyEarnings: svc.getDailyEarnings(),
    },
  });
});

// PUT /driver/status  – only allows online/offline
router.put('/status', (req: Request, res: Response): void => {
  const { status } = req.body as { status?: string };

  if (!status || (status !== 'online' && status !== 'offline')) {
    res.status(400).json({ success: false, error: 'status must be "online" or "offline"' });
    return;
  }

  const svc = getTripService();
  svc.setDriverStatus(status);

  res.status(200).json({
    success: true,
    data: {
      status,
      dailyTrips: svc.getDailyTrips(),
      dailyEarnings: svc.getDailyEarnings(),
    },
  });
});

export default router;
