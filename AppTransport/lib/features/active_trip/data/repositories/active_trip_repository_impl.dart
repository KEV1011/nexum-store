import 'package:nexum_driver/features/active_trip/data/datasources/active_trip_datasource.dart';
import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/active_trip/domain/repositories/active_trip_repository.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

/// Implementación de [ActiveTripRepository] que delega a [ActiveTripDataSource].
class ActiveTripRepositoryImpl implements ActiveTripRepository {
  ActiveTripRepositoryImpl({required ActiveTripDataSource dataSource})
      : _dataSource = dataSource;

  final ActiveTripDataSource _dataSource;

  @override
  Future<ActiveTripEntity> startNavigationToPickup(
    TripRequestEntity request,
  ) =>
      _dataSource.startNavigationToPickup(request);

  @override
  Future<ActiveTripEntity> arriveAtPassenger(ActiveTripEntity trip) =>
      _dataSource.arriveAtPassenger(trip);

  @override
  Future<ActiveTripEntity> startTrip(ActiveTripEntity trip) =>
      _dataSource.startTrip(trip);

  @override
  Future<TripModel> finishTrip(ActiveTripEntity trip) =>
      _dataSource.finishTrip(trip);
}
