import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/features/businesses/data/datasources/'
    'businesses_datasource.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

final _businessesDataSourceProvider = Provider<BusinessesDataSource>((ref) {
  return BusinessesDataSource();
});

/// Lista de negocios aliados disponibles para pedir.
final businessesProvider =
    FutureProvider<List<BusinessEntity>>((ref) async {
  return ref.read(_businessesDataSourceProvider).fetchBusinesses();
});

/// Detalle de un negocio por id.
final businessByIdProvider =
    FutureProvider.family<BusinessEntity, String>((ref, id) async {
  return ref.read(_businessesDataSourceProvider).fetchBusinessById(id);
});
