class AddressEntity {
  const AddressEntity({
    required this.id,
    required this.alias,
    required this.fullAddress,
    this.isDefault = false,
  });

  factory AddressEntity.fromJson(Map<String, dynamic> json) => AddressEntity(
        id: json['id'] as String,
        alias: json['alias'] as String,
        fullAddress: json['fullAddress'] as String,
        isDefault: json['isDefault'] as bool? ?? false,
      );

  final String id;
  final String alias;
  final String fullAddress;
  final bool isDefault;

  AddressEntity copyWith({
    String? id,
    String? alias,
    String? fullAddress,
    bool? isDefault,
  }) {
    return AddressEntity(
      id: id ?? this.id,
      alias: alias ?? this.alias,
      fullAddress: fullAddress ?? this.fullAddress,
      isDefault: isDefault ?? this.isDefault,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'alias': alias,
        'fullAddress': fullAddress,
        'isDefault': isDefault,
      };
}
