import 'package:nexum_driver/features/driver_status/data/datasources/driver_status_datasource.dart';
import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/features/driver_status/domain/repositories/driver_status_repository.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

/// Implementación concreta de [DriverStatusRepository] que delega
/// todas las operaciones al datasource en memoria [DriverStatusDataSource].
///
/// Esta clase es el puente entre el dominio y los datos. En el MVP usa
/// almacenamiento en memoria; cuando exista un backend se reemplazará
/// únicamente esta clase (y el datasource) sin tocar el dominio.
class DriverStatusRepositoryImpl implements DriverStatusRepository {
  const DriverStatusRepositoryImpl({required this.dataSource});

  final DriverStatusDataSource dataSource;

  @override
  Future<DriverStatusEntity> getStatus() => dataSource.getStatus();

  @override
  Future<DriverStatusEntity> goOnline(LocationModel currentLocation) =>
      dataSource.goOnline(currentLocation);

  @override
  Future<DriverStatusEntity> goOffline() => dataSource.goOffline();

  @override
  Future<DriverStatusEntity> updateLocation(LocationModel location) =>
      dataSource.updateLocation(location);

  @override
  Future<DriverStatusEntity> addCompletedTrip(double earnings) =>
      dataSource.addCompletedTrip(earnings);
}
