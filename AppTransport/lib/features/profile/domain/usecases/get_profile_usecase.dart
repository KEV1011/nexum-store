import 'package:nexum_driver/features/profile/domain/entities/driver_profile_entity.dart';
import 'package:nexum_driver/features/profile/domain/repositories/profile_repository.dart';

/// Caso de uso: obtener el perfil del conductor autenticado.
class GetProfileUseCase {
  const GetProfileUseCase(this._repository);
  final ProfileRepository _repository;

  Future<DriverProfileEntity> call() => _repository.getProfile();
}
