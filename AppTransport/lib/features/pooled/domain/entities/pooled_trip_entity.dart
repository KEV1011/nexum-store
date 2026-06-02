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
  bogota,
  medellin,
  chinacota,
  cacota,
  silos,
  mutiscua,
  pamplonita;

  String get displayName => switch (this) {
        PooledCity.pamplona => 'Pamplona',
        PooledCity.cucuta => 'Cúcuta',
        PooledCity.bucaramanga => 'Bucaramanga',
        PooledCity.chitaga => 'Chitagá',
        PooledCity.malaga => 'Málaga',
        PooledCity.ocana => 'Ocaña',
        PooledCity.bogota => 'Bogotá',
        PooledCity.medellin => 'Medellín',
        PooledCity.chinacota => 'Chinácota',
        PooledCity.cacota => 'Cácota',
        PooledCity.silos => 'Silos',
        PooledCity.mutiscua => 'Mutiscua',
        PooledCity.pamplonita => 'Pamplonita',
      };

  static PooledCity fromApi(String? s) => PooledCity.values.firstWhere(
        (c) => c.name == s,
        orElse: () => PooledCity.pamplona,
      );
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

  Map<String, dynamic> toJson() => {
        'id': id,
        'passengerName': passengerName,
        'passengerPhone': passengerPhone,
        'seatsBooked': seatsBooked,
        if (pickupAddress != null) 'pickupAddress': pickupAddress,
        if (notes != null) 'notes': notes,
      };
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
    this.isCompanyOffer = false,
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

  /// Oferta de empresa intermunicipal (vs. conductor particular).
  final bool isCompanyOffer;

  int get bookedSeats => totalSeats - availableSeats;

  /// Ingreso potencial total del viaje (todos los puestos vendidos).
  double get potentialEarnings => farePerSeat * totalSeats;

  /// Ingreso ya asegurado por los puestos reservados.
  double get currentEarnings => farePerSeat * bookedSeats;

  /// Copia inmutable — usada por el store local para simular reservas en vivo
  /// sin mutar la instancia original.
  PooledTripEntity copyWith({
    int? availableSeats,
    PooledTripStatus? status,
    List<PooledSeatBooking>? bookings,
  }) =>
      PooledTripEntity(
        id: id,
        tripRef: tripRef,
        origin: origin,
        destination: destination,
        departureTime: departureTime,
        totalSeats: totalSeats,
        availableSeats: availableSeats ?? this.availableSeats,
        farePerSeat: farePerSeat,
        maxFarePerSeat: maxFarePerSeat,
        allowFleet: allowFleet,
        status: status ?? this.status,
        vehicleDescription: vehicleDescription,
        notes: notes,
        distanceKm: distanceKm,
        durationMinutes: durationMinutes,
        bookings: bookings ?? this.bookings,
        isCompanyOffer: isCompanyOffer,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'tripRef': tripRef,
        'origin': origin.name,
        'destination': destination.name,
        'departureTime': departureTime.toIso8601String(),
        'totalSeats': totalSeats,
        'availableSeats': availableSeats,
        'farePerSeat': farePerSeat,
        'maxFarePerSeat': maxFarePerSeat,
        'allowFleet': allowFleet,
        'status': status.name,
        'vehicleDescription': vehicleDescription,
        if (notes != null) 'notes': notes,
        if (distanceKm != null) 'distanceKm': distanceKm,
        if (durationMinutes != null) 'durationMinutes': durationMinutes,
        'bookings': bookings.map((b) => b.toJson()).toList(),
        'isCompanyOffer': isCompanyOffer,
      };

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
        isCompanyOffer: j['isCompanyOffer'] as bool? ?? false,
      );
}
