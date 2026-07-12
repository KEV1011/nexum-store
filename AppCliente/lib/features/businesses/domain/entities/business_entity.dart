/// Categoría de un negocio aliado en Nexum.
enum BusinessCategory {
  restaurant,
  supermarket,
  pharmacy,
  other,
}

extension BusinessCategoryX on BusinessCategory {
  String get label {
    switch (this) {
      case BusinessCategory.restaurant:
        return 'Restaurante';
      case BusinessCategory.supermarket:
        return 'Supermercado';
      case BusinessCategory.pharmacy:
        return 'Droguería';
      case BusinessCategory.other:
        return 'Tienda';
    }
  }
}

/// Un negocio (restaurante, supermercado, droguería) donde el cliente
/// puede pedir un domicilio.
class BusinessEntity {
  const BusinessEntity({
    required this.id,
    required this.name,
    required this.category,
    required this.rating,
    required this.etaMinutes,
    required this.deliveryFee,
    required this.address,
    required this.products,
    this.isOpen = true,
    this.imageUrl,
  });

  final String id;
  final String name;
  final BusinessCategory category;

  /// Calificación promedio (1.0 – 5.0).
  final double rating;

  /// Tiempo estimado de entrega en minutos.
  final int etaMinutes;

  /// Costo del domicilio (COP).
  final double deliveryFee;

  final String address;

  /// Catálogo de productos disponibles.
  final List<ProductEntity> products;

  final bool isOpen;

  /// Foto de portada del local (null = sin portada, cae al ícono de categoría).
  final String? imageUrl;
}

/// Un producto del catálogo de un negocio.
class ProductEntity {
  const ProductEntity({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    this.category = 'General',
    this.imageUrl,
  });

  final String id;
  final String name;
  final String description;

  /// Precio unitario (COP).
  final double price;

  /// Categoría dentro del menú (ej: "Almuerzos", "Bebidas").
  final String category;

  /// Foto del producto subida por el negocio (null = sin foto).
  final String? imageUrl;
}
