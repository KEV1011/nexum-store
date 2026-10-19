// ── ¿Este JWT es de un CONDUCTOR? ────────────────────────────────────────────
//
// Todas las sesiones del sistema se firman con el MISMO secreto: conductor,
// pasajero, empresa, admin, y también el enlace de «compartir viaje» que el
// pasajero le manda a un familiar. Las demás puertas comprueban de quién es el
// token (`role: 'client'`, `scope: 'operator'`, `role: 'admin'`); la del
// conductor solo comprobaba la firma.
//
// Resultado: el token de un pasajero —o el enlace de seguimiento que circula
// por WhatsApp— pasaba la puerta del conductor con `driverId` VACÍO. Y en
// Prisma, `where: { driverId: undefined }` no filtra por nada: devuelve las
// filas de todo el mundo. Que eso no se haya explotado depende de que cada
// ruta se acordara de su propia guarda, que es exactamente el tipo de
// seguridad que falla en la ruta nueva de la semana que viene.

/** Lo que lleva un token de conductor. */
export interface PayloadConductor {
  driverId: string;
  phone: string;
}

/**
 * Un token de conductor trae `driverId` y NO trae las marcas de las otras
 * sesiones. Se mira lo segundo además de lo primero para que un token futuro
 * que por descuido incluya un `driverId` (un admin «viendo como» un
 * conductor, por ejemplo) no se cuele por aquí.
 */
export function esPayloadDeConductor(decoded: unknown): decoded is PayloadConductor {
  if (!decoded || typeof decoded !== 'object') return false;
  const d = decoded as Record<string, unknown>;
  if (typeof d['driverId'] !== 'string' || d['driverId'].trim() === '') return false;
  if ('role' in d || 'scope' in d || 'purpose' in d || 'clientId' in d) return false;
  return true;
}
