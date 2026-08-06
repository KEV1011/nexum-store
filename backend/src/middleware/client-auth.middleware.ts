import { Request, Response, NextFunction } from 'express';
import { verifyClientToken } from '../services/client.service';
import { clienteBorrado } from './deleted-account';

declare global {
  namespace Express {
    interface Request {
      clientId?: string;
      clientPhone?: string;
    }
  }
}

export async function clientAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
    return;
  }

  let clientId: string;
  let phone: string;
  try {
    const payload = verifyClientToken(authHeader.slice(7));
    clientId = payload.clientId;
    phone = payload.phone;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired client token' });
    return;
  }

  // El token de una cuenta eliminada sigue siendo válido criptográficamente
  // durante 30 días: sin esto, "eliminé mi cuenta" y la app seguiría pidiendo
  // viajes con ella.
  if (await clienteBorrado(clientId)) {
    res.status(401).json({ success: false, error: 'Esta cuenta fue eliminada.' });
    return;
  }

  req.clientId = clientId;
  req.clientPhone = phone;
  next();
}
