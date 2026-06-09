import { Request, Response, NextFunction } from 'express';

// Admin phones are stored in the ADMIN_PHONES env var as comma-separated values.
// Example: ADMIN_PHONES="+573001234567,+573009876543"
function getAdminPhones(): Set<string> {
  const raw = process.env['ADMIN_PHONES'] ?? '';
  return new Set(
    raw.split(',')
      .map((p) => p.trim())
      .filter(Boolean),
  );
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminPhones = getAdminPhones();
  if (adminPhones.size === 0) {
    res.status(503).json({ success: false, error: 'Panel de admin no configurado (ADMIN_PHONES vacío).' });
    return;
  }

  // Admin auth: Bearer token where the token IS the admin phone (simple, no JWT).
  // For production, upgrade to a proper admin JWT or session.
  const header = req.headers['authorization'] ?? '';
  const phone = header.replace(/^Bearer\s+/i, '').trim();

  if (!phone || !adminPhones.has(phone)) {
    res.status(401).json({ success: false, error: 'No autorizado.' });
    return;
  }

  // Attach the admin identifier for audit trail.
  req.adminPhone = phone;
  next();
}

// Extend Express Request type.
declare global {
  namespace Express {
    interface Request {
      adminPhone?: string;
    }
  }
}
