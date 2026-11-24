// ── Borrar desde el panel de administración ─────────────────────────────────
//
// El panel no tenía con qué quitar nada: una cuenta de prueba, un vehículo mal
// registrado o un negocio creado dos veces se quedaban para siempre.
//
// REGLA: borrar desde aquí no puede ser más destructivo que lo que la propia
// persona puede hacer desde su app. Por eso las cuentas se borran con
// EXACTAMENTE el mismo camino que «Eliminar mi cuenta» (`account-deletion`):
// se anonimiza a la persona, se conserva lo liquidado (que es contabilidad de
// conductores y flotas, no dato suyo) y se bloquea si hay un servicio en curso.
//
// Lo que tiene historial no se arranca: un vehículo con viajes se DESACTIVA y
// un negocio con pedidos no se borra (se desactiva o se marca sin pago, que ya
// existen). Borrar en esos casos dejaría viajes, fletes y ventas apuntando a
// un id que no existe — y eso no falla al borrar, falla meses después en un
// reporte que no cuadra.

import { prisma } from '../lib/prisma';
import {
  AccountDeletionError,
  borrarCuentaCliente,
  borrarCuentaConductor,
  TOMBSTONE_PREFIX,
} from './account-deletion.service';

export class BorradoAdminError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = 'BorradoAdminError';
  }
}

/** Convierte el error del borrado de cuenta en el del panel, con su motivo. */
async function conMotivo<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      const status = /no existe/i.test(e.message) ? 404 : 409;
      throw new BorradoAdminError(e.message, status);
    }
    throw e;
  }
}

// ── Cuentas ──────────────────────────────────────────────────────────────────

export async function eliminarClienteAdmin(userId: string) {
  return conMotivo(() => borrarCuentaCliente(userId));
}

export async function eliminarConductorAdmin(driverId: string) {
  return conMotivo(() => borrarCuentaConductor(driverId));
}

export interface ClienteBuscado {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  viajes: number;
}

/**
 * Buscar cualquier cliente para poder actuar sobre él. La pestaña Clientes
 * solo listaba a quien inició la verificación de identidad, así que a la
 * mayoría no había forma de encontrarla.
 */
export async function buscarClientesAdmin(q: string): Promise<ClienteBuscado[]> {
  const texto = q.trim();
  const rows = await prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(texto
        ? {
            OR: [
              { name: { contains: texto, mode: 'insensitive' } },
              { phone: { contains: texto.replace(/\s+/g, '') } },
              { email: { contains: texto, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
  });
  const conteos = rows.length
    ? await prisma.trip.groupBy({
        by: ['passengerId'],
        where: { passengerId: { in: rows.map((r) => r.id) } },
        _count: { _all: true },
      })
    : [];
  const viajes = new Map(conteos.map((c) => [c.passengerId, c._count._all]));
  return rows
    .filter((r) => !(r.phone ?? '').startsWith(TOMBSTONE_PREFIX))
    .map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      createdAt: r.createdAt.toISOString(),
      viajes: viajes.get(r.id) ?? 0,
    }));
}

// ── Vehículos ────────────────────────────────────────────────────────────────

export interface VehiculoAdmin {
  id: string;
  type: string;
  brand: string;
  model: string;
  plate: string;
  color: string;
  year: number;
  isActive: boolean;
  viajes: number;
}

export async function listarVehiculosDeConductor(driverId: string): Promise<VehiculoAdmin[]> {
  const rows = await prisma.vehicle.findMany({
    where: { driverId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { trips: true } } },
  });
  return rows.map((v) => ({
    id: v.id,
    type: v.type,
    brand: v.brand,
    model: v.model,
    plate: v.plate,
    color: v.color,
    year: v.year,
    isActive: v.isActive,
    viajes: v._count.trips,
  }));
}

const TRIP_VIVO = ['SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS'] as const;
const FLETE_VIVO = ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] as const;

export type ResultadoVehiculo =
  | { modo: 'borrado' }
  | { modo: 'desactivado'; motivo: string };

/**
 * Quita un vehículo. Sin historial se borra; con historial se desactiva (deja
 * de usarse para despachar, y los viajes viejos siguen diciendo en qué carro
 * fueron). Con un servicio EN CURSO no se toca: alguien va dentro.
 */
export async function eliminarVehiculoAdmin(vehicleId: string): Promise<ResultadoVehiculo> {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!v) throw new BorradoAdminError('El vehículo no existe.', 404);

  const [viajeVivo, fleteVivo, viajes, asignaciones, fletes, cargas] = await Promise.all([
    prisma.trip.count({ where: { vehicleId, status: { in: [...TRIP_VIVO] } } }),
    prisma.freightRequest.count({ where: { vehicleId, status: { in: [...FLETE_VIVO] } } }),
    prisma.trip.count({ where: { vehicleId } }),
    prisma.fleetAssignment.count({ where: { vehicleId } }),
    prisma.freightRequest.count({ where: { vehicleId } }),
    prisma.cargoTrip.count({ where: { vehicleId } }),
  ]);
  if (viajeVivo + fleteVivo > 0) {
    throw new BorradoAdminError(
      'Este vehículo tiene un servicio en curso. Termínalo o cancélalo primero.',
    );
  }
  if (viajes + asignaciones + fletes + cargas > 0) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { isActive: false } });
    return {
      modo: 'desactivado',
      motivo:
        'Tiene historial (viajes, fletes o asignaciones de flota), así que se desactivó en vez de ' +
        'borrarse: ya no se usa para despachar y el historial sigue diciendo en qué carro fue.',
    };
  }
  await prisma.vehicle.delete({ where: { id: vehicleId } });
  return { modo: 'borrado' };
}

// ── Negocios ─────────────────────────────────────────────────────────────────

/**
 * Borra un negocio SIN movimientos (el que se registró dos veces o de prueba).
 * Con pedidos, giros o créditos se rechaza: esas son ventas y plata de
 * terceros, y para dejar de mostrarlo ya existen «Desactivar» y «Marcar sin
 * pago».
 */
export async function eliminarNegocioAdmin(businessId: string): Promise<{ productos: number }> {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!b) throw new BorradoAdminError('El negocio no existe.', 404);
  const [pedidos, giros, creditos] = await Promise.all([
    prisma.order.count({ where: { businessId } }),
    prisma.payout.count({ where: { businessId } }),
    prisma.partnerCredit.count({ where: { businessId } }),
  ]);
  if (pedidos > 0) {
    throw new BorradoAdminError(
      `Tiene ${pedidos} pedido${pedidos === 1 ? '' : 's'}: son ventas registradas y no se borran. ` +
        'Usa «Desactivar» para sacarlo de la app.',
    );
  }
  if (giros + creditos > 0) {
    throw new BorradoAdminError(
      'Tiene giros o créditos registrados: es plata y no se borra. Usa «Desactivar».',
    );
  }
  // Los productos no caen en cascada con el negocio (sus fotos y opciones sí
  // caen con el producto). Sin pedidos, ninguna línea de venta los referencia.
  const [borrados] = await prisma.$transaction([
    prisma.product.deleteMany({ where: { businessId } }),
    prisma.business.delete({ where: { id: businessId } }),
  ]);
  return { productos: borrados.count };
}
