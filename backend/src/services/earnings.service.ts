import { DailyEarningsDTO, TripEarningEntry } from '../types';
import { COMMISSION_RATE } from '../config/constants';

// Session-accumulated completed trips
const sessionTrips: TripEarningEntry[] = [];

export function recordCompletedTrip(entry: TripEarningEntry): void {
  sessionTrips.push(entry);
}

export function getDailyEarnings(): DailyEarningsDTO {
  const today = new Date().toISOString().split('T')[0]!;
  const todayTrips = sessionTrips.filter(t => t.completedAt.startsWith(today));
  const totalEarnings = todayTrips.reduce((sum, t) => sum + t.netEarning, 0);
  return {
    date: today,
    totalEarnings,
    totalTrips: todayTrips.length,
    averagePerTrip: todayTrips.length > 0 ? Math.round(totalEarnings / todayTrips.length) : 0,
    trips: todayTrips,
  };
}

export function getWeeklyHistory(): DailyEarningsDTO[] {
  const mockBase = [95_000, 87_000, 112_000, 78_000, 103_000, 138_000, 121_000];
  const result: DailyEarningsDTO[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0]!;
    const isToday = i === 0;

    if (isToday) {
      result.push(getDailyEarnings());
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
