import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/features/earnings/domain/repositories/earnings_repository.dart';

/// Caso de uso: obtener el historial de ganancias de los últimos 7 días.
class GetWeeklyHistoryUseCase {
  const GetWeeklyHistoryUseCase(this._repository);
  final EarningsRepository _repository;

  Future<List<DailyEarningsEntity>> call() async {
    return _repository.getWeeklyHistory();
  }
}
