// ── Ficha del conductor y su vehículo ─────────────────────────────────────────
//
// Lo que mira alguien antes de subirse a un carro desconocido o de entregarle
// un paquete: quién es, cómo lo califican otros, si comprobamos su identidad, y
// qué vehículo tiene que ver aparcado delante.
//
// Vive aquí y no dentro de un servicio porque la misma pregunta aparece en los
// cinco servicios (viaje, envío, mandado, pedido, intermunicipal). Cada uno
// guarda el nombre del conductor desnormalizado en su propia fila —lo que va
// bien para un listado— pero ninguno tenía cómo enseñar la placa, la foto o la
// calificación sin repetir la misma consulta de cinco maneras distintas.
//
// Regla: lo que no está, no viaja. Un campo ausente hace que la app degrade la
// tarjeta; un valor por defecto ("5.0", "verificado") sería mentira.

import { prisma } from './prisma';

export interface DriverCardFields {
  driverPhotoUrl?: string;
  driverRating?: number;
  driverTotalTrips?: number;
  /** Alta del conductor en la plataforma (ISO) → "Conductor desde 2026". */
  driverSince?: string;
  driverVerified?: boolean;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehiclePlate?: string;
  /** Foto REAL del vehículo, si la flota la subió al registrarlo. */
  vehiclePhotoUrl?: string;
  /** Tipo REAL (PARTICULAR|TAXI|MOTO|TURBO|CAMION|MULA) — decide el ícono. */
  driverVehicleType?: string;
  /** "Marca Modelo • PLACA" para las apps ya instaladas. */
  driverVehicle?: string;
}

interface DriverLike {
  avatarUrl: string | null;
  rating: number;
  totalTrips: number;
  isVerified: boolean;
  createdAt: Date;
}

interface VehicleLike {
  brand: string;
  model: string;
  color: string;
  plate: string;
  type: string;
  photoUrl: string | null;
}

/** Campos que hay que traer de Prisma para construir la ficha. */
export const DRIVER_CARD_SELECT = {
  avatarUrl: true,
  rating: true,
  totalTrips: true,
  isVerified: true,
  createdAt: true,
} as const;

export const VEHICLE_CARD_SELECT = {
  brand: true,
  model: true,
  color: true,
  plate: true,
  type: true,
  photoUrl: true,
} as const;

export function fichaFromDriver(
  driver: DriverLike | null | undefined,
  vehicle: VehicleLike | null | undefined,
): DriverCardFields {
  if (!driver && !vehicle) return {};
  return {
    driverPhotoUrl: driver?.avatarUrl ?? undefined,
    driverRating: driver?.rating,
    driverTotalTrips: driver?.totalTrips,
    driverSince: driver?.createdAt.toISOString(),
    driverVerified: driver?.isVerified,
    vehicleBrand: vehicle?.brand,
    vehicleModel: vehicle?.model,
    vehicleColor: vehicle?.color,
    vehiclePlate: vehicle?.plate,
    vehiclePhotoUrl: vehicle?.photoUrl ?? undefined,
    driverVehicleType: vehicle?.type,
    driverVehicle: vehicle
      ? `${vehicle.brand} ${vehicle.model} • ${vehicle.plate}`
      : undefined,
  };
}

/**
 * Ficha de UN conductor. Para pedidos y mandados, que guardan solo el
 * `driverId` en su fila y no traen la relación cargada.
 */
export async function fichaPorConductor(
  driverId: string | null | undefined,
): Promise<DriverCardFields> {
  if (!driverId) return {};
  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: {
      ...DRIVER_CARD_SELECT,
      vehicles: { where: { isActive: true }, take: 1, select: VEHICLE_CARD_SELECT },
    },
  });
  if (!d) return {};
  return fichaFromDriver(d, d.vehicles[0]);
}

/**
 * Fichas de un lote de conductores en UNA consulta. Para los listados: pedir
 * la ficha por fila convertiría una lista de veinte pedidos en veintiuna
 * consultas.
 */
export async function fichasPorConductores(
  driverIds: (string | null | undefined)[],
): Promise<Map<string, DriverCardFields>> {
  const ids = [...new Set(driverIds.filter((v): v is string => !!v))];
  const out = new Map<string, DriverCardFields>();
  if (ids.length === 0) return out;

  const filas = await prisma.driver.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      ...DRIVER_CARD_SELECT,
      vehicles: { where: { isActive: true }, take: 1, select: VEHICLE_CARD_SELECT },
    },
  });
  for (const d of filas) out.set(d.id, fichaFromDriver(d, d.vehicles[0]));
  return out;
}
