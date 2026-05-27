import 'package:nexum_driver/features/trip_requests/data/datasources/trip_requests_datasource.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/repositories/trip_requests_repository.dart';

/// Implementación concreta de [TripRequestsRepository] que delega
/// todas las operaciones al datasource mock [TripRequestsDataSource].
///
/// Esta clase es el puente entre el dominio y los datos. Cuando exista
/// backend real solo se reemplaza esta clase y el datasource, sin
/// afectar el dominio ni la presentación.
class TripRequestsRepositoryImpl implements TripRequestsRepository {
  const TripRequestsRepositoryImpl({required this.dataSource});

  final TripRequestsDataSource dataSource;

  @override
  Future<TripRequestEntity> acceptTrip(TripRequestEntity request) =>
      dataSource.acceptTrip(request);

  @override
  Future<void> rejectTrip(TripRequestEntity request) =>
      dataSource.rejectTrip(request);

  @override
  Stream<TripRequestEntity> watchIncomingRequests() {
    // En el MVP el stream de solicitudes lo gestiona el HomeScreen
    // a través de un timer. Este método queda disponible para
    // implementación futura vía WebSocket o Server-Sent Events.
    return const Stream.empty();
  }
}
