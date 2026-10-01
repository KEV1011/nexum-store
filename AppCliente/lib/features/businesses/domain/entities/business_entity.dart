/// Categoría de un negocio aliado en ZIPA.
///
/// `store` es el almacén de mercancía —ropa, calzado, tecnología,
/// electrodomésticos—: lo que se compra por catálogo y no se cocina. Antes no
/// existía, así que un almacén así se registraba como supermercado (era la
/// única opción que decía «Tienda») y en la app aparecía como supermercado.
///
/// `other` es el cajón de lo que no encaja en ninguna —una peluquería, una
/// lavandería— y por eso no se reutilizó para la mercancía: si `other`
/// significara «tienda», el cajón dejaría de existir. Su etiqueta pasó de
/// «Tienda» a «Comercio», que es lo que de verdad dice.
enum BusinessCategory {
  restaurant,
  supermarket,
  pharmacy,
  store,
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
      case BusinessCategory.store:
        return 'Tienda';
      case BusinessCategory.other:
        return 'Comercio';
    }
  }

  /// El plural con el que se nombra la categoría en un filtro o una pestaña.
  String get plural {
    switch (this) {
      case BusinessCategory.restaurant:
        return 'Restaurantes';
      case BusinessCategory.supermarket:
        return 'Supermercados';
      case BusinessCategory.pharmacy:
        return 'Droguerías';
      case BusinessCategory.store:
        return 'Tiendas';
      case BusinessCategory.other:
        return 'Otros';
    }
  }
}

/// Una ciudad a la que el comercio despacha, con lo que cobra y lo que tarda.
///
/// La lista vacía significa «a NINGUNA otra ciudad», no «a todas»: es como
/// nace todo comercio hasta que su dueño declara destinos en su portal.
class DestinoEnvio {
  const DestinoEnvio({
    required this.city,
    required this.fee,
    required this.etaHours,
    this.cutoff,
  });

  factory DestinoEnvio.fromJson(Map<String, dynamic> j) => DestinoEnvio(
        city: j['city'] as String? ?? '',
        fee: (j['fee'] as num?)?.toDouble() ?? 0,
        etaHours: (j['etaHours'] as num?)?.toInt() ?? 24,
        cutoff: j['cutoff'] as String?,
      );

  /// Slug del municipio, tal como lo nombra `/geo/municipios`.
  final String city;
  final double fee;
  final int etaHours;

  /// Hasta qué hora se recibe para que salga hoy («16:00»). Null = sin corte.
  final String? cutoff;
}

/// Un negocio (restaurante, tienda, supermercado, droguería) donde el cliente
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
    this.promoMinAmount,
    this.promoDiscount,
    this.ratingCount = 0,
    this.isOpen = true,
    this.imageUrl,
    this.openingHours,
    this.cerradoMotivo,
    this.claimed = true,
    this.shipsTo = const [],
  });

  final String id;
  final String name;
  final BusinessCategory category;

  /// Calificación promedio (1.0 – 5.0), o **null si nadie lo ha calificado**.
  ///
  /// Nulo, no 5,0: durante mucho tiempo todos los locales enseñaron un cinco
  /// de fábrica que nadie les había dado. Sin nota se muestra «Nuevo», que es
  /// la verdad y además ayuda al cliente a entender por qué no hay número.
  final double? rating;

  /// Cuántas personas lo han calificado. Un 4,9 con dos votos y otro con
  /// doscientos no son la misma información.
  final int ratingCount;

  /// Promoción de la tienda: «$promoDiscount de descuento comprando
  /// $promoMinAmount». Null las dos = no tiene ninguna que anunciar.
  final int? promoMinAmount;
  final int? promoDiscount;

  /// Hay promoción que anunciar (con las dos mitades y coherente).
  bool get tienePromo =>
      promoMinAmount != null &&
      promoDiscount != null &&
      promoMinAmount! > 0 &&
      promoDiscount! > 0 &&
      promoDiscount! < promoMinAmount!;

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

  /// Por qué está cerrado, cuando lo está: «Abre mañana a las 08:00»,
  /// «Pausado temporalmente». Lo decide el servidor con el horario y la pausa
  /// del local; aquí solo se pinta.
  final String? cerradoMotivo;

  /// Si el local es nuestro cliente, o si la ficha la abrimos nosotros desde
  /// una foto de su carta.
  ///
  /// Cambia TODA la pantalla: con `false` los precios son REFERENCIA —salieron
  /// de su menú, no de él— y el pedido no se le manda a ningún portal, va un
  /// repartidor de ZIPA a comprarlo. Por defecto `true`: un backend viejo que
  /// no mande el campo sigue comportándose como hasta hoy.
  final bool claimed;

  /// A qué otras ciudades despacha. Vacía = solo entrega en la suya.
  final List<DestinoEnvio> shipsTo;

  /// Vende a otras ciudades (lo que habilita la compra al por mayor a
  /// distancia: el comercio deja la caja en la terminal y el bus la lleva).
  bool get despachaAOtrasCiudades => shipsTo.isNotEmpty;
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
    this.compareAtPrice,
    this.descuentoPct,
    this.masPedidoPuesto,
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

  /// Precio ANTES de la rebaja, para tacharlo. Null = no está en oferta.
  final double? compareAtPrice;

  /// El porcentaje de descuento, calculado por el servidor. Null = sin oferta.
  ///
  /// Llega hecho a propósito: si cada pantalla lo derivara, acabarían
  /// redondeando distinto y el «-46 %» del listado no coincidiría con el del
  /// detalle del mismo plato.
  final int? descuentoPct;

  /// Puesto en «lo más pedido» de su tienda (1 = el más pedido). Null cuando
  /// no está entre los primeros o la tienda aún no ha vendido lo suficiente
  /// para que el ranking signifique algo.
  final int? masPedidoPuesto;

  /// Está rebajado de verdad (hay un antes mayor y un porcentaje que enseñar).
  bool get enOferta => descuentoPct != null && compareAtPrice != null;

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
