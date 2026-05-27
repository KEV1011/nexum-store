/// Entidad de dominio del conductor autenticado.
class DriverEntity {
  const DriverEntity({
    required this.id,
    required this.name,
    required this.phone,
    required this.rating,
    required this.totalTrips,
    required this.vehiclePlate,
    required this.vehicleDescription,
    required this.isVerified,
    this.photoUrl,
  });

  final String id;
  final String name;
  final String phone;
  final double rating;
  final int totalTrips;
  final String vehiclePlate;
  final String vehicleDescription;
  final bool isVerified;
  final String? photoUrl;

  DriverEntity copyWith({
    String? id,
    String? name,
    String? phone,
    double? rating,
    int? totalTrips,
    String? vehiclePlate,
    String? vehicleDescription,
    bool? isVerified,
    String? photoUrl,
  }) {
    return DriverEntity(
      id: id ?? this.id,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      rating: rating ?? this.rating,
      totalTrips: totalTrips ?? this.totalTrips,
      vehiclePlate: vehiclePlate ?? this.vehiclePlate,
      vehicleDescription: vehicleDescription ?? this.vehicleDescription,
      isVerified: isVerified ?? this.isVerified,
      photoUrl: photoUrl ?? this.photoUrl,
    );
  }

  @override
  String toString() =>
      'DriverEntity(id: $id, name: $name, plate: $vehiclePlate, rating: $rating)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DriverEntity && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}
