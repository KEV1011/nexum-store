import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/features/businesses/data/datasources/'
    'businesses_real_datasource.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

final _realDataSourceProvider = Provider<BusinessesRealDataSource>((ref) {
  return BusinessesRealDataSource(dio: ref.watch(apiClientProvider));
});

/// Lista de negocios aliados desde el backend. Si la red falla, el error se
/// propaga y la pantalla muestra su estado de error con reintento (nada de
/// negocios de demostración).
final businessesProvider = FutureProvider<List<BusinessEntity>>((ref) {
  return ref.read(_realDataSourceProvider).fetchBusinesses();
});

/// Detalle de un negocio por id (backend real; el error se propaga a la UI).
final businessByIdProvider =
    FutureProvider.family<BusinessEntity, String>((ref, id) {
  return ref.read(_realDataSourceProvider).fetchBusinessById(id);
});
