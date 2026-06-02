/// Producto del catálogo de un negocio aliado.
///
/// Puede estar enlazado al catálogo maestro (vía [barcode]/[masterProductId])
/// para farmacias/supermercados, o ser un producto único del negocio
/// (restaurantes) sin código de barras.
class BusinessProductEntity {
  const BusinessProductEntity({
    required this.id,
    required this.name,
    required this.price,
    required this.category,
    required this.isAvailable,
    this.description,
    this.imageUrl,
    this.barcode,
    this.masterProductId,
    this.stock,
    this.requiresRx = false,
  });

  final String id;
  final String name;
  final double price;
  final String category;
  final bool isAvailable;
  final String? description;
  final String? imageUrl;

  /// EAN-13 si proviene del catálogo maestro.
  final String? barcode;
  final String? masterProductId;

  /// Inventario disponible. `null` = el negocio no controla stock (restaurante).
  final int? stock;

  /// Requiere fórmula médica (heredado del maestro).
  final bool requiresRx;

  bool get isFromMasterCatalog => masterProductId != null;
  bool get tracksStock => stock != null;
  bool get isLowStock => stock != null && stock! <= 5;

  BusinessProductEntity copyWith({
    bool? isAvailable,
    double? price,
    String? name,
    String? description,
    int? stock,
  }) =>
      BusinessProductEntity(
        id: id,
        name: name ?? this.name,
        price: price ?? this.price,
        category: category,
        isAvailable: isAvailable ?? this.isAvailable,
        description: description ?? this.description,
        imageUrl: imageUrl,
        barcode: barcode,
        masterProductId: masterProductId,
        stock: stock ?? this.stock,
        requiresRx: requiresRx,
      );

  factory BusinessProductEntity.fromJson(Map<String, dynamic> j) =>
      BusinessProductEntity(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? '',
        price: (j['price'] as num?)?.toDouble() ?? 0,
        category: j['category'] as String? ?? 'General',
        isAvailable: j['isAvailable'] as bool? ?? true,
        description: j['description'] as String?,
        imageUrl: j['imageUrl'] as String?,
        barcode: j['barcode'] as String?,
        masterProductId: j['masterProductId'] as String?,
        stock: (j['stock'] as num?)?.toInt(),
        requiresRx: j['requiresRx'] as bool? ?? false,
      );
}
