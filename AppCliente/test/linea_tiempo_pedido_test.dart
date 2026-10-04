// La hora de cada paso, como se escribe en pantalla.
//
// La regla que importa: la FECHA solo aparece cuando el paso no es de hoy.
// En un domicilio de treinta minutos, repetir «10/3» en cada renglón es
// ruido; en una encomienda que tarda tres días, «08:15» a secas no dice de
// qué día habla y el cliente cuenta mal.

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/orders/domain/entities/'
    'customer_order_entity.dart';
import 'package:nexum_client/features/orders/presentation/widgets/'
    'order_status_timeline.dart';

void main() {
  final ahora = DateTime(2026, 3, 10, 18, 30);

  test('lo de hoy va solo con la hora', () {
    expect(horaDePaso(DateTime(2026, 3, 10, 9, 5), ahora), '09:05');
    expect(horaDePaso(DateTime(2026, 3, 10, 14, 32), ahora), '14:32');
  });

  test('lo de ayer se dice «ayer», no con una fecha que hay que descifrar', () {
    expect(horaDePaso(DateTime(2026, 3, 9, 20, 0), ahora), 'Ayer 20:00');
  });

  test('más atrás sí lleva la fecha', () {
    expect(horaDePaso(DateTime(2026, 3, 7, 8, 15), ahora), '7/3 08:15');
  });

  test('la medianoche no se confunde con «sin hora»', () {
    // 00:00 es una hora real. Con un formato que la dejara vacía, el paso
    // parecería no haber ocurrido.
    expect(horaDePaso(DateTime(2026, 3, 10, 0, 0), ahora), '00:00');
  });

  test('cruzar la medianoche cuenta como ayer, no como «hace horas»', () {
    // A las 00:30 del día siguiente, un paso de las 23:50 es de AYER aunque
    // hayan pasado cuarenta minutos. Compararlo por horas transcurridas
    // diría «hoy» y la línea de tiempo se leería al revés.
    final madrugada = DateTime(2026, 3, 11, 0, 30);
    expect(horaDePaso(DateTime(2026, 3, 10, 23, 50), madrugada), 'Ayer 23:50');
  });

  group('el paso que llega del servidor', () {
    test('sin hora registrada queda en null, no en una fecha cualquiera', () {
      final p = PasoPedido.fromJson({
        'clave': 'entregado',
        'titulo': 'Entregado',
        'estado': 'pendiente',
        'at': null,
      });
      expect(p.at, isNull);
      expect(p.cumplido, isFalse);
      expect(p.actual, isFalse);
    });

    test('una fecha ilegible tampoco inventa una hora', () {
      final p = PasoPedido.fromJson({
        'clave': 'x', 'titulo': 'X', 'estado': 'actual', 'at': 'no soy fecha',
      });
      expect(p.at, isNull);
      expect(p.actual, isTrue);
    });

    test('un estado desconocido se trata como pendiente, no revienta', () {
      final p = PasoPedido.fromJson({
        'clave': 'x', 'titulo': 'X', 'estado': 'marciano',
      });
      expect(p.cumplido, isFalse);
      expect(p.actual, isFalse);
      expect(p.cancelado, isFalse);
    });
  });

  test('la línea de tiempo sobrevive a copyWith', () {
    // Las actualizaciones en vivo NO traen la bitácora: sin el `??` en
    // copyWith, el primer cambio de estado vaciaría la línea justo cuando el
    // cliente la está mirando. Es el mismo descuido que perdió el PIN.
    final pedido = CustomerOrderEntity(
      id: '1',
      orderRef: 'NX-1',
      businessName: 'X',
      businessAddress: 'Y',
      deliveryAddress: 'Z',
      status: CustomerOrderStatus.preparing,
      lines: const [],
      subtotal: 1000,
      deliveryFee: 0,
      createdAt: ahora,
      timeline: const [
        PasoPedido(clave: 'realizado', titulo: 'Pedido realizado', estado: 'cumplido'),
      ],
      paymentLabel: 'Llave Bre-B',
      cobraElRepartidor: true,
    );
    final despues = pedido.copyWith(status: CustomerOrderStatus.inTransit);
    expect(despues.timeline, hasLength(1));
    expect(despues.paymentLabel, 'Llave Bre-B');
    expect(despues.cobraElRepartidor, isTrue);
  });
}
