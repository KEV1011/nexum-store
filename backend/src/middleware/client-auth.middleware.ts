import { Request, Response, NextFunction } from 'express';
import { verifyClientToken } from '../services/client.service';

declare global {
  namespace Express {
    interface Request {
      clientId?: string;
      clientPhone?: string;
    }
  }
}

export function clientAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
    return;
  }

  try {
    const payload = verifyClientToken(authHeader.slice(7));
    req.clientId = payload.clientId;
    req.clientPhone = payload.phone;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired client token' });
  }
}
