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
    this.openingHours,
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

  /// Horario de atención en texto libre (ej: "Lun-Sáb 8am-9pm"). Null si no se
  /// configuró.
  final String? openingHours;
}

/// Un producto del catálogo de un negocio.
/// Una opción dentro de un grupo (ej: "Grande" +3000, "Sin cebolla" +0).
class ProductOptionEntity {
  const ProductOptionEntity({
    required this.id,
    required this.name,
    this.priceDelta = 0,
    this.isAvailable = true,
  });

  final String id;
  final String name;
  final double priceDelta;
  final bool isAvailable;
}

/// Grupo de opciones/variantes (ej: "Tamaño", "Adiciones", "Quitar").
class OptionGroupEntity {
  const OptionGroupEntity({
    required this.id,
    required this.name,
    this.required = false,
    this.minSelect = 0,
    this.maxSelect = 1,
    this.options = const [],
  });

  final String id;
  final String name;
  final bool required;
  final int minSelect;
  final int maxSelect;
  final List<ProductOptionEntity> options;

  /// Selección única (radio) cuando solo se puede elegir una opción.
  bool get isSingle => maxSelect <= 1;
}

class ProductEntity {
  const ProductEntity({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    this.category = 'General',
    this.imageUrl,
    this.images = const [],
    this.optionGroups = const [],
  });

  final String id;
  final String name;
  final String description;

  /// Precio unitario (COP).
  final double price;

  /// Categoría dentro del menú (ej: "Almuerzos", "Bebidas").
  final String category;

  /// Foto de portada del producto subida por el negocio (null = sin foto).
  final String? imageUrl;

  /// Galería de fotos adicionales (URLs). Vacía si el negocio no subió más.
  final List<String> images;

  /// Variantes/opciones del producto (tamaños, adiciones, quitar). Vacío si no.
  final List<OptionGroupEntity> optionGroups;

  /// Todas las fotos del producto (portada + galería) para el visor.
  List<String> get allPhotos =>
      [if (imageUrl != null && imageUrl!.isNotEmpty) imageUrl!, ...images];

  /// El producto requiere que el cliente elija opciones antes de agregarlo.
  bool get hasOptions => optionGroups.isNotEmpty;
}
