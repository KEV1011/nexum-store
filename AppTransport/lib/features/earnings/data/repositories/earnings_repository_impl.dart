import 'package:nexum_driver/features/earnings/data/datasources/earnings_datasource.dart';
import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/features/earnings/domain/repositories/earnings_repository.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Implementación mock del repositorio de ganancias.
class EarningsRepositoryImpl implements EarningsRepository {
  EarningsRepositoryImpl(this._dataSource);
  final EarningsMockDataSource _dataSource;

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
