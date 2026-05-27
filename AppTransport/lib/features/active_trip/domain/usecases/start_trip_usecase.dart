import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/domain/repositories/active_trip_repository.dart';

/// Caso de uso: iniciar el viaje (pasajero a bordo, navegando al destino).
///
/// Transiciona [ActiveTripState.waiting] → [ActiveTripState.inProgress]
/// y establece [ActiveTripEntity.tripStartedAt].
class StartTripUseCase {
  const StartTripUseCase(this._repository);

  final ActiveTripRepository _repository;

  Future<ActiveTripEntity> call(ActiveTripEntity trip) {
    return _repository.startTrip(trip);
  }
}
