import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, NODE_ENV } from '../config/constants';

// Teléfono admin demo para desarrollo: permite entrar al panel sin configurar
// nada. En producción NO se usa — allí ADMIN_PHONES debe definirse explícito o
// el panel queda cerrado.
const DEV_ADMIN_PHONE = '+573150000000';

// Admin phones are stored in the ADMIN_PHONES env var as comma-separated values.
// Example: ADMIN_PHONES="+573001234567,+573009876543"
//
// Un teléfono puede además quedar ATADO A UNA PLAZA con `:slug`:
//
//   ADMIN_PHONES="+573001234567,+573009876543:cucuta"
//
// El primero ve toda la plataforma; el segundo solo Cúcuta. Es lo que hace
// posible que la operación de una ciudad la lleve alguien de esa ciudad sin
// darle acceso a las demás: la ciudad viaja dentro del token y el servidor
// IGNORA el filtro que pida el navegador — de nada sirve un desplegable si
// basta con cambiar la URL.
export function getAdminPhones(): Map<string, string | null> {
  const raw = process.env['ADMIN_PHONES'] ?? '';
  const entradas = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((entrada): [string, string | null] => {
      const i = entrada.indexOf(':');
      if (i < 0) return [entrada, null];
      const plaza = entrada.slice(i + 1).trim().toLowerCase();
      return [entrada.slice(0, i).trim(), plaza || null];
    });

  // En desarrollo, si no se configuró ADMIN_PHONES, se habilita el teléfono
  // demo para poder abrir el panel (login OTP con el código de dev 123456).
  if (entradas.length === 0 && NODE_ENV !== 'production') {
    return new Map([[DEV_ADMIN_PHONE, null]]);
  }
  return new Map(entradas);
}

export function isAdminPhone(phone: string): boolean {
  return getAdminPhones().has(phone.trim());
}

/** Plaza a la que está atado ese admin, o null si ve toda la plataforma. */
export function adminCityOf(phone: string): string | null {
  return getAdminPhones().get(phone.trim()) ?? null;
}

const ADMIN_TOKEN_TTL = '12h';

export interface AdminJwtPayload {
  phone: string;
  role: 'admin';
  /** Plaza del admin. Ausente = toda la plataforma. */
  city?: string | null;
}

export function signAdminToken(phone: string): string {
  const payload: AdminJwtPayload = { phone, role: 'admin', city: adminCityOf(phone) };
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
    // La plaza se relee de la configuración, no del token: quitarle o cambiarle
    // la ciudad a alguien tiene efecto ya, sin esperar a que caduque su sesión.
    req.adminCity = adminCityOf(decoded.phone);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Sesión expirada. Vuelve a ingresar.' });
  }
}

/**
 * Qué plaza aplica a esta petición.
 *
 * Un admin atado a una ciudad SIEMPRE ve la suya, mande lo que mande en la
 * URL. Uno global ve todo, o la que pida en `?ciudad=`.
 */
export function plazaDeLaPeticion(req: Request): string | null {
  if (req.adminCity) return req.adminCity;
  const q = req.query['ciudad'];
  const slug = typeof q === 'string' ? q.trim().toLowerCase() : '';
  return slug || null;
}

// Extend Express Request type.
declare global {
  namespace Express {
    interface Request {
      adminPhone?: string;
      adminCity?: string | null;
    }
  }
}
