import 'package:nexum_driver/features/profile/data/datasources/profile_datasource.dart';
import 'package:nexum_driver/features/profile/domain/entities/driver_profile_entity.dart';
import 'package:nexum_driver/features/profile/domain/repositories/profile_repository.dart';

/// Implementación mock del repositorio de perfil.
class ProfileRepositoryImpl implements ProfileRepository {
  ProfileRepositoryImpl(this._dataSource);
  final ProfileMockDataSource _dataSource;

  @override
  Future<DriverProfileEntity> getProfile() => _dataSource.getProfile();
}
