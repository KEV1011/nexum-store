// Las píldoras de categoría del home.
//
// Lo que se vigila aquí son las dos formas en que un filtro miente sin que se
// note: ofrecer un rubro que no tiene un solo comercio (la lista sale vacía y
// se lee como que la app está rota) y cambiar de orden entre una apertura y
// otra (se toca la píldora equivocada por costumbre).

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'fila_categorias_comercio.dart';

BusinessEntity _negocio(String id, BusinessCategory c) => BusinessEntity(
      id: id,
      name: id,
      category: c,
      rating: null,
      etaMinutes: 20,
      deliveryFee: 3000,
      address: 'Calle 5 # 3-40',
      products: const [],
    );

void main() {
  test('solo salen las categorías que tienen comercios', () {
    final presentes = categoriasPresentes([
      _negocio('a', BusinessCategory.restaurant),
      _negocio('b', BusinessCategory.store),
    ]);
    expect(presentes, [BusinessCategory.restaurant, BusinessCategory.store]);
    expect(presentes.contains(BusinessCategory.pharmacy), isFalse);
  });

  test('el orden es el del enum, no el de llegada', () {
    // Si dependiera de cuál cargó primero, las píldoras bailarían entre una
    // apertura y otra.
    final a = categoriasPresentes([
      _negocio('a', BusinessCategory.store),
      _negocio('b', BusinessCategory.restaurant),
    ]);
    final b = categoriasPresentes([
      _negocio('c', BusinessCategory.restaurant),
      _negocio('d', BusinessCategory.store),
    ]);
    expect(a, b);
    expect(a.first, BusinessCategory.restaurant);
  });

  test('con una sola categoría no hay fila: filtrar no filtraría nada', () {
    expect(
      categoriasPresentes([
        _negocio('a', BusinessCategory.restaurant),
        _negocio('b', BusinessCategory.restaurant),
      ]),
      isEmpty,
    );
  });

  test('sin comercios tampoco', () {
    expect(categoriasPresentes(const []), isEmpty);
  });

  test('cada categoría tiene plural, y ninguno repite a otro', () {
    final plurales =
        BusinessCategory.values.map((c) => c.plural).toList();
    expect(plurales.toSet().length, plurales.length);
    for (final p in plurales) {
      expect(p.trim(), isNotEmpty);
    }
  });

  test('«other» ya no se llama «Tienda»', () {
    // Era su etiqueta antes de que la mercancía tuviera la suya: dos
    // categorías con el mismo nombre en la misma lista son indistinguibles.
    expect(BusinessCategory.other.label, isNot('Tienda'));
    expect(BusinessCategory.store.label, 'Tienda');
  });
}
