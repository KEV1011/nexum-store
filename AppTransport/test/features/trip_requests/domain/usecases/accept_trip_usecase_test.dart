import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/trip_requests/data/datasources/trip_requests_datasource.dart';
import 'package:nexum_driver/features/trip_requests/data/repositories/trip_requests_repository_impl.dart';
import 'package:nexum_driver/features/trip_requests/domain/usecases/accept_trip_usecase.dart';
import '../../../../helpers/test_helpers.dart';

void main() {
  group('AcceptTripUseCase', () {
    late AcceptTripUseCase useCase;

    setUp(() {
      final dataSource = TripRequestsMockDataSource();
      final repository = TripRequestsRepositoryImpl(dataSource);
      useCase = AcceptTripUseCase(repository);
    });

    test('Aceptar viaje válido retorna true', () async {
      final request = createMockTripRequest();
      final result = await useCase.call(request);
      expect(result, isTrue);
    });

    test('La solicitud de viaje tiene los campos correctos', () {
      final request = createMockTripRequest(id: 'trip_001');
      expect(request.id, equals('trip_001'));
      expect(request.distanceKm, equals(1.8));
      expect(request.durationMinutes, equals(5));
      expect(request.estimatedFare, equals(5585));
      expect(request.passenger.name, equals('María Fernanda Rangel'));
    });

    test('Viaje tiene origen y destino en Pamplona', () {
      final request = createMockTripRequest();
      // Verificar que las coordenadas están en el rango de Pamplona
      expect(request.origin.latitude, greaterThan(7.35));
      expect(request.origin.latitude, lessThan(7.40));
      expect(request.origin.longitude, greaterThan(-72.67));
      expect(request.origin.longitude, lessThan(-72.62));
    });
  });
}
