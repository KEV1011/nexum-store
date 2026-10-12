/// Lo que el recibo del pedido dice que se pagó.
///
/// EL TOTAL LO SELLA EL SERVIDOR (`total = subtotal − descuento + domicilio +
/// flete`, en `placeClientOrder`), y la app lo derivaba por su cuenta como
/// `subtotal + domicilio`. O sea que el recibo se contradecía a sí mismo en
/// las dos direcciones:
///
///   · con una promoción de la tienda enseñaba MÁS de lo que se cobró,
///     porque dejaba el descuento fuera;
///   · en una encomienda a otra ciudad enseñaba MENOS, porque dejaba fuera el
///     flete —que va aparte del domicilio a propósito: el domicilio lo cobra
///     el repartidor urbano y el flete la transportadora—.
///
/// Es el mismo defecto que el backend ya tiene vigilado de su lado
/// (`e2e/comprar-a-otra-ciudad.ts` comprueba «el recibo que cuadra consigo
/// mismo»), y faltaba la mitad de la app.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/orders/domain/entities/customer_order_entity.dart';

/// El pedido tal como lo manda `_toSummary` de `client.service.ts`.
///
/// `items` y no `lines`: es la clave del DTO del servidor, y lo que separa
/// `fromApi` de `fromJson` (el de la caché del teléfono).
Map<String, dynamic> dto({
  double subtotal = 50000,
  double deliveryFee = 3000,
  double? promoDiscount,
  double? intercityFee,
  double? total,
}) =>
    <String, dynamic>{
      'id': 'ord-1',
      'orderRef': 'NX-001',
      'businessName': 'Asadero',
      'status': 'confirmed',
      'deliveryAddress': 'Calle 5 # 3-40',
      'subtotal': subtotal,
      'deliveryFee': deliveryFee,
      if (promoDiscount != null) 'promoDiscount': promoDiscount,
      if (intercityFee != null) 'intercityFee': intercityFee,
      if (total != null) 'total': total,
      'etaMinutes': 30,
      'createdAt': '2026-10-12T15:00:00.000Z',
      'items': <dynamic>[],
    };

void main() {
  group('el total que se enseña es el que se cobró', () {
    test('manda el del servidor, no el que la app recalcularía', () {
      // Si alguien volviera a derivarlo, este caso cae: la cuenta de la app
      // daría 53.000 y el servidor cobró 47.000.
      final o = CustomerOrderEntity.fromApi(
        dto(promoDiscount: 6000, total: 47000),
      );
      expect(o.total, 47000);
    });

    test('con promoción, el recibo CUADRA', () {
      final o = CustomerOrderEntity.fromApi(
        dto(promoDiscount: 6000, total: 47000),
      );
      expect(
        o.subtotal - o.promoDiscount + o.deliveryFee + o.intercityFee,
        o.total,
        reason: 'los renglones del recibo tienen que sumar el total',
      );
    });

    test('encomienda a otra ciudad: el flete va EN el total', () {
      // Sin domicilio urbano (la recoge en la taquilla) y con flete: el total
      // derivado se habría quedado en 50.000 y se cobraron 68.000.
      final o = CustomerOrderEntity.fromApi(
        dto(deliveryFee: 0, intercityFee: 18000, total: 68000),
      );
      expect(o.total, 68000);
      expect(o.intercityFee, 18000);
      expect(o.deliveryFee, 0, reason: 'nadie hace un domicilio en destino');
    });

    test('un pedido normal sigue dando lo mismo que siempre', () {
      final o = CustomerOrderEntity.fromApi(dto(total: 53000));
      expect(o.total, 53000);
      expect(o.promoDiscount, 0);
      expect(o.intercityFee, 0);
    });

    test('sin el total del servidor se deriva, y sin promo ni flete da igual',
        () {
      // Compatibilidad: pedidos guardados por una versión anterior de la app.
      final o = CustomerOrderEntity.fromApi(dto());
      expect(o.total, 53000);
    });

    test('derivado, el descuento y el flete también cuentan', () {
      // Un pedido viejo con promoción en la caché: mejor restar lo que se
      // sabe que repetir el error de ignorarlo.
      final o = CustomerOrderEntity.fromApi(
        dto(promoDiscount: 6000, intercityFee: 18000),
      );
      expect(o.total, 65000);
    });
  });

  group('el total sobrevive al disco', () {
    test('ida y vuelta por la caché del teléfono', () {
      // Si `toJson` no lo guardara, el mismo pedido enseñaría un total
      // distinto después de cerrar y abrir la app.
      final api = CustomerOrderEntity.fromApi(
        dto(promoDiscount: 6000, intercityFee: 18000, total: 65000),
      );
      final cache = CustomerOrderEntity.fromJson(api.toJson());
      expect(cache.total, 65000);
      expect(cache.promoDiscount, 6000);
      expect(cache.intercityFee, 18000);
    });

    test('una actualización en vivo no se lleva el total por delante',
        () {
      // Las actualizaciones traen el DTO completo, pero `copyWith` se usa
      // para cambios puntuales de estado: es el mismo descuido que borró el
      // PIN de entrega.
      final o = CustomerOrderEntity.fromApi(
        dto(promoDiscount: 6000, total: 47000),
      );
      final despues = o.copyWith(status: CustomerOrderStatus.inTransit);
      expect(despues.total, 47000);
      expect(despues.promoDiscount, 6000);
    });
  });
}
