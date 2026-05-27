import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/features/earnings/domain/repositories/earnings_repository.dart';

/// Caso de uso: obtener el resumen de ganancias del día actual.
class GetDailyEarningsUseCase {
  const GetDailyEarningsUseCase(this._repository);
  final EarningsRepository _repository;

  Future<DailyEarningsEntity> call() async {
    return _repository.getDailyEarnings(DateTime.now());
  }
}
