import { Router, Request, Response } from 'express';
import { isValidColombianPhone, sendOtp, verifyOtp, registerDriver, verifyToken } from '../services/auth.service';
import { OtpRateLimitError } from '../services/otp.service';
import { RegisterDriverDTO } from '../types';

const router = Router();

// POST /auth/send-otp
router.post('/send-otp', async (req: Request, res: Response): Promise<void> => {
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

  try {
    await sendOtp(phone);
    res.status(200).json({ success: true, data: { success: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send OTP';
    res.status(err instanceof OtpRateLimitError ? 429 : 500).json({ success: false, error: message });
  }
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
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
    const result = await verifyOtp(phone, otp);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OTP verification failed';
    res.status(401).json({ success: false, error: message });
  }
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const dto = req.body as Partial<RegisterDriverDTO>;

  if (!dto.phone || typeof dto.phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }

  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    const token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : authHeader;
    try {
      const decoded = verifyToken(token);
      if (decoded.phone !== dto.phone) {
        res.status(403).json({ success: false, error: 'Token phone does not match request phone' });
        return;
      }
    } catch {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }
  } else {
    res.status(401).json({ success: false, error: 'Authorization header with Bearer token is required' });
    return;
  }

  if (!dto.fullName || typeof dto.fullName !== 'string') {
    res.status(400).json({ success: false, error: 'fullName is required' });
    return;
  }
  if (!dto.documentType || !['CC', 'CE', 'PA'].includes(dto.documentType)) {
    res.status(400).json({ success: false, error: 'documentType must be CC, CE, or PA' });
    return;
  }
  if (!dto.documentNumber || typeof dto.documentNumber !== 'string') {
    res.status(400).json({ success: false, error: 'documentNumber is required' });
    return;
  }
  if (!dto.vehicleBrand || typeof dto.vehicleBrand !== 'string') {
    res.status(400).json({ success: false, error: 'vehicleBrand is required' });
    return;
  }
  if (!dto.vehicleModel || typeof dto.vehicleModel !== 'string') {
    res.status(400).json({ success: false, error: 'vehicleModel is required' });
    return;
  }
  if (typeof dto.vehicleYear !== 'number') {
    res.status(400).json({ success: false, error: 'vehicleYear is required and must be a number' });
    return;
  }
  if (!dto.vehiclePlate || typeof dto.vehiclePlate !== 'string') {
    res.status(400).json({ success: false, error: 'vehiclePlate is required' });
    return;
  }
  if (!dto.vehicleColor || typeof dto.vehicleColor !== 'string') {
    res.status(400).json({ success: false, error: 'vehicleColor is required' });
    return;
  }
  if (!dto.vehicleType || !['particular', 'taxi'].includes(dto.vehicleType)) {
    res.status(400).json({ success: false, error: 'vehicleType must be particular or taxi' });
    return;
  }
  if (!dto.bankName || typeof dto.bankName !== 'string') {
    res.status(400).json({ success: false, error: 'bankName is required' });
    return;
  }
  if (!dto.bankAccountType || !['Ahorros', 'Corriente'].includes(dto.bankAccountType)) {
    res.status(400).json({ success: false, error: 'bankAccountType must be Ahorros or Corriente' });
    return;
  }
  if (!dto.bankAccountNumber || typeof dto.bankAccountNumber !== 'string') {
    res.status(400).json({ success: false, error: 'bankAccountNumber is required' });
    return;
  }

  const validatedDto: RegisterDriverDTO = {
    phone: dto.phone,
    fullName: dto.fullName,
    documentType: dto.documentType,
    documentNumber: dto.documentNumber,
    vehicleBrand: dto.vehicleBrand,
    vehicleModel: dto.vehicleModel,
    vehicleYear: dto.vehicleYear,
    vehiclePlate: dto.vehiclePlate,
    vehicleColor: dto.vehicleColor,
    vehicleType: dto.vehicleType,
    bankName: dto.bankName,
    bankAccountType: dto.bankAccountType,
    bankAccountNumber: dto.bankAccountNumber,
  };

  try {
    const result = await registerDriver(validatedDto);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Driver registration failed';
    res.status(400).json({ success: false, error: message });
  }
});

export default router;
