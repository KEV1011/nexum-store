import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';

// ── Ciudades disponibles ──────────────────────────────────────────────────────

enum IntercityCity {
  pamplona,
  cucuta,
  bucaramanga,
  chitaga,
  malaga,
  ocana,
  bogota;

  String get displayName => switch (this) {
        IntercityCity.pamplona => 'Pamplona',
        IntercityCity.cucuta => 'Cúcuta',
        IntercityCity.bucaramanga => 'Bucaramanga',
        IntercityCity.chitaga => 'Chitagá',
        IntercityCity.malaga => 'Málaga',
        IntercityCity.ocana => 'Ocaña',
        IntercityCity.bogota => 'Bogotá',
      };

  String get department => switch (this) {
        IntercityCity.pamplona => 'Norte de Santander',
        IntercityCity.cucuta => 'Norte de Santander',
        IntercityCity.bucaramanga => 'Santander',
        IntercityCity.chitaga => 'Norte de Santander',
        IntercityCity.malaga => 'Santander',
        IntercityCity.ocana => 'Norte de Santander',
        IntercityCity.bogota => 'Cundinamarca',
      };

  IconData get icon => switch (this) {
        IntercityCity.bogota => Icons.location_city_rounded,
        _ => Icons.place_rounded,
      };
}

// ── Rutas con datos reales ────────────────────────────────────────────────────

class IntercityRoute {
  const IntercityRoute({
    required this.origin,
    required this.destination,
    required this.distanceKm,
    required this.durationMinutes,
    required this.farePerSeat,
    required this.fleetFare,
  });

  final IntercityCity origin;
  final IntercityCity destination;
  final double distanceKm;
  final int durationMinutes;
  final double farePerSeat;
  final double fleetFare;

  String get durationLabel {
    final h = durationMinutes ~/ 60;
    final m = durationMinutes % 60;
    if (h == 0) return '${m}min';
    if (m == 0) return '${h}h';
    return '${h}h ${m}min';
  }

  String get fareLabel => CurrencyFormatter.format(farePerSeat);
  String get fleetLabel => CurrencyFormatter.format(fleetFare);

  static IntercityRoute? between(IntercityCity a, IntercityCity b) {
    if (a == b) return null;
    for (final r in _routes) {
      if ((r.origin == a && r.destination == b) ||
          (r.origin == b && r.destination == a)) {
        return r.origin == a
            ? r
            : IntercityRoute(
                origin: b,
                destination: a,
                distanceKm: r.distanceKm,
                durationMinutes: r.durationMinutes,
                farePerSeat: r.farePerSeat,
                fleetFare: r.fleetFare,
              );
      }
    }
    return null;
  }

  static const List<IntercityRoute> _routes = [
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.cucuta,
      distanceKm: 95,
      durationMinutes: 120,
      farePerSeat: 22000,
      fleetFare: 70000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.bucaramanga,
      distanceKm: 200,
      durationMinutes: 240,
      farePerSeat: 42000,
      fleetFare: 130000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.chitaga,
      distanceKm: 45,
      durationMinutes: 60,
      farePerSeat: 10000,
      fleetFare: 35000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.malaga,
      distanceKm: 105,
      durationMinutes: 150,
      farePerSeat: 25000,
      fleetFare: 80000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.ocana,
      distanceKm: 160,
      durationMinutes: 210,
      farePerSeat: 35000,
      fleetFare: 110000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.bogota,
      distanceKm: 500,
      durationMinutes: 540,
      farePerSeat: 90000,
      fleetFare: 280000,
    ),
    IntercityRoute(
      origin: IntercityCity.cucuta,
      destination: IntercityCity.bucaramanga,
      distanceKm: 200,
      durationMinutes: 240,
      farePerSeat: 42000,
      fleetFare: 130000,
    ),
  ];
}

// ── Estado de la solicitud ────────────────────────────────────────────────────

enum IntercityStatus {
  searching,
  driverFound,
  confirmed,
  inProgress,
  completed,
  cancelled;

  String get label => switch (this) {
        IntercityStatus.searching => 'Buscando conductor...',
        IntercityStatus.driverFound => 'Conductor disponible',
        IntercityStatus.confirmed => 'Viaje confirmado',
        IntercityStatus.inProgress => 'En camino',
        IntercityStatus.completed => 'Completado',
        IntercityStatus.cancelled => 'Cancelado',
      };

  Color get color => switch (this) {
        IntercityStatus.searching => AppColors.warning,
        IntercityStatus.driverFound => AppColors.info,
        IntercityStatus.confirmed => AppColors.primary,
        IntercityStatus.inProgress => AppColors.secondary,
        IntercityStatus.completed => AppColors.success,
        IntercityStatus.cancelled => AppColors.error,
      };

  bool get isActive =>
      this != IntercityStatus.completed &&
      this != IntercityStatus.cancelled;

  bool get canCancel =>
      this == IntercityStatus.searching ||
      this == IntercityStatus.driverFound;
}

// ── Número de asientos ────────────────────────────────────────────────────────

enum IntercitySeats {
  one,
  two,
  three,
  fleet;

  int get count => switch (this) {
        IntercitySeats.one => 1,
        IntercitySeats.two => 2,
        IntercitySeats.three => 3,
        IntercitySeats.fleet => 4,
      };

  String get label => switch (this) {
        IntercitySeats.one => '1 persona',
        IntercitySeats.two => '2 personas',
        IntercitySeats.three => '3 personas',
        IntercitySeats.fleet => 'Flete completo',
      };

  bool get isFleet => this == IntercitySeats.fleet;
}

// ── Entidad principal ─────────────────────────────────────────────────────────

class IntercityRequestEntity {
  const IntercityRequestEntity({
    required this.id,
    required this.origin,
    required this.destination,
    required this.departureTime,
    required this.seats,
    required this.offeredFare,
    required this.status,
    required this.createdAt,
    this.notes,
    this.pickupAddress,
    this.dropoffAddress,
    this.driverName,
    this.driverPhone,
    this.driverVehicle,
    this.driverRating,
    this.counterFare,
  });

  final String id;
  final IntercityCity origin;
  final IntercityCity destination;
  final DateTime departureTime;
  final IntercitySeats seats;
  final double offeredFare;
  final IntercityStatus status;
  final DateTime createdAt;
  final String? notes;
  final String? pickupAddress;
  final String? dropoffAddress;
  final String? driverName;
  final String? driverPhone;
  final String? driverVehicle;
  final double? driverRating;
  final double? counterFare;

  bool get hasDriver => driverName != null;
  bool get isActive => status.isActive;
  bool get isCompleted => status == IntercityStatus.completed;

  IntercityRequestEntity copyWith({
    String? id,
    IntercityCity? origin,
    IntercityCity? destination,
    DateTime? departureTime,
    IntercitySeats? seats,
    double? offeredFare,
    IntercityStatus? status,
    DateTime? createdAt,
    String? notes,
    String? pickupAddress,
    String? dropoffAddress,
    String? driverName,
    String? driverPhone,
    String? driverVehicle,
    double? driverRating,
    double? counterFare,
  }) =>
      IntercityRequestEntity(
        id: id ?? this.id,
        origin: origin ?? this.origin,
        destination: destination ?? this.destination,
        departureTime: departureTime ?? this.departureTime,
        seats: seats ?? this.seats,
        offeredFare: offeredFare ?? this.offeredFare,
        status: status ?? this.status,
        createdAt: createdAt ?? this.createdAt,
        notes: notes ?? this.notes,
        pickupAddress: pickupAddress ?? this.pickupAddress,
        dropoffAddress: dropoffAddress ?? this.dropoffAddress,
        driverName: driverName ?? this.driverName,
        driverPhone: driverPhone ?? this.driverPhone,
        driverVehicle: driverVehicle ?? this.driverVehicle,
        driverRating: driverRating ?? this.driverRating,
        counterFare: counterFare ?? this.counterFare,
      );
}
