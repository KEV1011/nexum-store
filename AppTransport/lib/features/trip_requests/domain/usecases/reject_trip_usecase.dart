import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/repositories/trip_requests_repository.dart';

/// Use case: rechaza una solicitud de viaje entrante.
///
/// Llama a [TripRequestsRepository.rejectTrip] con la entidad completa.
/// No retorna valor; cualquier fallo lanza una excepción.
class RejectTripUseCase {
  const RejectTripUseCase({required this.repository});

  final TripRequestsRepository repository;

  /// Ejecuta el use case.
  ///
  /// [request] — La solicitud de viaje que el conductor rechazó (o expiró).
  /// Throws [Exception] si el repositorio falla.
  Future<void> call(TripRequestEntity request) async {
    return repository.rejectTrip(request);
  }
}
