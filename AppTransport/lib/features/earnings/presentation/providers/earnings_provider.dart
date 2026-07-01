import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/earnings/data/datasources/earnings_datasource.dart';
import 'package:nexum_driver/features/earnings/data/datasources/earnings_remote_datasource.dart';
import 'package:nexum_driver/features/earnings/data/repositories/earnings_repository_impl.dart';
import 'package:nexum_driver/features/earnings/domain/entities/daily_earnings_entity.dart';
import 'package:nexum_driver/features/earnings/domain/repositories/earnings_repository.dart';
import 'package:nexum_driver/features/earnings/domain/usecases/get_daily_earnings_usecase.dart';
import 'package:nexum_driver/features/earnings/domain/usecases/get_weekly_history_usecase.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

// ── Infraestructura ──────────────────────────────────────────────────────────
// Fuente de datos REAL: consume /earnings/daily y /earnings/weekly del backend.
final _earningsDatasourceProvider = Provider<EarningsDataSource>(
  (ref) => EarningsRemoteDataSource(DioClient()),
);

final earningsRepositoryProvider = Provider<EarningsRepository>((ref) {
  return EarningsRepositoryImpl(ref.watch(_earningsDatasourceProvider));
});

// ── Casos de uso
final _getDailyEarningsUseCaseProvider = Provider<GetDailyEarningsUseCase>(
  (ref) => GetDailyEarningsUseCase(ref.watch(earningsRepositoryProvider)),
);

final _getWeeklyHistoryUseCaseProvider = Provider<GetWeeklyHistoryUseCase>(
  (ref) => GetWeeklyHistoryUseCase(ref.watch(earningsRepositoryProvider)),
);

// ── Providers reactivos ──────────────────────────────────────────────────────

/// Ganancias del día actual (se refresca automáticamente).
final earningsProvider = FutureProvider.autoDispose<DailyEarningsEntity>((ref) {
  return ref.watch(_getDailyEarningsUseCaseProvider).call();
});

/// Historial semanal de ganancias (últimos 7 días).
final weeklyHistoryProvider =
    FutureProvider.autoDispose<List<DailyEarningsEntity>>((ref) {
  return ref.watch(_getWeeklyHistoryUseCaseProvider).call();
});

/// Notifier para agregar viajes completados desde otras pantallas.
final addCompletedTripProvider =
    Provider<Future<DailyEarningsEntity> Function(TripModel)>((ref) {
  final repo = ref.watch(earningsRepositoryProvider);
  return (TripModel trip) async {
    final result = await repo.addCompletedTrip(trip);
    // Invalidar para que earningsProvider se recargue
    ref.invalidate(earningsProvider);
    ref.invalidate(weeklyHistoryProvider);
    return result;
  };
});
