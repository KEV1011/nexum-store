import 'package:dio/dio.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';

/// Datasource real — conecta al backend Express en /client/businesses.
class BusinessesRealDataSource {
  const BusinessesRealDataSource({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<List<BusinessEntity>> fetchBusinesses() async {
    final res = await _dio.get<Map<String, dynamic>>('/client/businesses');
    final data = (res.data!['data'] as List).whereType<Map<String, dynamic>>();
    // COMERCIO A COMERCIO. Con un `map` sobre la lista entera, un solo
    // negocio que no se pudiera leer —un campo que esta versión de la app
    // todavía no espera— dejaba la pantalla principal en un error y a la
    // persona sin poder pedir a NINGÚN local. Perder uno es malo; perder el
    // catálogo completo es que la app no sirve.
    final negocios = <BusinessEntity>[];
    for (final j in data) {
      try {
        negocios.add(_mapToEntity(j));
      } catch (_) {
        // Ese comercio no se puede leer; los demás sí.
      }
    }
    return negocios;
  }

  Future<BusinessEntity> fetchBusinessById(String id) async {
    final res = await _dio.get<Map<String, dynamic>>('/client/businesses/$id');
    return _mapToEntity(res.data!['data'] as Map<String, dynamic>);
  }

  static BusinessEntity _mapToEntity(Map<String, dynamic> j) {
    return BusinessEntity(
      id: j['id'] as String,
      name: j['name'] as String,
      category: _mapCategory(j['category'] as String),
      // Nullable: el backend manda null cuando nadie ha calificado el local.
      // Con el `as num` de antes, un negocio nuevo reventaba la lista entera.
      rating: (j['rating'] as num?)?.toDouble(),
      ratingCount: (j['ratingCount'] as num?)?.toInt() ?? 0,
      etaMinutes: j['etaMinutes'] as int,
      deliveryFee: (j['deliveryFee'] as num).toDouble(),
      promoMinAmount: (j['promoMinAmount'] as num?)?.toInt(),
      promoDiscount: (j['promoDiscount'] as num?)?.toInt(),
      address: j['address'] as String,
      isOpen: j['isOpen'] as bool? ?? true,
      imageUrl: j['imageUrl'] as String?,
      openingHours: j['openingHours'] as String?,
      cerradoMotivo: j['cerradoMotivo'] as String?,
      claimed: j['claimed'] as bool? ?? true,
      shipsTo: ((j['shipsTo'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(DestinoEnvio.fromJson)
          .toList(),
      products: _productos(j['products']),
    );
  }

  /// La carta, plato a plato por la misma razón que la lista de comercios: un
  /// restaurante con cuarenta productos no puede quedarse sin menú porque uno
  /// venga mal. Y un negocio sin carta legible sigue sirviendo para un
  /// mandado, así que tampoco se descarta el negocio.
  static List<ProductEntity> _productos(Object? raw) {
    final productos = <ProductEntity>[];
    for (final p in (raw as List?) ?? const []) {
      if (p is! Map<String, dynamic>) continue;
      try {
        productos.add(_mapProduct(p));
      } catch (_) {
        // Ese producto no se puede leer; el resto de la carta sí.
      }
    }
    return productos;
  }

  static BusinessCategory _mapCategory(String s) => switch (s) {
    'restaurant' => BusinessCategory.restaurant,
    'supermarket' => BusinessCategory.supermarket,
    'pharmacy' => BusinessCategory.pharmacy,
    'store' => BusinessCategory.store,
    // Lo que no se reconozca cae al cajón en vez de reventar la lista: una
    // categoría nueva en el servidor no puede dejar sin comercios a las apps
    // que ya están instaladas.
    _ => BusinessCategory.other,
  };

  static ProductEntity _mapProduct(Map<String, dynamic> j) {
    return ProductEntity(
      id: j['id'] as String,
      name: j['name'] as String,
      description: j['description'] as String? ?? '',
      price: (j['price'] as num).toDouble(),
      compareAtPrice: (j['compareAtPrice'] as num?)?.toDouble(),
      descuentoPct: (j['descuentoPct'] as num?)?.toInt(),
      masPedidoPuesto: (j['masPedidoPuesto'] as num?)?.toInt(),
      category: j['category'] as String? ?? 'General',
      imageUrl: j['imageUrl'] as String?,
      // Una fila de la galería sin `url` se deja fuera en vez de tumbar el
      // producto: el plato con una foto menos se sigue pudiendo pedir.
      images: ((j['images'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map((e) => e['url'])
          .whereType<String>()
          .toList(),
      optionGroups: ((j['optionGroups'] as List?) ?? const [])
          .map((g) => _mapOptionGroup(g as Map<String, dynamic>))
          .toList(),
    );
  }

  static OptionGroupEntity _mapOptionGroup(Map<String, dynamic> j) {
    return OptionGroupEntity(
      id: j['id'] as String,
      name: j['name'] as String? ?? '',
      required: j['required'] as bool? ?? false,
      minSelect: (j['minSelect'] as num?)?.toInt() ?? 0,
      maxSelect: (j['maxSelect'] as num?)?.toInt() ?? 1,
      options: ((j['options'] as List?) ?? const [])
          .map((o) => _mapOption(o as Map<String, dynamic>))
          .toList(),
    );
  }

  static ProductOptionEntity _mapOption(Map<String, dynamic> j) {
    return ProductOptionEntity(
      id: j['id'] as String,
      name: j['name'] as String? ?? '',
      priceDelta: (j['priceDelta'] as num?)?.toDouble() ?? 0,
      isAvailable: j['isAvailable'] as bool? ?? true,
    );
  }
}
