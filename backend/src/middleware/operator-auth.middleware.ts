import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/constants';

// Autenticación del Portal de Empresa. Un OperatorMember entra por OTP a su
// teléfono y recibe un JWT con su operatorId + rol. El scope 'operator' evita
// que un token de conductor/cliente/admin sirva aquí.

const OPERATOR_TOKEN_TTL = '12h';

export type OperatorRole = 'OWNER' | 'DISPATCHER' | 'VIEWER';

export interface OperatorJwtPayload {
  operatorId: string;
  memberId: string;
  role: OperatorRole;
  scope: 'operator';
}

export function signOperatorToken(p: {
  operatorId: string;
  memberId: string;
  role: OperatorRole;
}): string {
  const payload: OperatorJwtPayload = {
    operatorId: p.operatorId,
    memberId: p.memberId,
    role: p.role,
    scope: 'operator',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: OPERATOR_TOKEN_TTL });
}

export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'] ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ success: false, error: 'No autorizado.' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as OperatorJwtPayload;
    if (decoded.scope !== 'operator' || !decoded.operatorId) {
      res.status(401).json({ success: false, error: 'No autorizado.' });
      return;
    }
    req.operatorId = decoded.operatorId;
    req.operatorMemberId = decoded.memberId;
    req.operatorRole = decoded.role;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Sesión expirada. Vuelve a ingresar.' });
  }
}

/** Exige uno de los roles dados (p. ej. solo OWNER/DISPATCHER pueden escribir). */
export function requireOperatorRole(...roles: OperatorRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.operatorRole || !roles.includes(req.operatorRole as OperatorRole)) {
      res.status(403).json({ success: false, error: 'No tienes permiso para esta acción.' });
      return;
    }
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      operatorId?: string;
      operatorMemberId?: string;
      operatorRole?: string;
    }
  }
}
