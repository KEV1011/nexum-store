import 'package:flutter/material.dart';
import 'package:nexum_driver/app/theme/app_colors.dart';

/// Ciudades disponibles para viajes compartidos. Los nombres coinciden con
/// el enum `IntercityCity` del backend.
enum PooledCity {
  pamplona,
  cucuta,
  bucaramanga,
  chitaga,
  malaga,
  ocana,
  bogota;

  String get displayName => switch (this) {
        PooledCity.pamplona => 'Pamplona',
        PooledCity.cucuta => 'Cúcuta',
        PooledCity.bucaramanga => 'Bucaramanga',
        PooledCity.chitaga => 'Chitagá',
        PooledCity.malaga => 'Málaga',
        PooledCity.ocana => 'Ocaña',
        PooledCity.bogota => 'Bogotá',
      };

  static PooledCity fromApi(String? s) => PooledCity.values.firstWhere(
        (c) => c.name == s,
        orElse: () => PooledCity.pamplona,
      );

  /// Centroide municipal (paridad con INTERCITY_CITY_COORDS del backend) para
  /// pintar la ruta del viaje en el mapa.
  ({double lat, double lng}) get coords => switch (this) {
        PooledCity.pamplona => (lat: 7.3754, lng: -72.6486),
        PooledCity.cucuta => (lat: 7.8939, lng: -72.5078),
        PooledCity.bucaramanga => (lat: 7.1193, lng: -73.1227),
        PooledCity.chitaga => (lat: 6.9000, lng: -72.6660),
        PooledCity.malaga => (lat: 6.6983, lng: -72.7333),
        PooledCity.ocana => (lat: 8.2375, lng: -73.3561),
        PooledCity.bogota => (lat: 4.7110, lng: -74.0721),
      };
}

enum PooledTripStatus {
  open,
  full,
  departed,
  completed,
  cancelled;

  static PooledTripStatus fromApi(String? s) => switch (s) {
        'open' => PooledTripStatus.open,
        'full' => PooledTripStatus.full,
        'departed' => PooledTripStatus.departed,
        'completed' => PooledTripStatus.completed,
        'cancelled' => PooledTripStatus.cancelled,
        _ => PooledTripStatus.open,
      };

  String get label => switch (this) {
        PooledTripStatus.open => 'Abierto',
        PooledTripStatus.full => 'Completo',
        PooledTripStatus.departed => 'En camino',
        PooledTripStatus.completed => 'Finalizado',
        PooledTripStatus.cancelled => 'Cancelado',
      };

  Color get color => switch (this) {
        PooledTripStatus.open => AppColors.success,
        PooledTripStatus.full => AppColors.warning,
        PooledTripStatus.departed => AppColors.secondary,
        PooledTripStatus.completed => AppColors.info,
        PooledTripStatus.cancelled => AppColors.error,
      };

  bool get isLive =>
      this == PooledTripStatus.open || this == PooledTripStatus.full;
}

class PooledSeatBooking {
  const PooledSeatBooking({
    required this.id,
    required this.passengerName,
    required this.passengerPhone,
    required this.seatsBooked,
    this.pickupAddress,
    this.notes,
  });

  final String id;
  final String passengerName;
  final String passengerPhone;
  final int seatsBooked;
  final String? pickupAddress;
  final String? notes;

  factory PooledSeatBooking.fromJson(Map<String, dynamic> j) => PooledSeatBooking(
        id: j['id'] as String? ?? '',
        passengerName: j['passengerName'] as String? ?? '',
        passengerPhone: j['passengerPhone'] as String? ?? '',
        seatsBooked: (j['seatsBooked'] as num?)?.toInt() ?? 1,
        pickupAddress: j['pickupAddress'] as String?,
        notes: j['notes'] as String?,
      );
}

class PooledTripEntity {
  const PooledTripEntity({
    required this.id,
    required this.tripRef,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.totalSeats,
    required this.availableSeats,
    required this.farePerSeat,
    required this.maxFarePerSeat,
    required this.allowFleet,
    required this.status,
    required this.vehicleDescription,
    this.notes,
    this.distanceKm,
    this.durationMinutes,
    this.bookings = const [],
  });

  final String id;
  final String tripRef;
  final PooledCity origin;
  final PooledCity destination;
  final DateTime departureTime;
  final int totalSeats;
  final int availableSeats;
  final double farePerSeat;
  final double maxFarePerSeat;
  final bool allowFleet;
  final PooledTripStatus status;
  final String vehicleDescription;
  final String? notes;
  final double? distanceKm;
  final int? durationMinutes;
  final List<PooledSeatBooking> bookings;

  int get bookedSeats => totalSeats - availableSeats;

  factory PooledTripEntity.fromJson(Map<String, dynamic> j) => PooledTripEntity(
        id: j['id'] as String? ?? '',
        tripRef: j['tripRef'] as String? ?? '',
        origin: PooledCity.fromApi(j['origin'] as String?),
        destination: PooledCity.fromApi(j['destination'] as String?),
        departureTime:
            DateTime.tryParse(j['departureTime'] as String? ?? '') ?? DateTime.now(),
        totalSeats: (j['totalSeats'] as num?)?.toInt() ?? 0,
        availableSeats: (j['availableSeats'] as num?)?.toInt() ?? 0,
        farePerSeat: (j['farePerSeat'] as num?)?.toDouble() ?? 0,
        maxFarePerSeat: (j['maxFarePerSeat'] as num?)?.toDouble() ?? 0,
        allowFleet: j['allowFleet'] as bool? ?? false,
        status: PooledTripStatus.fromApi(j['status'] as String?),
        vehicleDescription: j['vehicleDescription'] as String? ?? '',
        notes: j['notes'] as String?,
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
        durationMinutes: (j['durationMinutes'] as num?)?.toInt(),
        bookings: (j['bookings'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(PooledSeatBooking.fromJson)
            .toList(),
      );
}
