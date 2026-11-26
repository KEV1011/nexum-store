// El pedido a un local que no es aliado sale como compra por mandado. Lo que
// llega al repartidor es la lista: si las opciones elegidas («Grande») no van
// en ella, compraría lo que nadie pidió.

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/cart/data/compra_api.dart';

void main() {
  test('las opciones elegidas y la nota viajan en la línea', () {
    final l = lineasDeCompra([
      (productId: 'p1', quantity: 2, opciones: 'Grande', notas: 'sin cebolla'),
    ]);
    expect(l.single, {
      'productId': 'p1',
      'quantity': 2,
      'notes': 'Grande · sin cebolla',
    });
  });

  test('sin opciones ni nota no se manda una nota vacía', () {
    final l = lineasDeCompra([
      (productId: 'p2', quantity: 1, opciones: null, notas: '  '),
    ]);
    expect(l.single.containsKey('notes'), isFalse);
  });

  test('el código es el mismo que manda el servidor', () {
    expect(kCodigoComprarPorMandado, 'comprar_por_mandado');
  });
}
