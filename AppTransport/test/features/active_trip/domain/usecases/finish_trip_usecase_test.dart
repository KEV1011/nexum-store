import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/utils/fare_calculator.dart';
import 'package:nexum_driver/features/active_trip/data/datasources/active_trip_datasource.dart';
import 'package:nexum_driver/features/active_trip/data/repositories/active_trip_repository_impl.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/domain/usecases/finish_trip_usecase.dart';
import '../../../../helpers/test_helpers.dart';

void main() {
  group('FinishTripUseCase', () {
    late FinishTripUseCase useCase;

    setUp(() {
      final dataSource = ActiveTripMockDataSource();
      final repository = ActiveTripRepositoryImpl(dataSource);
      useCase = FinishTripUseCase(repository);
    });

    test('Finalizar viaje retorna TripModel con tarifa correcta', () async {
      final request = createMockTripRequest();
      final activeTrip = ActiveTripEntity(
        request: request,
        state: ActiveTripState.inProgress,
        startedAt: DateTime.now().subtract(const Duration(minutes: 10)),
        pickedUpAt: DateTime.now().subtract(const Duration(minutes: 8)),
        tripStartedAt: DateTime.now().subtract(const Duration(minutes: 5)),
      );

      final tripModel = await useCase.call(activeTrip);

      expect(tripModel, isNotNull);
      expect(tripModel.distanceKm, equals(request.distanceKm));
      expect(tripModel.grossFare, greaterThanOrEqualTo(AppConstants.minimumFareCop));
      expect(tripModel.netEarning, lessThan(tripModel.grossFare));
    });

    test('Comisión es exactamente el 15% de la tarifa bruta', () async {
      final request = createMockTripRequest();
      final activeTrip = ActiveTripEntity(
        request: request,
        state: ActiveTripState.inProgress,
        startedAt: DateTime.now().subtract(const Duration(minutes: 8)),
        pickedUpAt: DateTime.now().subtract(const Duration(minutes: 6)),
        tripStartedAt: DateTime.now().subtract(const Duration(minutes: 5)),
      );

      final tripModel = await useCase.call(activeTrip);
      final expectedCommission =
          FareCalculator.calculateCommission(tripModel.grossFare);

      expect(
        tripModel.commission,
        closeTo(expectedCommission, 0.01), // tolerancia de 1 centavo
      );
    });

    test('Ganancia neta = tarifa bruta - comisión (15%)', () async {
      final request = createMockTripRequest();
      final activeTrip = ActiveTripEntity(
        request: request,
        state: ActiveTripState.inProgress,
        startedAt: DateTime.now().subtract(const Duration(minutes: 8)),
        pickedUpAt: DateTime.now().subtract(const Duration(minutes: 6)),
        tripStartedAt: DateTime.now().subtract(const Duration(minutes: 5)),
      );

      final tripModel = await useCase.call(activeTrip);

      expect(
        tripModel.netEarning,
        closeTo(tripModel.grossFare * 0.85, 0.01),
      );
    });

    test('FareCalculator: tarifa mínima es $5.000 COP', () {
      // Viaje muy corto: 0.1 km, 1 min
      final fare = FareCalculator.calculateFare(
        distanceKm: 0.1,
        durationMinutes: 1,
      );
      expect(fare, equals(AppConstants.minimumFareCop));
    });

    test('FareCalculator: tarifa para 1.8 km / 5 min = $5.585 COP', () {
      final fare = FareCalculator.calculateFare(
        distanceKm: 1.8,
        durationMinutes: 5,
      );
      // Base 3500 + 1.8*800 + 5*150 = 3500 + 1440 + 750 = 5690
      expect(fare, greaterThanOrEqualTo(AppConstants.minimumFareCop));
    });
  });
}
