import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Modelo de ubicación geográfica con dirección textual.
class LocationModel {
  const LocationModel({
    required this.latitude,
    required this.longitude,
    required this.address,
    this.reference,
  });

  final double latitude;
  final double longitude;
  final String address;
  final String? reference; // Referencia adicional (ej: "Frente al parque")

  LatLng get latLng => LatLng(latitude, longitude);

  LocationModel copyWith({
    double? latitude,
    double? longitude,
    String? address,
    String? reference,
  }) {
    return LocationModel(
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      address: address ?? this.address,
      reference: reference ?? this.reference,
    );
  }

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        'reference': reference,
      };

  factory LocationModel.fromJson(Map<String, dynamic> json) => LocationModel(
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        address: json['address'] as String,
        reference: json['reference'] as String?,
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is LocationModel &&
          runtimeType == other.runtimeType &&
          latitude == other.latitude &&
          longitude == other.longitude;

  @override
  int get hashCode => latitude.hashCode ^ longitude.hashCode;

  @override
  String toString() =>
      'LocationModel(lat: $latitude, lng: $longitude, address: $address)';
}
