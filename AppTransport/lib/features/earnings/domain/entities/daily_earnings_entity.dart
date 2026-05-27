import 'package:nexum_driver/shared/models/trip_model.dart';

/// Resumen de ganancias del día para el conductor.
class DailyEarningsEntity {
  const DailyEarningsEntity({
    required this.date,
    required this.totalEarnings,
    required this.totalTrips,
    required this.hoursOnline,
    required this.averageFare,
    required this.bestTripEarning,
    required this.completedTrips,
  });

  final DateTime date;
  final double totalEarnings;
  final int totalTrips;
  final double hoursOnline;
  final double averageFare;
  final double bestTripEarning;
  final List<TripModel> completedTrips;

  static DailyEarningsEntity get empty => DailyEarningsEntity(
        date: DateTime.now(),
        totalEarnings: 0,
        totalTrips: 0,
        hoursOnline: 0,
        averageFare: 0,
        bestTripEarning: 0,
        completedTrips: const [],
      );

  DailyEarningsEntity copyWith({
    DateTime? date,
    double? totalEarnings,
    int? totalTrips,
    double? hoursOnline,
    double? averageFare,
    double? bestTripEarning,
    List<TripModel>? completedTrips,
  }) {
    return DailyEarningsEntity(
      date: date ?? this.date,
      totalEarnings: totalEarnings ?? this.totalEarnings,
      totalTrips: totalTrips ?? this.totalTrips,
      hoursOnline: hoursOnline ?? this.hoursOnline,
      averageFare: averageFare ?? this.averageFare,
      bestTripEarning: bestTripEarning ?? this.bestTripEarning,
      completedTrips: completedTrips ?? this.completedTrips,
    );
  }
}
