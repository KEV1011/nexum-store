import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';
import { JwtPayload } from '../types';
import { conductorBorrado } from './deleted-account';

// Extend the Express Request type to carry the decoded driver identity
declare global {
  namespace Express {
    interface Request {
      driverId?: string;
      driverPhone?: string;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expired' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  // El token de una cuenta eliminada sigue siendo válido criptográficamente
  // durante 30 días: sin esto, el conductor "borrado" seguiría trabajando.
  if (await conductorBorrado(decoded.driverId)) {
    res.status(401).json({ success: false, error: 'Esta cuenta fue eliminada.' });
    return;
  }

  req.driverId = decoded.driverId;
  req.driverPhone = decoded.phone;
  next();
}
