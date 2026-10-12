/// Lo que el carrito le dice al cliente que va a pagar.
///
/// El precio que se COBRA lo recalcula el servidor con los `optionIds` —así lo
/// dice el propio `cart_provider`, y es lo que impide pedir una hamburguesa a
/// mil pesos—, pero esto es lo que la persona ve antes de confirmar. Si las
/// dos cifras no coinciden, la queja es inmediata y cara.
///
/// Las dos reglas que se rompen sin que nadie lo note están en `lineId`: las
/// opciones se ORDENAN antes de firmar la línea —elegir «grande» y «queso» en
/// distinto orden tiene que ser la MISMA línea, no dos— y la nota entra en la
/// firma, porque una hamburguesa «sin cebolla» y otra normal son dos platos
/// distintos para la cocina aunque cuesten lo mismo.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/businesses/domain/entities/business_entity.dart';
import 'package:nexum_client/features/cart/presentation/providers/cart_provider.dart';

ProductEntity plato({double precio = 21000, String id = 'p1'}) =>
    ProductEntity(
      id: id,
      name: 'Hamburguesa',
      description: '',
      price: precio,
    );

ProductOptionEntity opcion(String id, {double delta = 0}) =>
    ProductOptionEntity(id: id, name: id, priceDelta: delta);

BusinessEntity negocio({double domicilio = 3000}) => BusinessEntity(
      id: 'b1',
      name: 'Asadero',
      category: BusinessCategory.restaurant,
      address: 'Calle 5',
      deliveryFee: domicilio,
      etaMinutes: 30,
      // Sin votos todavía: `rating` es nullable desde que se quitó el 5,0 de
      // fábrica, y pasarlo nulo es además el caso más común de un local nuevo.
      rating: null,
      products: const [],
    );

void main() {
  group('lo que cuesta una línea', () {
    test('producto simple: precio por cantidad', () {
      final l = CartItem(product: plato(), quantity: 3);
      expect(l.unitPrice, 21000);
      expect(l.subtotal, 63000);
    });

    test('las opciones suman su delta al precio base', () {
      final l = CartItem(
        product: plato(),
        quantity: 2,
        selectedOptions: [opcion('grande', delta: 4000), opcion('queso', delta: 2000)],
      );
      expect(l.unitPrice, 27000);
      expect(l.subtotal, 54000);
    });

    test('una opción que RESTA también cuenta', () {
      // «Sin queso −500» es una opción legítima; si el delta negativo se
      // ignorara, se cobraría de más y nadie lo reclamaría hasta la factura.
      final l = CartItem(
        product: plato(),
        quantity: 1,
        selectedOptions: [opcion('sin queso', delta: -500)],
      );
      expect(l.unitPrice, 20500);
    });

    test('los ids que viajan al servidor son los de las opciones elegidas', () {
      final l = CartItem(
        product: plato(),
        quantity: 1,
        selectedOptions: [opcion('a'), opcion('b')],
      );
      expect(l.optionIds, ['a', 'b']);
    });
  });

  group('cuándo dos cosas son la MISMA línea', () {
    test('las mismas opciones en distinto orden, una sola línea', () {
      // Fija el `sort` de `lineId`. Sin él, el cliente vería dos líneas
      // idénticas y la cocina creería que son dos platos.
      final a = CartItem(
        product: plato(),
        quantity: 1,
        selectedOptions: [opcion('grande'), opcion('queso')],
      );
      final b = CartItem(
        product: plato(),
        quantity: 1,
        selectedOptions: [opcion('queso'), opcion('grande')],
      );
      expect(a.lineId, b.lineId);
    });

    test('la misma comida con nota distinta son DOS líneas', () {
      final sinCebolla = CartItem(
        product: plato(),
        quantity: 1,
        notes: 'sin cebolla',
      );
      final normal = CartItem(product: plato(), quantity: 1);
      expect(sinCebolla.lineId, isNot(normal.lineId));
    });

    test('un producto sin opciones ni nota se identifica por su id a secas', () {
      // Compatibilidad: así estaban las líneas antes de que existieran las
      // opciones, y los carritos guardados siguen teniendo esa forma.
      expect(CartItem(product: plato(), quantity: 1).lineId, 'p1');
    });
  });

  group('lo que suma el carrito', () {
    test('subtotal de varias líneas, más el domicilio del negocio', () {
      final c = CartState(
        items: [
          CartItem(product: plato(), quantity: 2),
          CartItem(product: plato(precio: 5000, id: 'p2'), quantity: 1),
        ],
        business: negocio(),
      );
      expect(c.subtotal, 47000);
      expect(c.deliveryFee, 3000);
      expect(c.total, 50000);
      expect(c.totalItems, 3);
    });

    test('sin negocio no se cobra domicilio', () {
      final c = CartState(items: [CartItem(product: plato(), quantity: 1)]);
      expect(c.deliveryFee, 0);
      expect(c.total, 21000);
    });

    test('un carrito vacío está vacío', () {
      expect(const CartState().isEmpty, isTrue);
      expect(const CartState().subtotal, 0);
    });
  });
}
