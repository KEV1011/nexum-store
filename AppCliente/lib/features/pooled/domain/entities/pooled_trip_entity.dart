import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/features/intercity/domain/entities/intercity_entity.dart'
    show IntercityCity;

/// Estado de un viaje compartido (Modelo A: el conductor publica, el pasajero
/// reserva puestos hasta llenar el vehículo).
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
        PooledTripStatus.open => 'Disponible',
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

  bool get isActive =>
      this == PooledTripStatus.open ||
      this == PooledTripStatus.full ||
      this == PooledTripStatus.departed;
}

IntercityCity _cityFromApi(String? s) => IntercityCity.values.firstWhere(
      (c) => c.name == s,
      orElse: () => IntercityCity.pamplona,
    );

/// La reserva del propio pasajero dentro de un viaje compartido.
class SeatBookingEntity {
  const SeatBookingEntity({
    required this.id,
    required this.tripId,
    required this.passengerName,
    required this.seatsBooked,
    required this.status,
    this.pickupAddress,
    this.notes,
  });

  final String id;
  final String tripId;
  final String passengerName;
  final int seatsBooked;
  final String status;
  final String? pickupAddress;
  final String? notes;

  factory SeatBookingEntity.fromJson(Map<String, dynamic> j) => SeatBookingEntity(
        id: j['id'] as String? ?? '',
        tripId: j['tripId'] as String? ?? '',
        passengerName: j['passengerName'] as String? ?? '',
        seatsBooked: (j['seatsBooked'] as num?)?.toInt() ?? 1,
        status: j['status'] as String? ?? 'confirmed',
        pickupAddress: j['pickupAddress'] as String?,
        notes: j['notes'] as String?,
      );
}

/// Un viaje compartido publicado por un conductor particular.
class PooledTripEntity {
  const PooledTripEntity({
    required this.id,
    required this.tripRef,
    required this.driverName,
    required this.driverPhone,
    required this.vehicleDescription,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.totalSeats,
    required this.availableSeats,
    required this.farePerSeat,
    required this.allowFleet,
    required this.status,
    this.notes,
    this.distanceKm,
    this.durationMinutes,
    this.myBooking,
  });

  final String id;
  final String tripRef;
  final String driverName;
  final String driverPhone;
  final String vehicleDescription;
  final IntercityCity origin;
  final IntercityCity destination;
  final DateTime departureTime;
  final int totalSeats;
  final int availableSeats;
  final double farePerSeat;
  final bool allowFleet;
  final PooledTripStatus status;
  final String? notes;
  final double? distanceKm;
  final int? durationMinutes;

  /// Present only in "mis reservas": the caller's own booking on this trip.
  final SeatBookingEntity? myBooking;

  int get bookedSeats => totalSeats - availableSeats;
  bool get hasSeats => availableSeats > 0;

  String get durationLabel {
    final mins = durationMinutes ?? 0;
    final h = mins ~/ 60;
    final m = mins % 60;
    if (h == 0) return '${m}min';
    if (m == 0) return '${h}h';
    return '${h}h ${m}min';
  }

  factory PooledTripEntity.fromJson(Map<String, dynamic> j) => PooledTripEntity(
        id: j['id'] as String? ?? '',
        tripRef: j['tripRef'] as String? ?? '',
        driverName: j['driverName'] as String? ?? 'Conductor',
        driverPhone: j['driverPhone'] as String? ?? '',
        vehicleDescription: j['vehicleDescription'] as String? ?? '',
        origin: _cityFromApi(j['origin'] as String?),
        destination: _cityFromApi(j['destination'] as String?),
        departureTime:
            DateTime.tryParse(j['departureTime'] as String? ?? '') ?? DateTime.now(),
        totalSeats: (j['totalSeats'] as num?)?.toInt() ?? 0,
        availableSeats: (j['availableSeats'] as num?)?.toInt() ?? 0,
        farePerSeat: (j['farePerSeat'] as num?)?.toDouble() ?? 0,
        allowFleet: j['allowFleet'] as bool? ?? false,
        status: PooledTripStatus.fromApi(j['status'] as String?),
        notes: j['notes'] as String?,
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
        durationMinutes: (j['durationMinutes'] as num?)?.toInt(),
        myBooking: j['myBooking'] is Map<String, dynamic>
            ? SeatBookingEntity.fromJson(j['myBooking'] as Map<String, dynamic>)
            : null,
      );

  PooledTripEntity copyWith({
    int? availableSeats,
    PooledTripStatus? status,
  }) =>
      PooledTripEntity(
        id: id,
        tripRef: tripRef,
        driverName: driverName,
        driverPhone: driverPhone,
        vehicleDescription: vehicleDescription,
        origin: origin,
        destination: destination,
        departureTime: departureTime,
        totalSeats: totalSeats,
        availableSeats: availableSeats ?? this.availableSeats,
        farePerSeat: farePerSeat,
        allowFleet: allowFleet,
        status: status ?? this.status,
        notes: notes,
        distanceKm: distanceKm,
        durationMinutes: durationMinutes,
        myBooking: myBooking,
      );
}
