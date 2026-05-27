import 'package:nexum_driver/features/profile/domain/entities/driver_profile_entity.dart';

/// Interfaz abstracta del repositorio de perfil del conductor.
abstract interface class ProfileRepository {
  Future<DriverProfileEntity> getProfile();
}
