import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/business_product_entity.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/master_product_entity.dart';

/// Acceso al catálogo maestro y a los productos del negocio.
///
/// Mock-first: intenta el backend (`/catalog/*`) y cae a un catálogo maestro
/// sembrado en memoria cuando la API no está disponible (demo web / offline).
class CatalogDataSource {
  CatalogDataSource({DioClient? client}) : _client = client ?? DioClient();

  final DioClient _client;

  // ── Catálogo maestro ─────────────────────────────────────────────────────

  /// Busca un EAN-13 en el maestro. Devuelve null si no existe.
  Future<MasterProductEntity?> lookupBarcode(String barcode) async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/catalog/lookup',
        queryParameters: {'barcode': barcode},
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      final found = data?['found'] as bool? ?? false;
      if (!found) return null;
      return MasterProductEntity.fromJson(
        data!['master'] as Map<String, dynamic>,
      );
    } catch (_) {
      return _mockLookup(barcode);
    }
  }

  /// Sugerencias por texto en el maestro (entrada sin escáner).
  Future<List<MasterProductEntity>> searchMaster(String query) async {
    try {
      final res = await _client.get<Map<String, dynamic>>(
        '/catalog/search',
        queryParameters: {'q': query},
      );
      final list = (res.data?['data'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(MasterProductEntity.fromJson)
          .toList();
      return list;
    } catch (_) {
      final q = query.toLowerCase();
      return _seedMaster
          .where((m) =>
              m.name.toLowerCase().contains(q) ||
              (m.brand?.toLowerCase().contains(q) ?? false))
          .toList();
    }
  }

  // ── Productos por negocio ─────────────────────────────────────────────────

  /// Agrega un producto al negocio. Con [barcode] enlaza el maestro; con
  /// [name] (sin barcode) crea un producto único de restaurante.
  Future<BusinessProductEntity?> addProduct({
    required String businessId,
    required double price,
    String? barcode,
    String? name,
    String? description,
    int? stock,
    String? category,
    String? masterName,
    String? brand,
  }) async {
    try {
      final res = await _client.post<Map<String, dynamic>>(
        '/catalog/products',
        data: {
          'businessId': businessId,
          'price': price,
          if (barcode != null) 'barcode': barcode,
          if (name != null) 'name': name,
          if (description != null) 'description': description,
          if (stock != null) 'stock': stock,
          if (category != null) 'category': category,
          if (masterName != null) 'masterName': masterName,
          if (brand != null) 'brand': brand,
        },
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return BusinessProductEntity.fromJson(data);
    } catch (_) {
      // Modo demo: construye la entidad localmente desde el maestro sembrado.
      final master = barcode != null ? _mockLookup(barcode) : null;
      return BusinessProductEntity(
        id: 'local-${DateTime.now().millisecondsSinceEpoch}',
        name: master?.name ?? name ?? 'Producto',
        price: price,
        category: master?.category ?? category ?? 'General',
        isAvailable: true,
        barcode: master?.barcode ?? barcode,
        masterProductId: master?.id,
        stock: stock,
        requiresRx: master?.requiresRx ?? false,
        description: description,
      );
    }
  }

  /// Carga masiva: devuelve cuántos se agregaron y los errores por fila.
  Future<({int added, int errors})> bulkImport({
    required String businessId,
    required List<Map<String, dynamic>> rows,
  }) async {
    try {
      final res = await _client.post<Map<String, dynamic>>(
        '/catalog/products/bulk',
        data: {'businessId': businessId, 'rows': rows},
      );
      final data = res.data?['data'] as Map<String, dynamic>?;
      return (
        added: (data?['added'] as num?)?.toInt() ?? 0,
        errors: (data?['errors'] as List<dynamic>?)?.length ?? 0,
      );
    } catch (_) {
      final valid = rows.where((r) => r['price'] is num).length;
      return (added: valid, errors: rows.length - valid);
    }
  }

  // ── Mock master catalog (espejo del seed del backend) ─────────────────────

  MasterProductEntity? _mockLookup(String barcode) {
    final code = barcode.trim();
    for (final m in _seedMaster) {
      if (m.barcode == code) return m;
    }
    return null;
  }

  static const _seedMaster = <MasterProductEntity>[
    MasterProductEntity(id: 'mp-1', barcode: '7702004003508', name: 'Coca-Cola Original 1.5L', brand: 'Coca-Cola', category: 'Bebidas', presentation: '1.5L', requiresRx: false),
    MasterProductEntity(id: 'mp-2', barcode: '7702090038323', name: 'Agua Cristal sin gas 600ml', brand: 'Cristal', category: 'Bebidas', presentation: '600ml', requiresRx: false),
    MasterProductEntity(id: 'mp-3', barcode: '7702011099999', name: 'Jugo Hit Mora 1L', brand: 'Hit', category: 'Bebidas', presentation: '1L', requiresRx: false),
    MasterProductEntity(id: 'mp-4', barcode: '7702031393019', name: 'Pony Malta 330ml', brand: 'Bavaria', category: 'Bebidas', presentation: '330ml', requiresRx: false),
    MasterProductEntity(id: 'mp-5', barcode: '7702993000014', name: 'Arroz Diana x 500g', brand: 'Diana', category: 'Granos', presentation: '500g', requiresRx: false),
    MasterProductEntity(id: 'mp-6', barcode: '7702189070016', name: 'Aceite Premier 1000ml', brand: 'Premier', category: 'Aceites', presentation: '1L', requiresRx: false),
    MasterProductEntity(id: 'mp-7', barcode: '7702025130016', name: 'Café Águila Roja 500g', brand: 'Águila Roja', category: 'Café', presentation: '500g', requiresRx: false),
    MasterProductEntity(id: 'mp-8', barcode: '7702008201006', name: 'Chocolate Corona Pasta 250g', brand: 'Corona', category: 'Chocolate', presentation: '250g', requiresRx: false),
    MasterProductEntity(id: 'mp-9', barcode: '7705320000016', name: 'Panela El Trapiche x 500g', brand: 'El Trapiche', category: 'Endulzantes', presentation: '500g', requiresRx: false),
    MasterProductEntity(id: 'mp-10', barcode: '7702027001001', name: 'Jabón Rey 300g', brand: 'Rey', category: 'Aseo', presentation: '300g', requiresRx: false),
    MasterProductEntity(id: 'mp-11', barcode: '7702018201006', name: 'Papel Higiénico Familia x4', brand: 'Familia', category: 'Aseo', presentation: 'x4 rollos', requiresRx: false),
    MasterProductEntity(id: 'mp-12', barcode: '7702010001009', name: 'Crema Dental Colgate 100ml', brand: 'Colgate', category: 'Aseo', presentation: '100ml', requiresRx: false),
    MasterProductEntity(id: 'mp-13', barcode: '7702057000019', name: 'Acetaminofén MK 500mg x10', brand: 'MK', category: 'Medicamentos', presentation: 'x10 tabletas', requiresRx: false, invimaCode: 'INVIMA 2018M-0001'),
    MasterProductEntity(id: 'mp-14', barcode: '7702057000026', name: 'Ibuprofeno MK 400mg x10', brand: 'MK', category: 'Medicamentos', presentation: 'x10 tabletas', requiresRx: false, invimaCode: 'INVIMA 2019M-0002'),
    MasterProductEntity(id: 'mp-15', barcode: '7702057000033', name: 'Sal de Frutas Lua', brand: 'Lua', category: 'Medicamentos', presentation: 'sobre', requiresRx: false, invimaCode: 'INVIMA 2017M-0003'),
    MasterProductEntity(id: 'mp-16', barcode: '7702132000017', name: 'Suero Oral Pedialyte 500ml', brand: 'Pedialyte', category: 'Medicamentos', presentation: '500ml', requiresRx: false),
    MasterProductEntity(id: 'mp-17', barcode: '7702057111019', name: 'Amoxicilina 500mg x15', brand: 'Genfar', category: 'Medicamentos', presentation: 'x15 cápsulas', requiresRx: true, invimaCode: 'INVIMA 2015M-0010'),
    MasterProductEntity(id: 'mp-18', barcode: '7702057111026', name: 'Losartán 50mg x30', brand: 'La Santé', category: 'Medicamentos', presentation: 'x30 tabletas', requiresRx: true, invimaCode: 'INVIMA 2016M-0011'),
  ];
}
