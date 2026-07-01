import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, NODE_ENV } from '../config/constants';

// Teléfono admin demo para desarrollo: permite entrar al panel sin configurar
// nada. En producción NO se usa — allí ADMIN_PHONES debe definirse explícito o
// el panel queda cerrado.
const DEV_ADMIN_PHONE = '+573150000000';

// Admin phones are stored in the ADMIN_PHONES env var as comma-separated values.
// Example: ADMIN_PHONES="+573001234567,+573009876543"
export function getAdminPhones(): Set<string> {
  const raw = process.env['ADMIN_PHONES'] ?? '';
  const phones = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // En desarrollo, si no se configuró ADMIN_PHONES, se habilita el teléfono
  // demo para poder abrir el panel (login OTP con el código de dev 123456).
  if (phones.length === 0 && NODE_ENV !== 'production') {
    return new Set([DEV_ADMIN_PHONE]);
  }
  return new Set(phones);
}

export function isAdminPhone(phone: string): boolean {
  return getAdminPhones().has(phone.trim());
}

const ADMIN_TOKEN_TTL = '12h';

export interface AdminJwtPayload {
  phone: string;
  role: 'admin';
}

export function signAdminToken(phone: string): string {
  const payload: AdminJwtPayload = { phone, role: 'admin' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ADMIN_TOKEN_TTL });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (getAdminPhones().size === 0) {
    res.status(503).json({ success: false, error: 'Panel de admin no configurado (ADMIN_PHONES vacío).' });
    return;
  }

  // JWT de admin emitido por /admin/auth/verify-otp. El teléfono dentro del
  // token debe seguir en la lista blanca: revocar = quitarlo de ADMIN_PHONES.
  const header = req.headers['authorization'] ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ success: false, error: 'No autorizado.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminJwtPayload;
    if (decoded.role !== 'admin' || !isAdminPhone(decoded.phone)) {
      res.status(401).json({ success: false, error: 'No autorizado.' });
      return;
    }
    req.adminPhone = decoded.phone;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Sesión expirada. Vuelve a ingresar.' });
  }
}

// Extend Express Request type.
declare global {
  namespace Express {
    interface Request {
      adminPhone?: string;
    }
  }
}
