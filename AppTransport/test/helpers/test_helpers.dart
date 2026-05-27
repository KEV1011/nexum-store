import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

export 'package:flutter_test/flutter_test.dart';

/// Datos de prueba compartidos entre todos los tests del proyecto Nexum Driver.

/// Conductor mock para tests
DriverEntity createMockDriver({
  String id = 'drv_test',
  String name = 'Juan Carlos Villamizar',
  String phone = '+57 312 456 7890',
  double rating = 4.87,
}) {
  return DriverEntity(
    id: id,
    name: name,
    phone: phone,
    rating: rating,
    totalTrips: 100,
    vehiclePlate: 'KGB-742',
    vehicleDescription: 'Chevrolet Spark GT 2020',
    isVerified: true,
  );
}

/// Pasajero mock para tests
PassengerEntity createMockPassenger({
  String id = 'pax_test',
  String name = 'María Fernanda Rangel',
  double rating = 4.9,
}) {
  return PassengerEntity(
    id: id,
    name: name,
    rating: rating,
    totalTrips: 50,
    photoUrl: 'https://example.com/photo.jpg',
  );
}

/// Ubicación mock (Parque Pamplona)
const mockOriginLocation = LocationModel(
  latitude: 7.3754,
  longitude: -72.6486,
  address: 'Parque Águeda Gallardo, Pamplona',
);

/// Ubicación destino mock (Universidad de Pamplona)
const mockDestinationLocation = LocationModel(
  latitude: 7.3700,
  longitude: -72.6530,
  address: 'Universidad de Pamplona, Campus Principal',
);

/// Solicitud de viaje mock
TripRequestEntity createMockTripRequest({
  String id = 'trip_test',
}) {
  return TripRequestEntity(
    id: id,
    passenger: createMockPassenger(),
    origin: mockOriginLocation,
    destination: mockDestinationLocation,
    distanceKm: 1.8,
    durationMinutes: 5,
    estimatedFare: 5585,
    distanceToPickupKm: 0.3,
    etaToPickupMinutes: 1,
    requestedAt: DateTime.now(),
  );
}

/// Viaje completado mock
TripModel createMockCompletedTrip({
  String id = 'completed_test',
  double netEarning = 4_751.25,
}) {
  return TripModel(
    id: id,
    passengerId: 'pax_test',
    passengerName: 'María Fernanda Rangel',
    origin: mockOriginLocation,
    destination: mockDestinationLocation,
    distanceKm: 1.8,
    durationMinutes: 5,
    grossFare: 5585,
    netEarning: netEarning,
    commission: 5585 - netEarning,
    startedAt: DateTime.now().subtract(const Duration(minutes: 10)),
    finishedAt: DateTime.now(),
    rating: 4.8,
  );
}
