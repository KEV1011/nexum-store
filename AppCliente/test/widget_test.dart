// Pruebas de la app Nexum Cliente: lógica del carrito, formato de moneda y
// render de un widget estático (sin timers).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/cart/presentation/providers/'
    'cart_provider.dart';
import 'package:nexum_client/features/cart/presentation/widgets/'
    'cart_summary.dart';

const _restaurant = BusinessEntity(
  id: 'biz-001',
  name: 'Restaurante El Sabor',
  category: BusinessCategory.restaurant,
  rating: 4.8,
  etaMinutes: 25,
  deliveryFee: 3500,
  address: 'Cra. 6 #8-45',
  products: [
    ProductEntity(
      id: 'p-1',
      name: 'Bandeja Paisa',
      description: 'Completa',
      price: 18000,
    ),
  ],
);

const _otherBusiness = BusinessEntity(
  id: 'biz-002',
  name: 'Pizzería',
  category: BusinessCategory.restaurant,
  rating: 4.5,
  etaMinutes: 30,
  deliveryFee: 4000,
  address: 'Cra. 5',
  products: [
    ProductEntity(
      id: 'p-2',
      name: 'Pizza',
      description: 'Mixta',
      price: 38000,
    ),
  ],
);

ProductEntity _product(String id, double price) => ProductEntity(
      id: id,
      name: 'Producto $id',
      description: '',
      price: price,
    );

void main() {
  group('CartNotifier', () {
    late CartNotifier cart;

    setUp(() => cart = CartNotifier());

    test('arranca vacío', () {
      expect(cart.state.isEmpty, isTrue);
      expect(cart.state.totalItems, 0);
    });

    test('agregar un producto crea una línea con cantidad 1', () {
      cart.addProduct(_product('p-1', 18000), _restaurant);

      expect(cart.state.items, hasLength(1));
      expect(cart.quantityOf('p-1'), 1);
      expect(cart.state.business?.id, 'biz-001');
    });

    test('agregar el mismo producto incrementa la cantidad', () {
      cart
        ..addProduct(_product('p-1', 18000), _restaurant)
        ..addProduct(_product('p-1', 18000), _restaurant);

      expect(cart.state.items, hasLength(1));
      expect(cart.quantityOf('p-1'), 2);
      expect(cart.state.totalItems, 2);
    });

    test('subtotal y total suman domicilio del negocio', () {
      cart
        ..addProduct(_product('p-1', 18000), _restaurant)
        ..addProduct(_product('p-4', 5000), _restaurant);

      expect(cart.state.subtotal, 23000);
      expect(cart.state.deliveryFee, 3500);
      expect(cart.state.total, 26500);
    });

    test('removeOne baja la cantidad y elimina la línea al llegar a 0', () {
      cart
        ..addProduct(_product('p-1', 18000), _restaurant)
        ..addProduct(_product('p-1', 18000), _restaurant)
        ..removeOne('p-1');
      expect(cart.quantityOf('p-1'), 1);

      cart.removeOne('p-1');
      expect(cart.state.isEmpty, isTrue);
    });

    test('agregar de otro negocio reinicia el carrito', () {
      cart
        ..addProduct(_product('p-1', 18000), _restaurant)
        ..addProduct(_product('p-2', 38000), _otherBusiness);

      expect(cart.state.business?.id, 'biz-002');
      expect(cart.state.items, hasLength(1));
      expect(cart.quantityOf('p-1'), 0);
      expect(cart.quantityOf('p-2'), 1);
    });
  });

  group('CurrencyFormatter', () {
    test('formatea pesos colombianos sin decimales', () {
      final formatted = CurrencyFormatter.format(18000);
      expect(formatted, contains('18.000'));
      expect(formatted, contains(r'$'));
      expect(formatted, isNot(contains(',')));
    });
  });

  testWidgets('CartSummary muestra subtotal, domicilio y total', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CartSummary(
            subtotal: 23000,
            deliveryFee: 3500,
            total: 26500,
          ),
        ),
      ),
    );

    expect(find.text('Subtotal'), findsOneWidget);
    expect(find.text('Domicilio'), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
    expect(find.text(CurrencyFormatter.format(26500)), findsOneWidget);
  });
}
