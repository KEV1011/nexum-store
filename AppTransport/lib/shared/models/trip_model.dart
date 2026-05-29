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
    this.isDeliveryTrip = false,
    this.deliveryPhotoPath,
    this.hasSignature = false,
    this.pickupPhotoPath,
    this.pickupOrderRef,
    this.pickedUpAt,
  });

  factory TripModel.fromJson(Map<String, dynamic> json) => TripModel(
        id: json['id'] as String,
        passengerId: json['passenger_id'] as String,
        passengerName: json['passenger_name'] as String,
        origin: LocationModel.fromJson(
          json['origin'] as Map<String, dynamic>,
        ),
        destination: LocationModel.fromJson(
          json['destination'] as Map<String, dynamic>,
        ),
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
        isDeliveryTrip:
            (json['is_delivery_trip'] as bool?) ?? false,
        deliveryPhotoPath:
            json['delivery_photo_path'] as String?,
        hasSignature: (json['has_signature'] as bool?) ?? false,
        pickupPhotoPath: json['pickup_photo_path'] as String?,
        pickupOrderRef: json['pickup_order_ref'] as String?,
        pickedUpAt: json['picked_up_at'] != null
            ? DateTime.parse(json['picked_up_at'] as String)
            : null,
      );

  // ── Fields ───────────────────────────────────────────────────────────────

  /// Unique trip identifier.
  final String id;

  /// Identifier of the passenger who requested the trip.
  final String passengerId;

  /// Display name of the passenger (or recipient for delivery trips).
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

  /// Net earning for the driver after the platform commission (COP).
  final double netEarning;

  /// Platform commission deducted from the gross fare (COP).
  final double commission;

  /// Timestamp when the trip started (driver picked up the passenger).
  final DateTime startedAt;

  /// Timestamp when the trip ended (passenger dropped off).
  final DateTime finishedAt;

  /// Optional rating given by the passenger to the driver (1.0 – 5.0).
  final double? rating;

  /// Whether this trip is a delivery (Envíos) rather than a passenger trip.
  final bool isDeliveryTrip;

  /// File path of the delivery photo captured at drop-off, if any.
  final String? deliveryPhotoPath;

  /// Whether the recipient signed digitally at delivery.
  final bool hasSignature;

  /// (Envíos) File path of the order photo taken at the store at pickup.
  final String? pickupPhotoPath;

  /// (Envíos) Optional order reference noted at pickup (e.g. "#4521").
  final String? pickupOrderRef;

  /// (Envíos) Timestamp when the order was photographed / left the store.
  final DateTime? pickedUpAt;

  // ── Derived helpers ──────────────────────────────────────────────────────

  /// Total elapsed time from start to finish as a [Duration].
  Duration get tripDuration => finishedAt.difference(startedAt);

  /// Whether the passenger left a rating.
  bool get hasRating => rating != null;

  /// Whether a delivery photo was captured.
  bool get hasDeliveryPhoto => deliveryPhotoPath != null;

  /// Whether an order photo was captured at the store at pickup.
  bool get hasPickupPhoto => pickupPhotoPath != null;

  /// Whether at least one proof was collected for this delivery.
  bool get isVerifiedDelivery =>
      isDeliveryTrip && (hasDeliveryPhoto || hasSignature);

  /// Whether the full chain of custody is complete: order photographed
  /// at the store AND proof captured at drop-off. This is the strongest
  /// guarantee for the restaurant/local and the differentiator vs Rappi.
  bool get hasFullChainOfCustody =>
      isDeliveryTrip &&
      hasPickupPhoto &&
      (hasDeliveryPhoto || hasSignature);

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
    bool? isDeliveryTrip,
    String? deliveryPhotoPath,
    bool? hasSignature,
    String? pickupPhotoPath,
    String? pickupOrderRef,
    DateTime? pickedUpAt,
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
      isDeliveryTrip: isDeliveryTrip ?? this.isDeliveryTrip,
      deliveryPhotoPath:
          deliveryPhotoPath ?? this.deliveryPhotoPath,
      hasSignature: hasSignature ?? this.hasSignature,
      pickupPhotoPath: pickupPhotoPath ?? this.pickupPhotoPath,
      pickupOrderRef: pickupOrderRef ?? this.pickupOrderRef,
      pickedUpAt: pickedUpAt ?? this.pickedUpAt,
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
        'is_delivery_trip': isDeliveryTrip,
        'delivery_photo_path': deliveryPhotoPath,
        'has_signature': hasSignature,
        'pickup_photo_path': pickupPhotoPath,
        'pickup_order_ref': pickupOrderRef,
        'picked_up_at': pickedUpAt?.toIso8601String(),
      };

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
      'isDelivery: $isDeliveryTrip, rating: $rating)';
}
