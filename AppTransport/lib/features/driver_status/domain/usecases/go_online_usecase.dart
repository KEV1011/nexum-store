import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/features/driver_status/domain/repositories/driver_status_repository.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

/// Use case: pone al conductor en línea con la ubicación dada.
///
/// No impone límites geográficos: la plataforma opera donde haya oferta y
/// demanda — el matching del backend ya es geográfico (PostGIS) y solo
/// empareja viajes cercanos al conductor.
class GoOnlineUseCase {
  const GoOnlineUseCase({required this.repository});

  final DriverStatusRepository repository;

  /// Ejecuta el use case.
  ///
  /// [location] — Ubicación actual del conductor.
  /// Returns el [DriverStatusEntity] actualizado con estado [DriverStatus.online].
  /// Throws si el repositorio falla.
  Future<DriverStatusEntity> call(LocationModel location) {
    return repository.goOnline(location);
  }
}
