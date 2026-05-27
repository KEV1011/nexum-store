import 'package:nexum_driver/features/active_trip/domain/entities/active_trip_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

abstract interface class ActiveTripRepository {
  Future<ActiveTripEntity> startNavigationToPickup(TripRequestEntity request);
  Future<ActiveTripEntity> arriveAtPassenger(ActiveTripEntity trip);
  Future<ActiveTripEntity> startTrip(ActiveTripEntity trip);
  Future<TripModel> finishTrip(ActiveTripEntity trip);
}
