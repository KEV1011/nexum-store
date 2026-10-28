// ── El equipo del negocio: quién abre el portal y con qué rol ────────────────
//
// Un enlace de portal es o el del dueño (`Business.token`) o el de una persona
// del equipo (`BusinessStaff.token`). `resolverAccesoPortal` es la ÚNICA
// función que convierte un enlace en {negocio, rol}: la usan el guardia de las
// rutas, el WebSocket y `getBusinessByToken`, así un enlace revocado deja de
// abrir en todos a la vez.

import { randomBytes } from 'crypto';
import type { Business as BusinessRow, BusinessStaff } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { esRolPersonal, NOMBRE_DEL_ROL, type RolPersonal, type RolPortal } from '../lib/permisos-portal';

export interface AccesoPortal {
  business: BusinessRow;
  rol: RolPortal;
  /** Null si es el dueño. */
  staff: Pick<BusinessStaff, 'id' | 'name' | 'role'> | null;
}

/** Un negocio no tiene más equipo que esto: más es un error del portal. */
export const MAX_PERSONAL = 50;

/** Cada cuánto se apunta «último acceso»: en cada petición sería una escritura por clic. */
const TOQUE_MIN_MS = 5 * 60_000;

/** Quien cierra la sesión de una persona revocada (lo registra el WebSocket). */
let _cerrarSesiones: ((businessId: string, staffId: string) => void) | null = null;
export function registerCerrarSesionPersonal(fn: (businessId: string, staffId: string) => void): void {
  _cerrarSesiones = fn;
}

/**
 * El enlace → {negocio, rol}. Null si no es de nadie, si la persona fue
 * revocada o si el negocio está desactivado.
 */
export async function resolverAccesoPortal(token: string): Promise<AccesoPortal | null> {
  if (!token) return null;
  const negocio = await prisma.business.findUnique({ where: { token } });
  if (negocio) return { business: negocio, rol: 'DUENO', staff: null };

  const persona = await prisma.businessStaff.findUnique({
    where: { token },
    include: { business: true },
  });
  if (!persona || !persona.active || !esRolPersonal(persona.role)) return null;
  if (!persona.lastSeenAt || Date.now() - persona.lastSeenAt.getTime() > TOQUE_MIN_MS) {
    // Sin esperar: un fallo al apuntar la hora no puede cerrarle el portal a nadie.
    void prisma.businessStaff
      .update({ where: { id: persona.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }
  return {
    business: persona.business,
    rol: persona.role,
    staff: { id: persona.id, name: persona.name, role: persona.role },
  };
}

export interface PersonaDTO {
  id: string;
  nombre: string;
  rol: RolPersonal;
  rolNombre: string;
  /** El enlace se devuelve: el dueño lo vuelve a compartir si se perdió. */
  token: string;
  activo: boolean;
  ultimoAcceso: string | null;
  creado: string;
}

function _dto(p: BusinessStaff): PersonaDTO {
  return {
    id: p.id,
    nombre: p.name,
    rol: p.role,
    rolNombre: NOMBRE_DEL_ROL[p.role],
    token: p.token,
    activo: p.active,
    ultimoAcceso: p.lastSeenAt?.toISOString() ?? null,
    creado: p.createdAt.toISOString(),
  };
}

export async function listarPersonal(businessId: string): Promise<PersonaDTO[]> {
  const filas = await prisma.businessStaff.findMany({
    where: { businessId, active: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  return filas.map(_dto);
}

/**
 * Una llave larga y aleatoria. No sale de `cuid()` a propósito: un cuid es
 * único, no impredecible, y esta llave es lo único que protege el portal.
 */
function _llave(): string {
  return `p_${randomBytes(18).toString('base64url')}`;
}

export async function crearPersonal(
  businessId: string,
  datos: { nombre?: unknown; rol?: unknown },
): Promise<PersonaDTO> {
  const nombre = typeof datos.nombre === 'string' ? datos.nombre.replace(/\s+/g, ' ').trim() : '';
  if (nombre.length < 2) throw new Error('Escribe el nombre de la persona.');
  if (nombre.length > 60) throw new Error('El nombre es muy largo (máximo 60 letras).');
  if (!esRolPersonal(datos.rol)) {
    throw new Error('Elige qué hace: encargado, caja, mesero o cocina.');
  }
  const cuantos = await prisma.businessStaff.count({ where: { businessId, active: true } });
  if (cuantos >= MAX_PERSONAL) {
    throw new Error(`Tu equipo ya tiene ${MAX_PERSONAL} personas. Quita a alguien antes de añadir otra.`);
  }
  const p = await prisma.businessStaff.create({
    data: { businessId, name: nombre, role: datos.rol, token: _llave() },
  });
  return _dto(p);
}

/**
 * Le quita el acceso. No se borra: el pedido que tomó sigue diciendo quién
 * fue, y el dueño puede ver a quién sacó y cuándo. El enlace deja de abrir
 * en la siguiente petición y su conexión en vivo se cierra ya.
 */
export async function revocarPersonal(businessId: string, staffId: string): Promise<void> {
  const r = await prisma.businessStaff.updateMany({
    where: { id: staffId, businessId, active: true },
    data: { active: false, revokedAt: new Date() },
  });
  if (r.count === 0) throw new Error('Esa persona no está en tu equipo.');
  try {
    _cerrarSesiones?.(businessId, staffId);
  } catch {
    // Cerrar la conexión es cortesía: la siguiente petición ya no abre.
  }
}

/**
 * La persona del equipo, si el enlace es de este negocio y está activo. Lo
 * usa la carta pública para apuntar qué mesero tomó el pedido.
 */
export async function personaDelNegocio(
  businessId: string,
  token: unknown,
): Promise<{ id: string; name: string } | null> {
  if (typeof token !== 'string' || !token.startsWith('p_') || token.length > 64) return null;
  const p = await prisma.businessStaff.findUnique({ where: { token } });
  if (!p || !p.active || p.businessId !== businessId) return null;
  return { id: p.id, name: p.name };
}
