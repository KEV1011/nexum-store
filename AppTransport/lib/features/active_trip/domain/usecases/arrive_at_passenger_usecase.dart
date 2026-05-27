import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/domain/repositories/active_trip_repository.dart';

/// Caso de uso: registrar que el conductor llegó al punto de recogida.
///
/// Transiciona [ActiveTripState.toPickup] → [ActiveTripState.waiting]
/// y establece [ActiveTripEntity.pickedUpAt].
class ArriveAtPassengerUseCase {
  const ArriveAtPassengerUseCase(this._repository);

  final ActiveTripRepository _repository;

  Future<ActiveTripEntity> call(ActiveTripEntity trip) {
    return _repository.arriveAtPassenger(trip);
  }
}
