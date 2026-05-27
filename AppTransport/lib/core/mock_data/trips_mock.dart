/// Datos mock de solicitudes de viaje para la fase MVP.
///
/// 10 rutas de viaje en Pamplona, Norte de Santander, Colombia.
/// Coordenadas reales de puntos de referencia conocidos en la ciudad.
///
/// NOTA: Estos datos se reemplazarán con solicitudes reales del API
/// cuando exista backend en la siguiente fase.
abstract final class TripsMock {
  static const List<TripRequestData> tripRequests = [
    // trip_001: Parque Águeda Gallardo → Universidad de Pamplona
    TripRequestData(
      id: 'trip_001',
      originLat: 7.3754,
      originLng: -72.6486,
      originAddress: 'Parque Águeda Gallardo',
      destinationLat: 7.3700,
      destinationLng: -72.6530,
      destinationAddress: 'Universidad de Pamplona',
      distanceKm: 1.8,
      durationMinutes: 5,
      estimatedFare: 5585.0,
      distanceToPickupKm: 0.3,
      etaToPickupMinutes: 1,
    ),

    // trip_002: Terminal de Transportes → Barrio El Buque
    TripRequestData(
      id: 'trip_002',
      originLat: 7.3820,
      originLng: -72.6440,
      originAddress: 'Terminal de Transportes',
      destinationLat: 7.3850,
      destinationLng: -72.6420,
      destinationAddress: 'Barrio El Buque',
      distanceKm: 1.2,
      durationMinutes: 3,
      estimatedFare: 5000.0,
      distanceToPickupKm: 0.5,
      etaToPickupMinutes: 2,
    ),

    // trip_003: Hospital San Juan de Dios → Cristo Rey
    TripRequestData(
      id: 'trip_003',
      originLat: 7.3690,
      originLng: -72.6500,
      originAddress: 'Hospital San Juan de Dios',
      destinationLat: 7.3900,
      destinationLng: -72.6600,
      destinationAddress: 'Cristo Rey',
      distanceKm: 2.5,
      durationMinutes: 6,
      estimatedFare: 6400.0,
      distanceToPickupKm: 0.8,
      etaToPickupMinutes: 2,
    ),

    // trip_004: Universidad de Pamplona → Barrio Cariongo
    TripRequestData(
      id: 'trip_004',
      originLat: 7.3700,
      originLng: -72.6530,
      originAddress: 'Universidad de Pamplona',
      destinationLat: 7.3650,
      destinationLng: -72.6550,
      destinationAddress: 'Barrio Cariongo',
      distanceKm: 2.0,
      durationMinutes: 5,
      estimatedFare: 5820.0,
      distanceToPickupKm: 0.4,
      etaToPickupMinutes: 1,
    ),

    // trip_005: Catedral Santa Clara → Barrio Chapinero
    TripRequestData(
      id: 'trip_005',
      originLat: 7.3760,
      originLng: -72.6490,
      originAddress: 'Catedral Santa Clara',
      destinationLat: 7.3700,
      destinationLng: -72.6600,
      destinationAddress: 'Barrio Chapinero',
      distanceKm: 1.5,
      durationMinutes: 4,
      estimatedFare: 5240.0,
      distanceToPickupKm: 0.2,
      etaToPickupMinutes: 1,
    ),

    // trip_006: Barrio San Francisco → Universidad de Pamplona
    TripRequestData(
      id: 'trip_006',
      originLat: 7.3780,
      originLng: -72.6450,
      originAddress: 'Barrio San Francisco',
      destinationLat: 7.3700,
      destinationLng: -72.6530,
      destinationAddress: 'Universidad de Pamplona',
      distanceKm: 2.2,
      durationMinutes: 5,
      estimatedFare: 6055.0,
      distanceToPickupKm: 0.6,
      etaToPickupMinutes: 2,
    ),

    // trip_007: Centro Comercial Pamplona → Terminal de Transportes
    TripRequestData(
      id: 'trip_007',
      originLat: 7.3740,
      originLng: -72.6470,
      originAddress: 'Centro Comercial Pamplona',
      destinationLat: 7.3820,
      destinationLng: -72.6440,
      destinationAddress: 'Terminal de Transportes',
      distanceKm: 1.0,
      durationMinutes: 3,
      estimatedFare: 5000.0,
      distanceToPickupKm: 0.3,
      etaToPickupMinutes: 1,
    ),

    // trip_008: Universidad de Pamplona → Cristo Rey Mirador
    TripRequestData(
      id: 'trip_008',
      originLat: 7.3700,
      originLng: -72.6530,
      originAddress: 'Universidad de Pamplona',
      destinationLat: 7.3900,
      destinationLng: -72.6600,
      destinationAddress: 'Cristo Rey Mirador',
      distanceKm: 3.2,
      durationMinutes: 8,
      estimatedFare: 7215.0,
      distanceToPickupKm: 0.7,
      etaToPickupMinutes: 2,
    ),

    // trip_009: Parque Águeda Gallardo → Barrio Ciudad Jardín
    TripRequestData(
      id: 'trip_009',
      originLat: 7.3754,
      originLng: -72.6486,
      originAddress: 'Parque Águeda Gallardo',
      destinationLat: 7.3820,
      destinationLng: -72.6560,
      destinationAddress: 'Barrio Ciudad Jardín',
      distanceKm: 2.8,
      durationMinutes: 7,
      estimatedFare: 6745.0,
      distanceToPickupKm: 0.2,
      etaToPickupMinutes: 1,
    ),

    // trip_010: Hospital San Juan de Dios → Universidad de Pamplona
    TripRequestData(
      id: 'trip_010',
      originLat: 7.3690,
      originLng: -72.6500,
      originAddress: 'Hospital San Juan de Dios',
      destinationLat: 7.3700,
      destinationLng: -72.6530,
      destinationAddress: 'Universidad de Pamplona',
      distanceKm: 1.7,
      durationMinutes: 4,
      estimatedFare: 5475.0,
      distanceToPickupKm: 0.5,
      etaToPickupMinutes: 2,
    ),
  ];
}

/// Datos de una solicitud de viaje estática para el modo mock.
///
/// Contiene toda la información necesaria que el conductor ve en la
/// pantalla de solicitud de viaje entrante.
class TripRequestData {
  const TripRequestData({
    required this.id,
    required this.originLat,
    required this.originLng,
    required this.originAddress,
    required this.destinationLat,
    required this.destinationLng,
    required this.destinationAddress,
    required this.distanceKm,
    required this.durationMinutes,
    required this.estimatedFare,
    required this.distanceToPickupKm,
    required this.etaToPickupMinutes,
  });

  /// Identificador único del viaje.
  final String id;

  /// Latitud del punto de recogida.
  final double originLat;

  /// Longitud del punto de recogida.
  final double originLng;

  /// Dirección textual del punto de recogida.
  final String originAddress;

  /// Latitud del destino.
  final double destinationLat;

  /// Longitud del destino.
  final double destinationLng;

  /// Dirección textual del destino.
  final String destinationAddress;

  /// Distancia total del viaje en kilómetros.
  final double distanceKm;

  /// Duración estimada del viaje en minutos.
  final int durationMinutes;

  /// Tarifa estimada en COP para mostrar al conductor.
  final double estimatedFare;

  /// Distancia desde la posición actual del conductor al punto de recogida.
  final double distanceToPickupKm;

  /// Tiempo estimado para llegar al punto de recogida en minutos.
  final int etaToPickupMinutes;

  @override
  String toString() => 'TripRequestData(id: $id, '
      'origin: $originAddress, destination: $destinationAddress, '
      'fare: \$$estimatedFare, distance: ${distanceKm}km)';
}
