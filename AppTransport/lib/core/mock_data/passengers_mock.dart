import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';

/// Pasajeros mock para simulación de solicitudes de viaje.
///
/// 5 pasajeros con nombres comunes de la región de Pamplona,
/// Norte de Santander, Colombia.
///
/// NOTA: Estos datos se reemplazarán con perfiles reales del API
/// cuando exista backend en la siguiente fase.
abstract final class PassengersMock {
  static const List<PassengerEntity> passengers = [
    PassengerEntity(
      id: 'pax_001',
      name: 'María Fernanda Rangel',
      rating: 4.9,
      totalTrips: 47,
      photoUrl:
          'https://ui-avatars.com/api/?name=Maria+Fernanda+Rangel&background=E91E63&color=fff&size=150',
    ),
    PassengerEntity(
      id: 'pax_002',
      name: 'Andrés Felipe Bautista',
      rating: 4.7,
      totalTrips: 83,
      photoUrl:
          'https://ui-avatars.com/api/?name=Andres+Felipe+Bautista&background=3F51B5&color=fff&size=150',
    ),
    PassengerEntity(
      id: 'pax_003',
      name: 'Laura Ximena Carvajal',
      rating: 4.5,
      totalTrips: 31,
      photoUrl:
          'https://ui-avatars.com/api/?name=Laura+Ximena+Carvajal&background=FF5722&color=fff&size=150',
    ),
    PassengerEntity(
      id: 'pax_004',
      name: 'Sebastián Mora Peñaranda',
      rating: 4.8,
      totalTrips: 112,
      photoUrl:
          'https://ui-avatars.com/api/?name=Sebastian+Mora&background=009688&color=fff&size=150',
    ),
    PassengerEntity(
      id: 'pax_005',
      name: 'Daniela Jaimes Ortega',
      rating: 4.3,
      totalTrips: 19,
      photoUrl:
          'https://ui-avatars.com/api/?name=Daniela+Jaimes+Ortega&background=9C27B0&color=fff&size=150',
    ),
  ];

  /// Returns the [PassengerEntity] whose [id] matches, falling back to the
  /// first element if no match is found.
  static PassengerEntity getById(String id) {
    return passengers.firstWhere(
      (p) => p.id == id,
      orElse: () => passengers.first,
    );
  }
}
