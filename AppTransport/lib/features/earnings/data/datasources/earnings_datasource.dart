import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Fuente de datos mock para ganancias.
/// Acumula viajes en memoria durante la sesión.
/// Provee historial mock de 7 días para poblar la pantalla de ganancias.
class EarningsMockDataSource {
  // Lista en memoria de viajes completados en la sesión actual
  final List<TripModel> _sessionTrips = [];

  /// Agrega un viaje completado al acumulado del día.
  Future<DailyEarningsEntity> addCompletedTrip(TripModel trip) async {
    _sessionTrips.add(trip);
    return _buildDailyEarnings(DateTime.now(), _sessionTrips);
  }

  /// Obtiene el resumen de ganancias del día indicado.
  Future<DailyEarningsEntity> getDailyEarnings(DateTime date) async {
    await Future.delayed(const Duration(milliseconds: 300));
    final isToday = _isSameDay(date, DateTime.now());
    if (isToday) {
      return _buildDailyEarnings(date, _sessionTrips);
    }
    // Para días pasados, retornar datos históricos mock
    final history = await getWeeklyHistory();
    return history.firstWhere(
      (d) => _isSameDay(d.date, date),
      orElse: () => DailyEarningsEntity.empty,
    );
  }

  /// Genera historial mock de los últimos 7 días con datos realistas.
  Future<List<DailyEarningsEntity>> getWeeklyHistory() async {
    await Future.delayed(const Duration(milliseconds: 400));
    final now = DateTime.now();
    final List<DailyEarningsEntity> history = [];

    // Datos mock por día (viajes y ganancias realistas para Pamplona)
    final mockData = [
      // Hoy: usa los viajes reales de la sesión
      (trips: _sessionTrips, hoursOnline: 0.0 + _sessionTrips.length * 0.4),
      // Ayer
      (trips: _buildHistoricalTrips(6, now.subtract(const Duration(days: 1))), hoursOnline: 5.5),
      // Hace 2 días
      (trips: _buildHistoricalTrips(8, now.subtract(const Duration(days: 2))), hoursOnline: 7.0),
      // Hace 3 días (miércoles - intermedio)
      (trips: _buildHistoricalTrips(4, now.subtract(const Duration(days: 3))), hoursOnline: 3.5),
      // Hace 4 días
      (trips: _buildHistoricalTrips(7, now.subtract(const Duration(days: 4))), hoursOnline: 6.5),
      // Hace 5 días (fin de semana - mejor día)
      (trips: _buildHistoricalTrips(12, now.subtract(const Duration(days: 5))), hoursOnline: 9.0),
      // Hace 6 días (fin de semana)
      (trips: _buildHistoricalTrips(10, now.subtract(const Duration(days: 6))), hoursOnline: 8.0),
    ];

    for (var i = 0; i < mockData.length; i++) {
      final date = now.subtract(Duration(days: i));
      final trips = mockData[i].trips;
      final hoursOnline = mockData[i].hoursOnline;
      history.add(_buildDailyEarnings(date, trips, hoursOnlineOverride: hoursOnline));
    }

    return history;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  DailyEarningsEntity _buildDailyEarnings(
    DateTime date,
    List<TripModel> trips, {
    double? hoursOnlineOverride,
  }) {
    if (trips.isEmpty) {
      return DailyEarningsEntity(
        date: date,
        totalEarnings: 0,
        totalTrips: 0,
        hoursOnline: hoursOnlineOverride ?? 0,
        averageFare: 0,
        bestTripEarning: 0,
        completedTrips: const [],
      );
    }

    final total = trips.fold(0.0, (sum, t) => sum + t.netEarning);
    final best = trips.map((t) => t.netEarning).reduce((a, b) => a > b ? a : b);

    return DailyEarningsEntity(
      date: date,
      totalEarnings: total,
      totalTrips: trips.length,
      hoursOnline: hoursOnlineOverride ?? (trips.length * 0.4),
      averageFare: total / trips.length,
      bestTripEarning: best,
      completedTrips: List.unmodifiable(trips),
    );
  }

  List<TripModel> _buildHistoricalTrips(int count, DateTime date) {
    // Tarifas netas mock realistas (después del 15% de comisión)
    const fares = [4_751.0, 5_440.0, 5_074.5, 6_115.25, 4_335.0, 5_762.5, 6_032.75, 4_675.0, 5_185.5, 5_948.0, 4_547.25, 6_183.75];
    const origins = [
      'Parque Águeda Gallardo',
      'Terminal de Transportes',
      'Hospital San Juan de Dios',
      'Universidad de Pamplona',
      'Catedral Santa Clara',
    ];
    const destinations = [
      'Universidad de Pamplona',
      'Barrio El Buque',
      'Cristo Rey',
      'Barrio Cariongo',
      'Barrio Chapinero',
    ];

    return List.generate(count, (i) {
      final fareIndex = (i + date.day) % fares.length;
      final net = fares[fareIndex];
      final gross = net / 0.85;
      final startTime = date.copyWith(
        hour: 7 + (i * 2) % 12,
        minute: (i * 17) % 60,
      );
      return TripModel(
        id: 'hist_${date.millisecondsSinceEpoch}_$i',
        passengerId: 'pax_00${(i % 5) + 1}',
        passengerName: _passengerNames[i % _passengerNames.length],
        origin: LocationModel(
          latitude: 7.3754 + (i * 0.001),
          longitude: -72.6486 - (i * 0.001),
          address: origins[i % origins.length],
        ),
        destination: LocationModel(
          latitude: 7.3700 + (i * 0.001),
          longitude: -72.6530 - (i * 0.001),
          address: destinations[i % destinations.length],
        ),
        distanceKm: 1.2 + (i % 4) * 0.6,
        durationMinutes: 3 + (i % 5),
        grossFare: gross,
        netEarning: net,
        commission: gross - net,
        startedAt: startTime,
        finishedAt: startTime.add(Duration(minutes: 3 + (i % 5))),
        rating: 4.3 + (i % 3) * 0.2,
      );
    });
  }

  static const _passengerNames = [
    'María Fernanda Rangel',
    'Andrés Felipe Bautista',
    'Laura Ximena Carvajal',
    'Sebastián Mora Peñaranda',
    'Daniela Jaimes Ortega',
  ];

  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}
