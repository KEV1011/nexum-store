import { DailyEarningsDTO, TripEarningEntry } from '../types';
import { COMMISSION_RATE } from '../config/constants';
import { prisma } from '../lib/prisma';

// Session-accumulated completed trips (in-memory fallback for driverId-less callers)
const sessionTrips: TripEarningEntry[] = [];

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function recordCompletedTrip(entry: TripEarningEntry, driverId?: string): void {
  sessionTrips.push(entry);
  if (!driverId) return;

  const date = todayStart();
  const commission = entry.grossFare - entry.netEarning;

  // Upsert daily aggregation (fire-and-forget).
  void prisma.driverEarning.upsert({
    where: { driverId_date: { driverId, date } },
    create: { driverId, date, grossFare: entry.grossFare, commission, netEarning: entry.netEarning, tripCount: 1 },
    update: {
      grossFare: { increment: entry.grossFare },
      commission: { increment: commission },
      netEarning: { increment: entry.netEarning },
      tripCount: { increment: 1 },
    },
  }).catch(() => { /* ignore DB errors */ });
}

/**
 * Acredita una propina al conductor (100%, sin comisión). Se suma a la ganancia
 * neta del día, así que entra directo al saldo de retiro y al dashboard.
 */
export async function creditDriverTip(driverId: string, amount: number): Promise<void> {
  if (!driverId || !(amount > 0)) return;
  const date = todayStart();
  await prisma.driverEarning
    .upsert({
      where: { driverId_date: { driverId, date } },
      create: { driverId, date, grossFare: amount, commission: 0, netEarning: amount, tripCount: 0 },
      update: {
        grossFare: { increment: amount },
        netEarning: { increment: amount },
      },
    })
    .catch(() => {
      /* ignore DB errors */
    });
}

export async function getDailyEarnings(driverId?: string): Promise<DailyEarningsDTO> {
  const today = new Date().toISOString().split('T')[0]!;

  if (driverId) {
    const date = todayStart();
    const [earning, trips] = await Promise.all([
      prisma.driverEarning.findUnique({ where: { driverId_date: { driverId, date } } }),
      prisma.trip.findMany({
        where: { driverId, status: 'COMPLETED', completedAt: { gte: date } },
        select: { requestRef: true, originAddress: true, destAddress: true, finalFare: true, netEarning: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
    ]);
    const totalEarnings = earning?.netEarning ?? 0;
    const totalTrips = earning?.tripCount ?? 0;
    const tripEntries: TripEarningEntry[] = trips.map((t) => ({
      tripId: t.requestRef,
      origin: t.originAddress,
      destination: t.destAddress,
      grossFare: t.finalFare ?? 0,
      netEarning: t.netEarning ?? 0,
      completedAt: t.completedAt?.toISOString() ?? new Date().toISOString(),
    }));
    return {
      date: today,
      totalEarnings,
      totalTrips,
      averagePerTrip: totalTrips > 0 ? Math.round(totalEarnings / totalTrips) : 0,
      trips: tripEntries,
    };
  }

  // Fallback: in-memory session
  const todayTrips = sessionTrips.filter((t) => t.completedAt.startsWith(today));
  const totalEarnings = todayTrips.reduce((sum, t) => sum + t.netEarning, 0);
  return {
    date: today,
    totalEarnings,
    totalTrips: todayTrips.length,
    averagePerTrip: todayTrips.length > 0 ? Math.round(totalEarnings / todayTrips.length) : 0,
    trips: todayTrips,
  };
}

export async function getWeeklyHistory(driverId?: string): Promise<DailyEarningsDTO[]> {
  const result: DailyEarningsDTO[] = [];

  if (driverId) {
    const sevenDaysAgo = todayStart();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const earnings = await prisma.driverEarning.findMany({
      where: { driverId, date: { gte: sevenDaysAgo } },
    });
    const byDate = new Map(earnings.map((e) => [e.date.toISOString().split('T')[0]!, e]));

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]!;
      const earning = byDate.get(dateStr);
      result.push({
        date: dateStr,
        totalEarnings: earning?.netEarning ?? 0,
        totalTrips: earning?.tripCount ?? 0,
        averagePerTrip: earning && earning.tripCount > 0 ? Math.round(earning.netEarning / earning.tripCount) : 0,
        trips: [],
      });
    }
    return result;
  }

  // Fallback: in-memory + mock history for past days
  const mockBase = [95_000, 87_000, 112_000, 78_000, 103_000, 138_000, 121_000];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!;
    const isToday = i === 0;

    if (isToday) {
      result.push(await getDailyEarnings());
    } else {
      const gross = mockBase[6 - i] ?? 90_000;
      const net = Math.round(gross * (1 - COMMISSION_RATE));
      const trips = Math.round(gross / 18_000);
      result.push({
        date: dateStr,
        totalEarnings: net,
        totalTrips: trips,
        averagePerTrip: Math.round(net / trips),
        trips: [],
      });
    }
  }
  return result;
}
