import 'package:nexum_driver/shared/models/location_model.dart';

/// Represents a completed (historical) trip in the driver's earnings history.
///
/// Financial breakdown:
///   [grossFare]   = fare charged to the passenger
///   [commission]  = grossFare × 15 % (platform fee)
///   [netEarning]  = grossFare − commission  (what the driver receives)
class TripModel {
  const TripModel({
    required this.id,
    required this.passengerId,
    required this.passengerName,
    required this.origin,
    required this.destination,
    required this.distanceKm,
    required this.durationMinutes,
    required this.grossFare,
    required this.netEarning,
    required this.commission,
    required this.startedAt,
    required this.finishedAt,
    this.rating,
  });

  /// Unique trip identifier.
  final String id;

  /// Identifier of the passenger who requested the trip.
  final String passengerId;

  /// Display name of the passenger.
  final String passengerName;

  /// Pickup location.
  final LocationModel origin;

  /// Drop-off location.
  final LocationModel destination;

  /// Route distance in kilometres.
  final double distanceKm;

  /// Actual trip duration in minutes.
  final int durationMinutes;

  /// Gross fare charged to the passenger (COP).
  final double grossFare;

  /// Net earning for the driver after the 15 % platform commission (COP).
  final double netEarning;

  /// Platform commission deducted from the gross fare (COP).
  final double commission;

  /// Timestamp when the trip started (driver picked up the passenger).
  final DateTime startedAt;

  /// Timestamp when the trip ended (passenger dropped off).
  final DateTime finishedAt;

  /// Optional rating given by the passenger to the driver (1.0 – 5.0).
  final double? rating;

  // ── Derived helpers ──────────────────────────────────────────────────────

  /// Total elapsed time from start to finish as a [Duration].
  Duration get tripDuration => finishedAt.difference(startedAt);

  /// Whether the passenger left a rating.
  bool get hasRating => rating != null;

  // ── copyWith ─────────────────────────────────────────────────────────────

  TripModel copyWith({
    String? id,
    String? passengerId,
    String? passengerName,
    LocationModel? origin,
    LocationModel? destination,
    double? distanceKm,
    int? durationMinutes,
    double? grossFare,
    double? netEarning,
    double? commission,
    DateTime? startedAt,
    DateTime? finishedAt,
    double? rating,
  }) {
    return TripModel(
      id: id ?? this.id,
      passengerId: passengerId ?? this.passengerId,
      passengerName: passengerName ?? this.passengerName,
      origin: origin ?? this.origin,
      destination: destination ?? this.destination,
      distanceKm: distanceKm ?? this.distanceKm,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      grossFare: grossFare ?? this.grossFare,
      netEarning: netEarning ?? this.netEarning,
      commission: commission ?? this.commission,
      startedAt: startedAt ?? this.startedAt,
      finishedAt: finishedAt ?? this.finishedAt,
      rating: rating ?? this.rating,
    );
  }

  // ── Serialisation ────────────────────────────────────────────────────────

  Map<String, dynamic> toJson() => {
        'id': id,
        'passenger_id': passengerId,
        'passenger_name': passengerName,
        'origin': origin.toJson(),
        'destination': destination.toJson(),
        'distance_km': distanceKm,
        'duration_minutes': durationMinutes,
        'gross_fare': grossFare,
        'net_earning': netEarning,
        'commission': commission,
        'started_at': startedAt.toIso8601String(),
        'finished_at': finishedAt.toIso8601String(),
        'rating': rating,
      };

  factory TripModel.fromJson(Map<String, dynamic> json) => TripModel(
        id: json['id'] as String,
        passengerId: json['passenger_id'] as String,
        passengerName: json['passenger_name'] as String,
        origin: LocationModel.fromJson(
            json['origin'] as Map<String, dynamic>),
        destination: LocationModel.fromJson(
            json['destination'] as Map<String, dynamic>),
        distanceKm: (json['distance_km'] as num).toDouble(),
        durationMinutes: json['duration_minutes'] as int,
        grossFare: (json['gross_fare'] as num).toDouble(),
        netEarning: (json['net_earning'] as num).toDouble(),
        commission: (json['commission'] as num).toDouble(),
        startedAt: DateTime.parse(json['started_at'] as String),
        finishedAt: DateTime.parse(json['finished_at'] as String),
        rating: json['rating'] != null
            ? (json['rating'] as num).toDouble()
            : null,
      );

  // ── Equality ─────────────────────────────────────────────────────────────

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TripModel &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'TripModel(id: $id, passenger: $passengerName, '
      'distance: ${distanceKm}km, netEarning: \$$netEarning, '
      'rating: $rating)';
}
