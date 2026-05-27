import { Router, Request, Response } from 'express';
import { isValidColombianPhone, sendOtp, verifyOtp } from '../services/auth.service';

const router = Router();

// POST /auth/send-otp
router.post('/send-otp', (req: Request, res: Response): void => {
  const { phone } = req.body as { phone?: string };

  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }

  if (!isValidColombianPhone(phone)) {
    res.status(400).json({
      success: false,
      error: 'Invalid Colombian phone number. Expected format: +57 3XX XXX XXXX',
    });
    return;
  }

  sendOtp(phone);
  res.status(200).json({ success: true, data: { success: true } });
});

// POST /auth/verify-otp
router.post('/verify-otp', (req: Request, res: Response): void => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };

  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }

  if (!otp || typeof otp !== 'string') {
    res.status(400).json({ success: false, error: 'otp is required' });
    return;
  }

  try {
    const result = verifyOtp(phone, otp);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OTP verification failed';
    res.status(401).json({ success: false, error: message });
  }
});

export default router;
