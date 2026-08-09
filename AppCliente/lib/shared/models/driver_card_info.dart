/// Ficha del conductor y su vehículo: exactamente lo que mira un pasajero
/// antes de subirse a un carro desconocido.
///
/// Va en un objeto propio y no en diez campos sueltos de la solicitud porque
/// llega y se va en bloque (aparece al aceptar, no existe mientras se busca),
/// y porque un `copyWith` con diez campos más es un campo que alguien olvidará
/// —ya pasó con el PIN de entrega, que se perdía en la primera actualización—.
class DriverCardInfo {
  const DriverCardInfo({
    this.photoUrl,
    this.rating,
    this.totalTrips,
    this.since,
    this.verified = false,
    this.brand,
    this.model,
    this.color,
    this.plate,
    this.vehiclePhotoUrl,
  });

  /// Devuelve `null` cuando el viaje todavía no tiene conductor: así la interfaz
  /// no tiene que preguntar por seis campos vacíos para saber si pintar la ficha.
  static DriverCardInfo? fromJson(Map<String, dynamic> json) {
    final ficha = DriverCardInfo(
      photoUrl: json['driverPhotoUrl'] as String?,
      rating: (json['driverRating'] as num?)?.toDouble(),
      totalTrips: json['driverTotalTrips'] as int?,
      since: json['driverSince'] != null
          ? DateTime.tryParse(json['driverSince'] as String)
          : null,
      verified: json['driverVerified'] as bool? ?? false,
      brand: json['vehicleBrand'] as String?,
      model: json['vehicleModel'] as String?,
      color: json['vehicleColor'] as String?,
      plate: json['vehiclePlate'] as String?,
      vehiclePhotoUrl: json['vehiclePhotoUrl'] as String?,
    );
    return ficha.isEmpty ? null : ficha;
  }

  final String? photoUrl;
  final double? rating;
  final int? totalTrips;
  final DateTime? since;
  final bool verified;
  final String? brand;
  final String? model;
  final String? color;
  final String? plate;
  final String? vehiclePhotoUrl;

  bool get isEmpty =>
      photoUrl == null &&
      rating == null &&
      plate == null &&
      brand == null &&
      !verified;

  /// "Blanco Toyota Corolla" — color primero, como se reconoce un carro en la
  /// calle. Se omite en silencio lo que no haya llegado.
  String? get vehicleDescription {
    final partes = [color, brand, model]
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty);
    return partes.isEmpty ? null : partes.join(' ');
  }

  Map<String, dynamic> toJson() => {
        if (photoUrl != null) 'driverPhotoUrl': photoUrl,
        if (rating != null) 'driverRating': rating,
        if (totalTrips != null) 'driverTotalTrips': totalTrips,
        if (since != null) 'driverSince': since!.toIso8601String(),
        'driverVerified': verified,
        if (brand != null) 'vehicleBrand': brand,
        if (model != null) 'vehicleModel': model,
        if (color != null) 'vehicleColor': color,
        if (plate != null) 'vehiclePlate': plate,
        if (vehiclePhotoUrl != null) 'vehiclePhotoUrl': vehiclePhotoUrl,
      };
}
