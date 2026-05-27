import 'package:nexum_driver/features/driver_status/domain/entities/driver_status_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

abstract interface class DriverStatusRepository {
  Future<DriverStatusEntity> getStatus();
  Future<DriverStatusEntity> goOnline(LocationModel currentLocation);
  Future<DriverStatusEntity> goOffline();
  Future<DriverStatusEntity> updateLocation(LocationModel location);
  Future<DriverStatusEntity> addCompletedTrip(double earnings);
}
