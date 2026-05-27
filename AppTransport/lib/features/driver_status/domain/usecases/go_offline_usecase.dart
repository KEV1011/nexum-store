import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/features/driver_status/domain/repositories/driver_status_repository.dart';

/// Use case: desconecta al conductor de la plataforma.
///
/// Llama a [DriverStatusRepository.goOffline] y retorna el
/// [DriverStatusEntity] actualizado con estado [DriverStatus.offline].
class GoOfflineUseCase {
  const GoOfflineUseCase({required this.repository});

  final DriverStatusRepository repository;

  /// Ejecuta el use case.
  ///
  /// Returns el [DriverStatusEntity] actualizado.
  /// Throws si el repositorio falla.
  Future<DriverStatusEntity> call() async {
    return repository.goOffline();
  }
}
