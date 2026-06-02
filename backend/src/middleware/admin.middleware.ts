import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';
import { JwtPayload } from '../types';

/**
 * Verifies a Bearer JWT and ensures the caller has the `admin` role claim.
 * Reuses the same token scheme as authMiddleware but gates on role.
 */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (decoded.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Admin privileges required' });
      return;
    }
    req.driverId = decoded.driverId;
    req.driverPhone = decoded.phone;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expired' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}
