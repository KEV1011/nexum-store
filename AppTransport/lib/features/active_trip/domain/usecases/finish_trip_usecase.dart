import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/domain/repositories/active_trip_repository.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Caso de uso: finalizar el viaje activo.
///
/// Calcula la tarifa real con base en la distancia y los minutos transcurridos,
/// aplica la comisión del 15 % y retorna un [TripModel] completo listo para
/// persistir en el historial del conductor.
class FinishTripUseCase {
  const FinishTripUseCase(this._repository);

  final ActiveTripRepository _repository;

  Future<TripModel> call(ActiveTripEntity trip) {
    return _repository.finishTrip(trip);
  }
}
