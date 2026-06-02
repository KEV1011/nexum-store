/// Producto del catálogo de un negocio aliado.
class BusinessProductEntity {
  const BusinessProductEntity({
    required this.id,
    required this.name,
    required this.price,
    required this.category,
    required this.isAvailable,
    this.description,
    this.imageUrl,
  });

  final String id;
  final String name;
  final double price;
  final String category;
  final bool isAvailable;
  final String? description;
  final String? imageUrl;

  BusinessProductEntity copyWith({
    bool? isAvailable,
    double? price,
    String? name,
    String? description,
  }) =>
      BusinessProductEntity(
        id: id,
        name: name ?? this.name,
        price: price ?? this.price,
        category: category,
        isAvailable: isAvailable ?? this.isAvailable,
        description: description ?? this.description,
        imageUrl: imageUrl,
      );
}
