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
    required this.netEarnings,
    required this.commission,
    this.date,
  });

  final String label;
  final int trips;
  final double grossEarnings;

  /// Lo que se lleva el conductor, SUMADO de lo que liquidó el servidor viaje
  /// por viaje. No se deriva del bruto: ver la nota de [_aggregate].
  final double netEarnings;

  /// Lo que se quedó la plataforma, también del servidor.
  final double commission;

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

/// Suma lo que LIQUIDÓ EL SERVIDOR, no una proporción del bruto.
///
/// Antes esto sumaba solo el bruto y la pantalla repartía después con
/// `FareCalculator` y un porcentaje de comisión escrito dentro de la app. El
/// backend ya manda `netEarning` y `commission` viaje por viaje —es lo que de
/// verdad entró a la billetera—, así que recalcularlo aquí era inventar una
/// segunda contabilidad: el día que la comisión cambie en el servidor, el
/// conductor seguiría viendo el reparto viejo hasta que actualice la app. Y si
/// un viaje se liquidó con otra tasa (una promoción, un flete), el promedio
/// tampoco cuadraba.
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
        grossEarnings: dayTrips.fold<double>(0, (s, t) => s + t.grossFare),
        netEarnings: dayTrips.fold<double>(0, (s, t) => s + t.netEarning),
        commission: dayTrips.fold<double>(0, (s, t) => s + t.commission),
      ),
    );
  }

  // ── Semanas del mes actual ──────────────────────────────────────────────────
  final monthTrips = trips
      .where((t) =>
          t.finishedAt.year == now.year && t.finishedAt.month == now.month)
      .toList();
  final weekTotals = List<double>.filled(4, 0);
  final weekNet = List<double>.filled(4, 0);
  final weekCommission = List<double>.filled(4, 0);
  final weekTrips = List<int>.filled(4, 0);
  for (final t in monthTrips) {
    final idx = math.min(((t.finishedAt.day - 1) ~/ 7), 3);
    weekTotals[idx] += t.grossFare;
    weekNet[idx] += t.netEarning;
    weekCommission[idx] += t.commission;
    weekTrips[idx] += 1;
  }
  final weeks = <EarningsBucket>[
    for (var w = 0; w < 4; w++)
      EarningsBucket(
        label: 'Sem ${w + 1}',
        trips: weekTrips[w],
        grossEarnings: weekTotals[w],
        netEarnings: weekNet[w],
        commission: weekCommission[w],
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
