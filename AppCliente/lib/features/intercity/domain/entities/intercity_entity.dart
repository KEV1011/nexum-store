import 'dart:math' as math;

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
    this.requiresLicensedOperator = false,
    this.isEstimated = false,
  });

  final IntercityCity origin;
  final IntercityCity destination;
  final double distanceKm;
  final int durationMinutes;
  final double farePerSeat;
  final double fleetFare;

  /// Trunk route that legally needs a habilitated operator (Option B).
  final bool requiresLicensedOperator;

  /// True when the route was synthesised from city coordinates (no explicit row).
  final bool isEstimated;

  String get durationLabel {
    final h = durationMinutes ~/ 60;
    final m = durationMinutes % 60;
    if (h == 0) return '${m}min';
    if (m == 0) return '${h}h';
    return '${h}h ${m}min';
  }

  String get fareLabel => CurrencyFormatter.format(farePerSeat);
  String get fleetLabel => CurrencyFormatter.format(fleetFare);

  /// Resolves the route between any two supported municipalities. Returns an
  /// explicit row when available, otherwise a coordinate-based estimate so the
  /// client can always quote and request the trip. Mirrors the backend's
  /// `getIntercityRoute` synthesis.
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
                requiresLicensedOperator: r.requiresLicensedOperator,
              );
      }
    }
    return _synthesize(a, b);
  }

  // ── Coordinate-based fallback (parity with backend) ──────────────────────────

  static const Map<IntercityCity, ({double lat, double lng})> _cityCoords = {
    IntercityCity.pamplona: (lat: 7.3754, lng: -72.6486),
    IntercityCity.cucuta: (lat: 7.8939, lng: -72.5078),
    IntercityCity.bucaramanga: (lat: 7.1193, lng: -73.1227),
    IntercityCity.chitaga: (lat: 6.9000, lng: -72.6660),
    IntercityCity.malaga: (lat: 6.6983, lng: -72.7333),
    IntercityCity.ocana: (lat: 8.2375, lng: -73.3561),
    IntercityCity.bogota: (lat: 4.7110, lng: -74.0721),
  };

  static const double _roadFactor = 1.4;
  static const double _avgSpeedKmh = 55;
  static const double _farePerKm = 220;
  static const double _trunkDistanceKm = 150;

  static double _haversineKm(
    ({double lat, double lng}) a,
    ({double lat, double lng}) b,
  ) {
    const r = 6371.0;
    final dLat = (b.lat - a.lat) * math.pi / 180;
    final dLng = (b.lng - a.lng) * math.pi / 180;
    final lat1 = a.lat * math.pi / 180;
    final lat2 = b.lat * math.pi / 180;
    final h = math.pow(math.sin(dLat / 2), 2) +
        math.pow(math.sin(dLng / 2), 2) * math.cos(lat1) * math.cos(lat2);
    return 2 * r * math.asin(math.sqrt(h));
  }

  static IntercityRoute _synthesize(IntercityCity a, IntercityCity b) {
    final straight = _haversineKm(_cityCoords[a]!, _cityCoords[b]!);
    final distanceKm = math.max(10, (straight * _roadFactor / 5).round() * 5);
    final durationMinutes = (distanceKm / _avgSpeedKmh * 60).round();
    final farePerSeat = (distanceKm * _farePerKm / 1000).round() * 1000;
    return IntercityRoute(
      origin: a,
      destination: b,
      distanceKm: distanceKm.toDouble(),
      durationMinutes: durationMinutes,
      farePerSeat: farePerSeat.toDouble(),
      fleetFare: (farePerSeat * 3).toDouble(),
      requiresLicensedOperator: distanceKm >= _trunkDistanceKm,
      isEstimated: true,
    );
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
      requiresLicensedOperator: true,
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
      distanceKm: 80,
      durationMinutes: 105,
      farePerSeat: 18000,
      fleetFare: 58000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.ocana,
      distanceKm: 120,
      durationMinutes: 150,
      farePerSeat: 28000,
      fleetFare: 90000,
    ),
    IntercityRoute(
      origin: IntercityCity.pamplona,
      destination: IntercityCity.bogota,
      distanceKm: 500,
      durationMinutes: 540,
      farePerSeat: 90000,
      fleetFare: 280000,
      requiresLicensedOperator: true,
    ),
    IntercityRoute(
      origin: IntercityCity.cucuta,
      destination: IntercityCity.bucaramanga,
      distanceKm: 200,
      durationMinutes: 240,
      farePerSeat: 42000,
      fleetFare: 130000,
      requiresLicensedOperator: true,
    ),
    IntercityRoute(
      origin: IntercityCity.chitaga,
      destination: IntercityCity.cucuta,
      distanceKm: 140,
      durationMinutes: 170,
      farePerSeat: 30000,
      fleetFare: 95000,
    ),
    IntercityRoute(
      origin: IntercityCity.malaga,
      destination: IntercityCity.bucaramanga,
      distanceKm: 130,
      durationMinutes: 160,
      farePerSeat: 28000,
      fleetFare: 88000,
      requiresLicensedOperator: true,
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
