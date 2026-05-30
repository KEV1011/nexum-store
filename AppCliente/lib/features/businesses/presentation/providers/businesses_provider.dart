import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/businesses/data/datasources/'
    'businesses_datasource.dart';
import 'package:nexum_client/features/businesses/data/datasources/'
    'businesses_real_datasource.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

final _realDataSourceProvider = Provider<BusinessesRealDataSource>((ref) {
  return BusinessesRealDataSource(dio: ref.watch(apiClientProvider));
});

final _mockDataSourceProvider = Provider<BusinessesDataSource>((ref) {
  return BusinessesDataSource();
});

/// Lista de negocios aliados.
/// Intenta el backend real; si falla (sin red / servidor caído) usa el mock.
final businessesProvider = FutureProvider<List<BusinessEntity>>((ref) async {
  final real = ref.read(_realDataSourceProvider);
  try {
    return await real.fetchBusinesses();
  } catch (_) {
    return ref.read(_mockDataSourceProvider).fetchBusinesses();
  }
});

/// Detalle de un negocio por id.
final businessByIdProvider =
    FutureProvider.family<BusinessEntity, String>((ref, id) async {
  final real = ref.read(_realDataSourceProvider);
  try {
    return await real.fetchBusinessById(id);
  } catch (_) {
    return ref.read(_mockDataSourceProvider).fetchBusinessById(id);
  }
});
