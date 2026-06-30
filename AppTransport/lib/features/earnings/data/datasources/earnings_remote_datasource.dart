import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/earnings/data/datasources/earnings_datasource.dart';
import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Fuente de datos REAL de ganancias: consume los endpoints del backend
/// `GET /earnings/daily` y `GET /earnings/weekly` (agregados por conductor en
/// la tabla driver_earnings + viajes COMPLETED del día).
class EarningsRemoteDataSource implements EarningsDataSource {
  EarningsRemoteDataSource(this._client);

  final DioClient _client;

  @override
  Future<DailyEarningsEntity> getDailyEarnings(DateTime date) async {
    final res = await _client.get<Map<String, dynamic>>('/earnings/daily');
    final data = res.data?['data'] as Map<String, dynamic>?;
    if (data == null) return DailyEarningsEntity.empty;
    return _fromDto(data);
  }

  @override
  Future<List<DailyEarningsEntity>> getWeeklyHistory() async {
    final res = await _client.get<Map<String, dynamic>>('/earnings/weekly');
    final list = res.data?['data'] as List<dynamic>?;
    if (list == null) return const [];
    return list
        .map((e) => _fromDto(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  @override
  Future<DailyEarningsEntity> addCompletedTrip(TripModel trip) {
    // Los viajes completados se registran en el backend al finalizar el viaje;
    // aquí solo re-consultamos el resumen del día para reflejarlo.
    return getDailyEarnings(DateTime.now());
  }

  // ── Mapeo DTO → entidad ──────────────────────────────────────────────────

  DailyEarningsEntity _fromDto(Map<String, dynamic> d) {
    final tripsJson = d['trips'] as List<dynamic>? ?? const [];
    final trips = tripsJson
        .map((t) => _tripFromDto(t as Map<String, dynamic>))
        .toList(growable: false);
    final total = (d['totalEarnings'] as num?)?.toDouble() ?? 0;
    final count = (d['totalTrips'] as num?)?.toInt() ?? 0;
    final avg = (d['averagePerTrip'] as num?)?.toDouble() ?? 0;
    final best = trips.isEmpty
        ? 0.0
        : trips.map((t) => t.netEarning).reduce((a, b) => a > b ? a : b);

    return DailyEarningsEntity(
      date: DateTime.tryParse(d['date'] as String? ?? '') ?? DateTime.now(),
      totalEarnings: total,
      totalTrips: count,
      // El backend aún no reporta horas en línea; se omite (0) en lugar de
      // inventar un valor.
      hoursOnline: 0,
      averageFare: avg,
      bestTripEarning: best,
      completedTrips: trips,
    );
  }

  TripModel _tripFromDto(Map<String, dynamic> t) {
    final gross = (t['grossFare'] as num?)?.toDouble() ?? 0;
    final net = (t['netEarning'] as num?)?.toDouble() ?? 0;
    final completed =
        DateTime.tryParse(t['completedAt'] as String? ?? '') ?? DateTime.now();

    return TripModel(
      id: t['tripId'] as String? ?? '',
      passengerId: '',
      passengerName: 'Pasajero',
      origin: LocationModel(
        latitude: 0,
        longitude: 0,
        address: t['origin'] as String? ?? '',
      ),
      destination: LocationModel(
        latitude: 0,
        longitude: 0,
        address: t['destination'] as String? ?? '',
      ),
      distanceKm: 0,
      durationMinutes: 0,
      grossFare: gross,
      netEarning: net,
      commission: gross - net,
      startedAt: completed,
      finishedAt: completed,
    );
  }
}
