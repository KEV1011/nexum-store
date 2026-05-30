import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/features/trip_history/presentation/providers/trip_history_provider.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Un período agregado de ganancias (un día o una semana).
class EarningsBucket {
  const EarningsBucket({
    required this.label,
    required this.trips,
    required this.grossEarnings,
    this.date,
  });

  final String label;
  final int trips;
  final double grossEarnings;
  final DateTime? date;
}

/// Desglose de ganancias derivado del historial real de viajes.
class EarningsBreakdown {
  const EarningsBreakdown({required this.days, required this.weeks});

  /// Últimos 7 días, con HOY en el índice 0.
  final List<EarningsBucket> days;

  /// Semanas del mes actual (Sem 1 … Sem 4).
  final List<EarningsBucket> weeks;

  /// Si el conductor ya tiene viajes registrados hoy.
  bool get hasTripsToday => days.isNotEmpty && days.first.trips > 0;
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

EarningsBreakdown _aggregate(List<TripModel> trips) {
  final now = DateTime.now();

  // ── Últimos 7 días (hoy primero) ──────────────────────────────────────────
  final days = <EarningsBucket>[];
  for (var i = 0; i < 7; i++) {
    final day = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: i));
    final dayTrips =
        trips.where((t) => _sameDay(t.finishedAt, day)).toList();
    days.add(
      EarningsBucket(
        label: '${day.day}',
        date: day,
        trips: dayTrips.length,
        grossEarnings:
            dayTrips.fold<double>(0, (s, t) => s + t.grossFare),
      ),
    );
  }

  // ── Semanas del mes actual ──────────────────────────────────────────────────
  final monthTrips = trips
      .where((t) =>
          t.finishedAt.year == now.year && t.finishedAt.month == now.month)
      .toList();
  final weekTotals = List<double>.filled(4, 0);
  final weekTrips = List<int>.filled(4, 0);
  for (final t in monthTrips) {
    final idx = math.min(((t.finishedAt.day - 1) ~/ 7), 3);
    weekTotals[idx] += t.grossFare;
    weekTrips[idx] += 1;
  }
  final weeks = <EarningsBucket>[
    for (var w = 0; w < 4; w++)
      EarningsBucket(
        label: 'Sem ${w + 1}',
        trips: weekTrips[w],
        grossEarnings: weekTotals[w],
      ),
  ];

  return EarningsBreakdown(days: days, weeks: weeks);
}

/// Ganancias agregadas (diario + semanal) calculadas desde el historial
/// persistido en [tripHistoryProvider]. Se recalcula automáticamente cuando
/// se completa un viaje nuevo.
final earningsBreakdownProvider = Provider<EarningsBreakdown>((ref) {
  final trips = ref.watch(tripHistoryProvider);
  return _aggregate(trips);
});
