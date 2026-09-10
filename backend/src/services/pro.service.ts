// ── ZIPA Pro: niveles del conductor con datos 100 % reales ──────────────────
//
// El nivel se calcula SOLO con datos verificables de la plataforma:
//  - Servicios completados: suma de DriverEarning.tripCount (alimentado por
//    recordCompletedTrip en TODAS las liquidaciones: viajes, mandados,
//    pedidos, intermunicipal y fletes).
//  - Calificación: promedio de las calificaciones intermunicipales reales si
//    existen; si no, el rating base del conductor.
// Nada de niveles inventados: un conductor nuevo arranca en Bronce con 0.

import { prisma } from '../lib/prisma';

export type ProLevel = 'BRONCE' | 'PLATA' | 'ORO' | 'DIAMANTE';

export interface ProLevelDef {
  level: ProLevel;
  label: string;
  minServices: number;
  minRating: number;
  perks: string[];
}

/** Escalera de niveles (orden ascendente). */
export const PRO_LEVELS: ProLevelDef[] = [
  {
    level: 'BRONCE',
    label: 'Bronce',
    minServices: 0,
    minRating: 0,
    perks: ['Acceso a todos los servicios de la plataforma'],
  },
  {
    level: 'PLATA',
    label: 'Plata',
    minServices: 50,
    minRating: 4.5,
    perks: ['Insignia Plata visible en tu perfil', 'Prioridad en soporte'],
  },
  {
    level: 'ORO',
    label: 'Oro',
    minServices: 200,
    minRating: 4.7,
    perks: ['Insignia Oro visible en tu perfil', 'Soporte preferente', 'Acceso anticipado a novedades'],
  },
  {
    level: 'DIAMANTE',
    label: 'Diamante',
    minServices: 500,
    minRating: 4.85,
    perks: ['Insignia Diamante', 'Soporte prioritario 24/7', 'Reconocimiento en la comunidad ZIPA'],
  },
];

export interface ProStatusDTO {
  level: ProLevel;
  levelLabel: string;
  /** Null si todavía nadie lo ha calificado. */
  rating: number | null;
  totalServices: number;
  monthServices: number;
  /** Siguiente nivel y lo que falta para alcanzarlo; null si ya es Diamante. */
  next: {
    level: ProLevel;
    label: string;
    servicesNeeded: number;
    minRating: number;
    /** 0..1 — avance de servicios hacia el siguiente nivel. */
    progress: number;
  } | null;
  levels: ProLevelDef[];
}

export async function getDriverProStatus(driverId: string): Promise<ProStatusDTO> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [driver, totalAgg, monthAgg, intercityRating] = await Promise.all([
    prisma.driver.findUnique({
      where: { id: driverId },
      select: { rating: true, totalTrips: true },
    }),
    prisma.driverEarning.aggregate({ where: { driverId }, _sum: { tripCount: true } }),
    prisma.driverEarning.aggregate({
      where: { driverId, date: { gte: monthStart } },
      _sum: { tripCount: true },
    }),
    prisma.intercityBooking.aggregate({
      where: { driverId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);
  if (!driver) throw new Error('Conductor no encontrado');

  // El histórico sellado (totalTrips) puede venir de antes de DriverEarning;
  // se toma el mayor de los dos para no castigar a conductores antiguos.
  const settled = totalAgg._sum.tripCount ?? 0;
  const totalServices = Math.max(driver.totalTrips, settled);
  const monthServices = monthAgg._sum.tripCount ?? 0;

  // La nota: la de sus viajes urbanos (`Driver.rating`, ya recalculada de las
  // calificaciones reales) o el promedio de sus intermunicipales si los tiene.
  // Puede ser NULL: un conductor al que todavía nadie ha calificado no tiene
  // nota, y antes esto se apoyaba en el 5,0 de fábrica — o sea, los niveles se
  // repartían sobre una cifra que nadie había dado.
  const rating: number | null =
    intercityRating._count.rating > 0 && intercityRating._avg.rating !== null
      ? Math.round(intercityRating._avg.rating * 100) / 100
      : driver.rating;

  // Nivel actual = el más alto cuyos requisitos se cumplen.
  //
  // Sin calificaciones solo se alcanzan los niveles que no exigen nota (Bronce).
  // Es lo correcto: no se puede conceder un nivel «4,7 estrellas» a quien no
  // tiene ninguna. Los servicios sí cuentan desde el primer día.
  let current = PRO_LEVELS[0]!;
  for (const def of PRO_LEVELS) {
    const notaSuficiente = def.minRating <= 0 || (rating !== null && rating >= def.minRating);
    if (totalServices >= def.minServices && notaSuficiente) current = def;
  }

  const idx = PRO_LEVELS.findIndex((l) => l.level === current.level);
  const nextDef = PRO_LEVELS[idx + 1] ?? null;
  const prevFloor = current.minServices;

  return {
    level: current.level,
    levelLabel: current.label,
    rating,
    totalServices,
    monthServices,
    next: nextDef
      ? {
          level: nextDef.level,
          label: nextDef.label,
          servicesNeeded: Math.max(0, nextDef.minServices - totalServices),
          minRating: nextDef.minRating,
          progress: Math.min(
            1,
            Math.max(0, (totalServices - prevFloor) / Math.max(1, nextDef.minServices - prevFloor)),
          ),
        }
      : null,
    levels: PRO_LEVELS,
  };
}
