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
}

/// Clase de vehículo para viajes compartidos. Define la capacidad sugerida y
/// el tope de puestos, y le dice al pasajero si viaja en carro o en van.
/// Los valores `name` coinciden con el enum del backend ('sedan'/'suv'/...).
enum PooledVehicleType {
  sedan,
  suv,
  van,
  minibus;

  static PooledVehicleType fromApi(String? s) => PooledVehicleType.values
      .firstWhere((v) => v.name == s, orElse: () => PooledVehicleType.sedan);

  String get label => switch (this) {
        PooledVehicleType.sedan => 'Carro',
        PooledVehicleType.suv => 'Camioneta',
        PooledVehicleType.van => 'Van',
        PooledVehicleType.minibus => 'Buseta',
      };

  String get hint => switch (this) {
        PooledVehicleType.sedan => 'Sedán · hasta 4 pasajeros',
        PooledVehicleType.suv => 'Camioneta · hasta 6 pasajeros',
        PooledVehicleType.van => 'Van · hasta 14 pasajeros',
        PooledVehicleType.minibus => 'Buseta · hasta 19 pasajeros',
      };

  IconData get icon => switch (this) {
        PooledVehicleType.sedan => Icons.directions_car_rounded,
        PooledVehicleType.suv => Icons.directions_car_filled_rounded,
        PooledVehicleType.van => Icons.airport_shuttle_rounded,
        PooledVehicleType.minibus => Icons.directions_bus_rounded,
      };

  /// Puestos precargados al elegir el tipo (el conductor puede ajustar).
  int get defaultSeats => switch (this) {
        PooledVehicleType.sedan => 4,
        PooledVehicleType.suv => 5,
        PooledVehicleType.van => 11,
        PooledVehicleType.minibus => 16,
      };

  /// Tope de puestos por tipo — debe coincidir con POOLED_VEHICLE_MAX_SEATS
  /// del backend (carro 4, camioneta 6, van 14, buseta 19).
  int get maxSeats => switch (this) {
        PooledVehicleType.sedan => 4,
        PooledVehicleType.suv => 6,
        PooledVehicleType.van => 14,
        PooledVehicleType.minibus => 19,
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
    this.seatNumbers = const [],
    this.pickupAddress,
    this.notes,
  });

  final String id;
  final String passengerName;
  final String passengerPhone;
  final int seatsBooked;
  final List<int> seatNumbers;
  final String? pickupAddress;
  final String? notes;

  factory PooledSeatBooking.fromJson(Map<String, dynamic> j) => PooledSeatBooking(
        id: j['id'] as String? ?? '',
        passengerName: j['passengerName'] as String? ?? '',
        passengerPhone: j['passengerPhone'] as String? ?? '',
        seatsBooked: (j['seatsBooked'] as num?)?.toInt() ?? 1,
        seatNumbers: (j['seatNumbers'] as List<dynamic>? ?? [])
            .whereType<num>()
            .map((n) => n.toInt())
            .toList(),
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
    required this.vehicleType,
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
  final PooledVehicleType vehicleType;
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
        vehicleType: PooledVehicleType.fromApi(j['vehicleType'] as String?),
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
