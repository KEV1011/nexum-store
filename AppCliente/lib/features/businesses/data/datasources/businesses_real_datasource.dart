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
      products: ((j['products'] as List?) ?? [])
          .cast<Map<String, dynamic>>()
          .map(_mapProduct)
          .toList(),
    );
  }

  static BusinessCategory _mapCategory(String s) => switch (s) {
    'restaurant' => BusinessCategory.restaurant,
    'fastFood' || 'fast_food' => BusinessCategory.fastFood,
    'bakery' => BusinessCategory.bakery,
    'cafe' => BusinessCategory.cafe,
    'iceCream' || 'ice_cream' => BusinessCategory.iceCream,
    'drinks' || 'liquor' => BusinessCategory.drinks,
    'supermarket' => BusinessCategory.supermarket,
    'convenience' => BusinessCategory.convenience,
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
    );
  }
}
