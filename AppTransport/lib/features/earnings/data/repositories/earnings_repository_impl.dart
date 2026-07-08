import 'package:nexum_driver/features/earnings/data/datasources/earnings_datasource.dart';
import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/features/earnings/domain/repositories/earnings_repository.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Repositorio de ganancias. La fuente de datos concreta (remota o mock) se
/// inyecta por el provider.
class EarningsRepositoryImpl implements EarningsRepository {
  EarningsRepositoryImpl(this._dataSource);
  final EarningsDataSource _dataSource;

  @override
  Future<DailyEarningsEntity> getDailyEarnings(DateTime date) =>
      _dataSource.getDailyEarnings(date);

  @override
  Future<List<DailyEarningsEntity>> getWeeklyHistory() =>
      _dataSource.getWeeklyHistory();

  @override
  Future<DailyEarningsEntity> addCompletedTrip(TripModel trip) =>
      _dataSource.addCompletedTrip(trip);
}
