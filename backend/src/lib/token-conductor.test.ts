/**
 * La puerta del conductor deja pasar SOLO tokens de conductor.
 *
 * Todas las sesiones se firman con el mismo secreto, así que la firma no dice
 * de quién es el token. Antes de esta guarda, el token de un pasajero —o el
 * enlace de «compartir viaje» que circula por WhatsApp— entraba a las rutas
 * del conductor con `driverId` vacío, que en Prisma es «sin filtro».
 */
import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

vi.mock('../middleware/deleted-account', () => ({ conductorBorrado: async () => false }));

import { esPayloadDeConductor } from './token-conductor';
import { authMiddleware } from '../middleware/auth.middleware';
import { verifyToken } from '../services/auth.service';
import { JWT_SECRET } from '../config/constants';

describe('qué payload es de conductor', () => {
  it('el del conductor sí', () => {
    expect(esPayloadDeConductor({ driverId: 'd1', phone: '+573001112233' })).toBe(true);
  });

  it.each([
    ['pasajero', { clientId: 'u1', phone: '+57300', role: 'client' }],
    ['empresa', { operatorId: 'o1', memberId: 'm1', role: 'OWNER', scope: 'operator' }],
    ['admin', { phone: '+57300', role: 'admin' }],
    ['compartir viaje', { tripId: 't1', purpose: 'trip_share' }],
    ['vacío', {}],
    ['driverId en blanco', { driverId: '  ', phone: 'x' }],
    // Un token futuro que meta un driverId junto a otra marca no se cuela.
    ['admin con driverId', { driverId: 'd1', role: 'admin' }],
  ])('el de %s no', (_n, p) => {
    expect(esPayloadDeConductor(p)).toBe(false);
  });
});

function correr(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
  let status = 200;
  const res = {
    status(s: number) { status = s; return this; },
    json() { return this; },
  } as unknown as Response;
  let paso = false;
  return authMiddleware(req, res, () => { paso = true; }).then(() => ({ status, paso, req }));
}

describe('el middleware y el WebSocket aplican la regla', () => {
  it('un token de conductor entra con su id', async () => {
    const r = await correr(jwt.sign({ driverId: 'd1', phone: 'x' }, JWT_SECRET));
    expect(r.paso).toBe(true);
    expect(r.req.driverId).toBe('d1');
  });

  it('el de un pasajero se rechaza (antes entraba con driverId vacío)', async () => {
    const r = await correr(jwt.sign({ clientId: 'u1', phone: 'x', role: 'client' }, JWT_SECRET));
    expect(r.paso).toBe(false);
    expect(r.status).toBe(401);
  });

  it('el enlace de compartir viaje también', async () => {
    const r = await correr(jwt.sign({ tripId: 't1', purpose: 'trip_share' }, JWT_SECRET));
    expect(r.paso).toBe(false);
  });

  it('verifyToken (el del WebSocket) rechaza lo mismo', () => {
    expect(() => verifyToken(jwt.sign({ clientId: 'u1', role: 'client' }, JWT_SECRET))).toThrow();
    expect(verifyToken(jwt.sign({ driverId: 'd1', phone: 'x' }, JWT_SECRET)).driverId).toBe('d1');
  });
});
