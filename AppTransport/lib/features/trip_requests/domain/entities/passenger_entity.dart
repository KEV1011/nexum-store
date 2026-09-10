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
    this.verified = false,
  });

  /// Unique identifier assigned by the platform.
  final String id;

  /// Full display name of the passenger.
  final String name;

  /// Calificación del pasajero, o null si no la hay.
  ///
  /// Null mientras nadie lo haya calificado, y entonces se enseña «Nuevo».
  /// Antes el backend mandaba un 5,0 escrito a mano: el conductor veía la
  /// misma nota perfecta de todo el mundo, justo en la pantalla con la que
  /// decide si acepta la carrera. Hoy sale de las calificaciones reales que
  /// deja el conductor al terminar el viaje.
  final double? rating;

  /// Total completed trips as a passenger.
  final int totalTrips;

  /// URL to the passenger's avatar / profile picture.
  final String photoUrl;

  /// Identidad del pasajero verificada (KYC) — señal de confianza anti-robo.
  final bool verified;

  /// Returns only the first name for compact UI labels.
  String get firstName => name.split(' ').first;

  PassengerEntity copyWith({
    String? id,
    String? name,
    double? rating,
    int? totalTrips,
    String? photoUrl,
    bool? verified,
  }) {
    return PassengerEntity(
      id: id ?? this.id,
      name: name ?? this.name,
      rating: rating ?? this.rating,
      totalTrips: totalTrips ?? this.totalTrips,
      photoUrl: photoUrl ?? this.photoUrl,
      verified: verified ?? this.verified,
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
