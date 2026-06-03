import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/'
    'business_product_entity.dart';
import 'package:nexum_driver/features/business_portal/presentation/providers/'
    'business_portal_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kKey = 'nexum_biz_products_v1';

BusinessProductEntity _sampleProduct() => const BusinessProductEntity(
      id: 'local-test-1',
      name: 'Producto de prueba',
      price: 12500,
      category: 'General',
      isAvailable: true,
      barcode: '7700000000001',
      stock: 8,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Catálogo del negocio (persistencia local)', () {
    test('la entidad sobrevive un round-trip JSON', () {
      final p = _sampleProduct();
      final restored = BusinessProductEntity.fromJson(
        jsonDecode(jsonEncode(p.toJson())) as Map<String, dynamic>,
      );
      expect(restored.id, p.id);
      expect(restored.name, p.name);
      expect(restored.price, p.price);
      expect(restored.barcode, p.barcode);
      expect(restored.stock, p.stock);
    });

    test('un producto guardado aparece en el catálogo al iniciar', () async {
      // Simula una sesión anterior que ya había agregado un producto.
      SharedPreferences.setMockInitialValues({
        _kKey: [jsonEncode(_sampleProduct().toJson())],
      });

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final list = await container.read(businessProductsProvider.future);

      // El producto persistido debe estar presente (y de primero, ya que los
      // agregados localmente se anteponen al catálogo base).
      expect(list.any((p) => p.id == 'local-test-1'), isTrue);
      expect(list.first.id, 'local-test-1');
    });

    test('addLocal persiste el producto en SharedPreferences', () async {
      SharedPreferences.setMockInitialValues({});

      final container = ProviderContainer();
      addTearDown(container.dispose);

      // Asegura que el provider esté inicializado antes de mutar.
      await container.read(businessProductsProvider.future);

      await container
          .read(businessProductsProvider.notifier)
          .addLocal(_sampleProduct());

      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getStringList(_kKey) ?? const [];
      expect(stored, isNotEmpty);

      final decoded = BusinessProductEntity.fromJson(
        jsonDecode(stored.first) as Map<String, dynamic>,
      );
      expect(decoded.id, 'local-test-1');

      // Y queda reflejado en el estado en memoria.
      final list = container.read(businessProductsProvider).value!;
      expect(list.first.id, 'local-test-1');
    });
  });
}
