import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/repositories/trip_requests_repository.dart';

/// Caso de uso: aceptar una solicitud de viaje entrante.
///
/// Transiciona [TripRequestStatus.pending] → [TripRequestStatus.accepted]
/// y devuelve la entidad actualizada lista para iniciar el viaje activo.
class AcceptTripUseCase {
  const AcceptTripUseCase(this._repository);

  final TripRequestsRepository _repository;

  Future<TripRequestEntity> call(TripRequestEntity request) {
    return _repository.acceptTrip(request);
  }
}
