import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Interfaz abstracta del repositorio de ganancias.
abstract interface class EarningsRepository {
  /// Obtiene el resumen de ganancias del día indicado.
  Future<DailyEarningsEntity> getDailyEarnings(DateTime date);

  /// Obtiene el historial de ganancias de los últimos 7 días.
  Future<List<DailyEarningsEntity>> getWeeklyHistory();

  /// Agrega un viaje completado al acumulado del día.
  Future<DailyEarningsEntity> addCompletedTrip(TripModel trip);
}
