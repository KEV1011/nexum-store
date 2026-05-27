import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/earnings/data/datasources/earnings_datasource.dart';
import 'package:nexum_driver/features/earnings/data/repositories/earnings_repository_impl.dart';
import 'package:nexum_driver/features/earnings/domain/usecases/get_daily_earnings_usecase.dart';
import '../../../../helpers/test_helpers.dart';

void main() {
  group('GetDailyEarningsUseCase', () {
    late GetDailyEarningsUseCase useCase;

    setUp(() {
      final dataSource = EarningsMockDataSource();
      final repository = EarningsRepositoryImpl(dataSource);
      useCase = GetDailyEarningsUseCase(repository);
    });

    test('Retorna DailyEarningsEntity con fecha de hoy', () async {
      final result = await useCase.call();
      final today = DateTime.now();

      expect(result.date.year, equals(today.year));
      expect(result.date.month, equals(today.month));
      expect(result.date.day, equals(today.day));
    });

    test('Ganancias iniciales son 0 (sin viajes en sesión)', () async {
      final result = await useCase.call();

      expect(result.totalEarnings, equals(0.0));
      expect(result.totalTrips, equals(0));
      expect(result.completedTrips, isEmpty);
    });

    test('Agregar un viaje incrementa las ganancias', () async {
      final dataSource = EarningsMockDataSource();
      final repository = EarningsRepositoryImpl(dataSource);
      final trip = createMockCompletedTrip(netEarning: 4751.25);

      await repository.addCompletedTrip(trip);
      final result = await repository.getDailyEarnings(DateTime.now());

      expect(result.totalTrips, equals(1));
      expect(result.totalEarnings, closeTo(4751.25, 0.01));
      expect(result.completedTrips, hasLength(1));
    });

    test('Tarifa promedio se calcula correctamente', () async {
      final dataSource = EarningsMockDataSource();
      final repository = EarningsRepositoryImpl(dataSource);

      await repository.addCompletedTrip(
        createMockCompletedTrip(id: 't1', netEarning: 4000),
      );
      await repository.addCompletedTrip(
        createMockCompletedTrip(id: 't2', netEarning: 6000),
      );

      final result = await repository.getDailyEarnings(DateTime.now());
      expect(result.averageFare, closeTo(5000, 0.01));
      expect(result.bestTripEarning, closeTo(6000, 0.01));
    });
  });
}
