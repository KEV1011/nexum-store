// ── Borrado de cuenta a petición del titular ─────────────────────────────────
//
// App Store y Play exigen que quien crea una cuenta desde la app pueda
// borrarla desde la app. Sin esto, la ficha se rechaza en revisión.
//
// Pero "borrar" no puede ser DELETE FROM. Los viajes de esta plataforma están
// LIQUIDADOS: llevan tarifa cobrada, comisión de la plataforma y neto pagado al
// conductor; alimentan el panel financiero de la empresa, sus cuentas de cobro
// y sus remitos firmados. Borrar la fila del pasajero se llevaría por delante
// la contabilidad del conductor y de la flota, que no son datos suyos: son de
// terceros y hay obligación de conservarlos.
//
// Lo que se borra es la PERSONA, no el hecho. Se anonimiza:
//
//  · el teléfono pasa a un valor lápida (`borrado:<id>`), así nadie puede
//    volver a entrar con esa cuenta y el número real queda libre para
//    registrarse de nuevo desde cero, con historial limpio;
//  · nombre, correo, foto, selfie, contacto de confianza y token de push se
//    van — es lo que identifica a una persona;
//  · el viaje conserva importes y fechas, y queda atado a "Usuario eliminado".
//
// Un servicio EN CURSO bloquea el borrado. No es burocracia: alguien va en el
// coche, o hay un flete a medio camino, y el conductor necesita saber a quién
// lleva y adónde. Se termina o se cancela, y entonces sí.

import { prisma } from '../lib/prisma';
import { olvidarCuenta } from '../middleware/deleted-account';

export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

/** Prefijo del teléfono lápida. Nunca puede casar con un número real. */
export const TOMBSTONE_PREFIX = 'borrado:';

/** Lo que queda después de borrar, para poder decírselo al titular. */
export interface ResumenBorrado {
  /** Servicios liquidados que se conservan, ya sin dueño identificable. */
  serviciosConservados: number;
  borradoEn: string;
}

// Estados "vivos" de cada servicio: los que significan que alguien está
// esperando o en camino. Se listan explícitamente en vez de excluir COMPLETED y
// CANCELLED porque añadir un estado nuevo al enum debe obligar a decidir aquí
// si bloquea el borrado, no colarse por omisión.
const ESTADOS_VIVOS_TRIP = ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'] as const;
const ESTADOS_VIVOS_ORDER = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'DRIVER_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT',
] as const;
const ESTADOS_VIVOS_ERRAND = ['SEARCHING', 'ACCEPTED', 'SHOPPING', 'ON_THE_WAY'] as const;
const ESTADOS_VIVOS_INTERCITY = [
  'SEARCHING', 'DRIVER_FOUND', 'CONFIRMED', 'DRIVER_TO_PICKUP', 'AT_PICKUP', 'IN_PROGRESS',
] as const;
const ESTADOS_VIVOS_FREIGHT = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] as const;

// ── Cliente ───────────────────────────────────────────────────────────────────

/**
 * Comprueba que el cliente no tenga nada a medias. Devuelve el motivo del
 * bloqueo, o null si puede borrarse.
 */
export async function motivoBloqueoCliente(userId: string): Promise<string | null> {
  const [viaje, pedido, mandado, intercity, flete] = await Promise.all([
    prisma.trip.count({ where: { passengerId: userId, status: { in: [...ESTADOS_VIVOS_TRIP] } } }),
    prisma.order.count({
      where: { userId, status: { in: [...ESTADOS_VIVOS_ORDER] } },
    }),
    prisma.errand.count({
      where: { userId, status: { in: [...ESTADOS_VIVOS_ERRAND] } },
    }),
    prisma.intercityBooking.count({
      where: { userId, status: { in: [...ESTADOS_VIVOS_INTERCITY] } },
    }),
    prisma.freightRequest.count({
      where: { clientId: userId, status: { in: [...ESTADOS_VIVOS_FREIGHT] } },
    }),
  ]);

  const vivos = viaje + pedido + mandado + intercity + flete;
  if (vivos > 0) {
    return (
      `Tienes ${vivos} servicio${vivos === 1 ? '' : 's'} en curso. Espera a que ` +
      'termine o cancélalo antes de eliminar tu cuenta: el conductor necesita ' +
      'saber a quién lleva y adónde.'
    );
  }
  return null;
}

/** Anonimiza la cuenta del cliente. Idempotente: repetirlo no rompe nada. */
export async function borrarCuentaCliente(userId: string): Promise<ResumenBorrado> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  });
  if (!user) throw new AccountDeletionError('La cuenta no existe.');
  if (user.deletedAt) {
    return { serviciosConservados: 0, borradoEn: user.deletedAt.toISOString() };
  }

  const bloqueo = await motivoBloqueoCliente(userId);
  if (bloqueo) throw new AccountDeletionError(bloqueo);

  const ahora = new Date();
  const conservados = await prisma.trip.count({ where: { passengerId: userId, status: 'COMPLETED' } });

  await prisma.$transaction([
    // Las direcciones guardadas SÍ se borran: son domicilios, no hay ningún
    // tercero con derecho a conservarlos y no sostienen ninguna liquidación.
    prisma.address.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        phone: `${TOMBSTONE_PREFIX}${userId}`,
        name: null,
        email: null,
        avatarUrl: null,
        selfieUrl: null,
        fcmToken: null,
        trustedContactName: null,
        trustedContactPhone: null,
        referralCode: null,
        isActive: false,
        deletedAt: ahora,
      },
    }),
  ]);

  // Sin esto, la caché de un minuto dejaría pasar peticiones con el token
  // viejo justo después de borrar — que es cuando la app aún lo tiene.
  olvidarCuenta('cliente', userId);

  return { serviciosConservados: conservados, borradoEn: ahora.toISOString() };
}

// ── Conductor ─────────────────────────────────────────────────────────────────

/** Motivo por el que un conductor no puede borrarse ahora, o null. */
export async function motivoBloqueoConductor(driverId: string): Promise<string | null> {
  const [viaje, mandado, pedido, intercity, flete, retiro] = await Promise.all([
    prisma.trip.count({ where: { driverId, status: { in: [...ESTADOS_VIVOS_TRIP] } } }),
    prisma.errand.count({
      where: { driverId, status: { in: [...ESTADOS_VIVOS_ERRAND] } },
    }),
    prisma.order.count({
      where: { driverId, status: { in: [...ESTADOS_VIVOS_ORDER] } },
    }),
    prisma.intercityBooking.count({
      where: { driverId, status: { in: [...ESTADOS_VIVOS_INTERCITY] } },
    }),
    prisma.freightRequest.count({
      where: { driverId, status: { in: [...ESTADOS_VIVOS_FREIGHT] } },
    }),
    prisma.payout.count({ where: { driverId, status: { in: ['REQUESTED', 'PROCESSING'] } } }),
  ]);

  const vivos = viaje + mandado + pedido + intercity + flete;
  if (vivos > 0) {
    return (
      `Tienes ${vivos} servicio${vivos === 1 ? '' : 's'} en curso. Termínalo o ` +
      'cancélalo antes de eliminar tu cuenta.'
    );
  }
  // Un retiro pendiente es dinero suyo que aún no ha salido: borrarse aquí es
  // regalárselo a la plataforma sin querer.
  if (retiro > 0) {
    return (
      `Tienes ${retiro} retiro${retiro === 1 ? '' : 's'} pendiente${retiro === 1 ? '' : 's'} ` +
      'de pago. Espera a cobrarlo antes de eliminar tu cuenta.'
    );
  }
  return null;
}

/** Anonimiza la cuenta del conductor y lo deja fuera del despacho. */
export async function borrarCuentaConductor(driverId: string): Promise<ResumenBorrado> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { id: true, deletedAt: true },
  });
  if (!driver) throw new AccountDeletionError('La cuenta no existe.');
  if (driver.deletedAt) {
    return { serviciosConservados: 0, borradoEn: driver.deletedAt.toISOString() };
  }

  const bloqueo = await motivoBloqueoConductor(driverId);
  if (bloqueo) throw new AccountDeletionError(bloqueo);

  const ahora = new Date();
  const conservados = await prisma.trip.count({ where: { driverId, status: 'COMPLETED' } });

  await prisma.$transaction([
    // Los documentos son cédula, licencia y SOAT: fotos de identidad que no
    // sostienen ninguna liquidación. Fuera.
    prisma.driverDocument.deleteMany({ where: { driverId } }),
    // Las sesiones OTP abiertas se invalidan: si no, un código ya pedido
    // seguiría sirviendo durante cinco minutos contra una cuenta borrada.
    prisma.otpSession.updateMany({ where: { driverId, used: false }, data: { used: true } }),
    prisma.driver.update({
      where: { id: driverId },
      data: {
        phone: `${TOMBSTONE_PREFIX}${driverId}`,
        name: 'Conductor eliminado',
        email: null,
        avatarUrl: null,
        selfieUrl: null,
        documentNumber: null,
        licenseNumber: null,
        fcmToken: null,
        trustedContactName: null,
        trustedContactPhone: null,
        bankName: null,
        bankAccountType: null,
        bankAccountNumber: null,
        bio: null,
        // Fuera del despacho por partida triple: desconectado, sin verificar y
        // sin última posición. Cualquiera de las tres bastaría; las tres juntas
        // hacen que no dependa de que el matching filtre bien.
        status: 'OFFLINE',
        isVerified: false,
        lastLat: null,
        lastLng: null,
        lastSeenAt: null,
        // Desafiliado: la empresa no debe seguir viéndolo en su flota.
        operatorId: null,
        deletedAt: ahora,
      },
    }),
  ]);

  // La columna PostGIS no la gestiona Prisma (Unsupported): se limpia aparte o
  // el conductor seguiría apareciendo en las consultas por cercanía.
  await prisma.$executeRaw`UPDATE "drivers" SET geo = NULL WHERE id = ${driverId}`;

  olvidarCuenta('conductor', driverId);

  return { serviciosConservados: conservados, borradoEn: ahora.toISOString() };
}

/** ¿Esta cuenta está borrada? Lo usan los login para no dejar volver a entrar. */
export function esCuentaBorrada(phone: string): boolean {
  return phone.startsWith(TOMBSTONE_PREFIX);
}
