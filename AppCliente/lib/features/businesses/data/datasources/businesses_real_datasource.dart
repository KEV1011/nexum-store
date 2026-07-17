import 'package:dio/dio.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';

/// Datasource real — conecta al backend Express en /client/businesses.
class BusinessesRealDataSource {
  const BusinessesRealDataSource({required Dio dio}) : _dio = dio;

  final Dio _dio;

  Future<List<BusinessEntity>> fetchBusinesses() async {
    final res = await _dio.get<Map<String, dynamic>>('/client/businesses');
    final data = (res.data!['data'] as List).cast<Map<String, dynamic>>();
    return data.map(_mapToEntity).toList();
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
      rating: (j['rating'] as num).toDouble(),
      etaMinutes: j['etaMinutes'] as int,
      deliveryFee: (j['deliveryFee'] as num).toDouble(),
      address: j['address'] as String,
      isOpen: j['isOpen'] as bool? ?? true,
      imageUrl: j['imageUrl'] as String?,
      products: ((j['products'] as List?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(_mapProduct)
          .toList(),
    );
  }

  static BusinessCategory _mapCategory(String s) => switch (s) {
    'restaurant' => BusinessCategory.restaurant,
    'supermarket' => BusinessCategory.supermarket,
    'pharmacy' => BusinessCategory.pharmacy,
    _ => BusinessCategory.other,
  };

  static ProductEntity _mapProduct(Map<String, dynamic> j) {
    return ProductEntity(
      id: j['id'] as String,
      name: j['name'] as String,
      description: j['description'] as String? ?? '',
      price: (j['price'] as num).toDouble(),
      category: j['category'] as String? ?? 'General',
      imageUrl: j['imageUrl'] as String?,
      images: ((j['images'] as List?) ?? const [])
          .map((e) => (e as Map<String, dynamic>)['url'] as String)
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
