import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';

/// Repositorio abstracto para gestión de solicitudes de viaje.
abstract interface class TripRequestsRepository {
  /// Acepta la solicitud de viaje y retorna la entidad actualizada.
  Future<TripRequestEntity> acceptTrip(TripRequestEntity request);

  /// Rechaza la solicitud de viaje.
  Future<void> rejectTrip(TripRequestEntity request);

  /// Retorna un stream de solicitudes de viaje entrantes.
  Stream<TripRequestEntity> watchIncomingRequests();
}
