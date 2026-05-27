/// Immutable domain entity representing a passenger.
///
/// Used by [PassengersMock] and any trip-request use-case that needs to
/// display basic passenger information to the driver.
class PassengerEntity {
  const PassengerEntity({
    required this.id,
    required this.name,
    required this.rating,
    required this.totalTrips,
    required this.photoUrl,
  });

  /// Unique identifier assigned by the platform.
  final String id;

  /// Full display name of the passenger.
  final String name;

  /// Aggregate rating (1.0 – 5.0) given by previous drivers.
  final double rating;

  /// Total completed trips as a passenger.
  final int totalTrips;

  /// URL to the passenger's avatar / profile picture.
  final String photoUrl;

  /// Returns only the first name for compact UI labels.
  String get firstName => name.split(' ').first;

  PassengerEntity copyWith({
    String? id,
    String? name,
    double? rating,
    int? totalTrips,
    String? photoUrl,
  }) {
    return PassengerEntity(
      id: id ?? this.id,
      name: name ?? this.name,
      rating: rating ?? this.rating,
      totalTrips: totalTrips ?? this.totalTrips,
      photoUrl: photoUrl ?? this.photoUrl,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PassengerEntity &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'PassengerEntity(id: $id, name: $name, rating: $rating)';
}
