class AddressEntity {
  const AddressEntity({
    required this.id,
    required this.alias,
    required this.fullAddress,
    this.isDefault = false,
    this.lat,
    this.lng,
  });

  factory AddressEntity.fromJson(Map<String, dynamic> json) => AddressEntity(
        id: json['id'] as String,
        alias: json['alias'] as String,
        fullAddress: json['fullAddress'] as String,
        isDefault: json['isDefault'] as bool? ?? false,
        lat: (json['lat'] as num?)?.toDouble(),
        lng: (json['lng'] as num?)?.toDouble(),
      );

  final String id;
  final String alias;
  final String fullAddress;
  final bool isDefault;

  /// Punto exacto cuando la dirección se eligió de las sugerencias o del mapa.
  /// Null si se escribió a mano: el pedido se crea igual, pero su seguimiento
  /// no se puede dibujar en el mapa.
  final double? lat;
  final double? lng;

  AddressEntity copyWith({
    String? id,
    String? alias,
    String? fullAddress,
    bool? isDefault,
    double? lat,
    double? lng,
  }) {
    return AddressEntity(
      id: id ?? this.id,
      alias: alias ?? this.alias,
      fullAddress: fullAddress ?? this.fullAddress,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      isDefault: isDefault ?? this.isDefault,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'alias': alias,
        'fullAddress': fullAddress,
        'isDefault': isDefault,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      };
}
