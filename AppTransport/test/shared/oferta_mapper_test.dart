import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/errand_details.dart';
import 'package:nexum_driver/shared/models/oferta_mapper.dart';

/// El mapeo de la oferta que ve el conductor antes de aceptar.
///
/// Es la pantalla con la que decide si le compensa la carrera, y va sin red:
/// los datos llegan crudos del WebSocket, sin tipos que el compilador pueda
/// comprobar. Cruzar dos claves aquí —tarifa por distancia, recogida por
/// entrega— no rompe nada: enseña un número equivocado y el conductor acepta
/// un viaje que no quería.
///
/// Las pruebas fijan tres cosas distintas:
///   · que cada dato salga de la clave correcta,
///   · que una oferta malformada devuelva null en vez de tumbar el home,
///   · y que lo que falta se quede vacío en vez de inventarse.
void main() {
  group('oferta de viaje', () {
    Map<String, dynamic> crudo() => {
          'id': 'viaje-1',
          'passenger': {'id': 'u1', 'name': 'Ana', 'rating': 4.5, 'verified': true},
          'origin': {'lat': 7.3754, 'lng': -72.6486, 'address': 'Calle 5 #3-20'},
          'destination': {'lat': 7.38, 'lng': -72.65, 'address': 'Terminal'},
          'distanceKm': 3.2,
          'estimatedMinutes': 11,
          'estimatedFare': 8700,
          'serviceType': 'TAXI',
          'tarifaRegulada': true,
          'paymentMethod': 'CASH',
        };

    test('cada dato sale de su clave', () {
      final o = ofertaDeViaje(crudo())!;
      expect(o.id, 'viaje-1');
      expect(o.estimatedFare, 8700);
      expect(o.distanceKm, 3.2);
      expect(o.durationMinutes, 11);
      expect(o.origin.address, 'Calle 5 #3-20');
      expect(o.destination.address, 'Terminal');
      expect(o.origin.latitude, 7.3754);
      expect(o.destination.longitude, -72.65);
    });

    // La tarifa del taxi la fija el decreto municipal, no nosotros. Que el
    // conductor vea «Tarifa autorizada» cuando NO lo está sería decirle que
    // un precio nuestro viene del municipio.
    test('la tarifa regulada la declara el servidor, y por defecto es falsa', () {
      expect(ofertaDeViaje(crudo())!.tarifaRegulada, isTrue);
      final sinCampo = crudo()..remove('tarifaRegulada');
      expect(ofertaDeViaje(sinCampo)!.tarifaRegulada, isFalse);
    });

    // Regresó una vez: el matching mandaba `rating: 5.0` escrito a mano, así
    // que TODO pasajero se veía perfecto en la pantalla donde el conductor
    // decide si acepta. Sin calificaciones, la nota va vacía.
    test('sin calificación del pasajero no se inventa una nota', () {
      final sinNota = crudo()..['passenger'] = {'id': 'u1', 'name': 'Ana'};
      expect(ofertaDeViaje(sinNota)!.passenger.rating, isNull);
    });

    test('las paradas llegan como nombres, y las vacías no ocupan sitio', () {
      final conParadas = crudo()
        ..['stops'] = [
          {'name': 'Farmacia', 'order': 1},
          {'name': '', 'order': 2},
          {'order': 3},
        ];
      expect(ofertaDeViaje(conParadas)!.stops, ['Farmacia']);
    });

    test('sin paradas la lista va vacía, no nula', () {
      expect(ofertaDeViaje(crudo())!.stops, isEmpty);
    });

    // El home del conductor escucha este stream mientras conduce. Una oferta
    // a la que le falte un campo no puede tumbar la pantalla: se descarta.
    test('una oferta malformada devuelve null en vez de reventar', () {
      expect(ofertaDeViaje({'id': 'x'}), isNull);
      expect(ofertaDeViaje(crudo()..remove('origin')), isNull);
      expect(ofertaDeViaje(crudo()..['estimatedFare'] = 'ocho mil'), isNull);
      expect(ofertaDeViaje(const {}), isNull);
    });
  });

  group('oferta de pedido', () {
    Map<String, dynamic> crudo() => {
          'id': 'ped-1',
          'orderRef': 'A-42',
          'businessName': 'Sabor Pampero',
          'businessAddress': 'Cra 6 #4-10',
          'businessLat': 7.371,
          'businessLng': -72.641,
          'deliveryAddress': 'Calle 9 #2-30',
          'deliveryLat': 7.380,
          'deliveryLng': -72.655,
          'deliveryFee': 4500,
          'itemsCount': 3,
        };

    test('recoge en el negocio y entrega en la dirección del cliente', () {
      final o = ofertaDePedido(crudo())!;
      expect(o.origin.address, 'Cra 6 #4-10');
      expect(o.origin.latitude, 7.371);
      expect(o.destination.address, 'Calle 9 #2-30');
      expect(o.destination.latitude, 7.380);
    });

    // Lo que gana el repartidor es el domicilio, no el valor del pedido.
    test('la tarifa es el domicilio', () {
      expect(ofertaDePedido(crudo())!.estimatedFare, 4500);
    });

    test('un pedido se reconoce como tal', () {
      final o = ofertaDePedido(crudo())!;
      expect(o.orderId, 'ped-1');
      expect(o.errand, isNotNull);
    });

    // Un pedido viejo sin coordenadas de entrega: el destino cae AL NEGOCIO,
    // no al centro de Pamplona. Mandar al repartidor al obelisco sería peor
    // que dejarlo en el sitio del que ya sabe la dirección escrita.
    test('sin coordenadas de entrega, el destino cae al negocio', () {
      final sinDestino = crudo()
        ..remove('deliveryLat')
        ..remove('deliveryLng');
      final o = ofertaDePedido(sinDestino)!;
      expect(o.destination.latitude, 7.371);
      expect(o.destination.longitude, -72.641);
    });

    test('sin ninguna coordenada usa el centro como último recurso', () {
      final sinNada = crudo()
        ..remove('businessLat')
        ..remove('businessLng')
        ..remove('deliveryLat')
        ..remove('deliveryLng');
      final o = ofertaDePedido(sinNada)!;
      expect(o.origin.latitude, MapConstants.pamplonaCenterLat);
      expect(o.origin.longitude, MapConstants.pamplonaCenterLng);
    });

    // El negocio no se califica desde esta pantalla: una nota ahí sería
    // inventada.
    test('el negocio no trae nota', () {
      expect(ofertaDePedido(crudo())!.passenger.rating, isNull);
    });

    test('malformada devuelve null', () {
      expect(ofertaDePedido(const {}), isNull);
    });
  });

  group('oferta de mandado', () {
    Map<String, dynamic> crudo() => {
          'id': 'man-1',
          'category': 'pharmacy',
          'description': 'Traer acetaminofén',
          'pickupAddress': 'Droguería La 6',
          'dropoffAddress': 'Calle 9 #2-30',
          'serviceFee': 6000,
          'purchaseBudget': 25000,
          'notes': 'Sin timbre',
        };

    test('la tarifa del conductor es el servicio, no el presupuesto', () {
      final o = ofertaDeMandado(crudo())!;
      // 25.000 es la plata de la compra: no es lo que gana.
      expect(o.estimatedFare, 6000);
      expect(o.errand!.purchaseBudget, 25000);
    });

    test('la categoría se traduce, y una desconocida no rompe nada', () {
      expect(ofertaDeMandado(crudo())!.errand!.category, ErrandCategory.pharmacy);
      final rara = crudo()..['category'] = 'teletransporte';
      expect(ofertaDeMandado(rara)!.errand!.category, ErrandCategory.other);
    });

    test('las direcciones se conservan aunque no vengan coordenadas', () {
      final o = ofertaDeMandado(crudo())!;
      expect(o.origin.address, 'Droguería La 6');
      expect(o.destination.address, 'Calle 9 #2-30');
    });

    test('sin presupuesto de compra queda vacío, no en cero', () {
      final sinPresupuesto = crudo()..remove('purchaseBudget');
      expect(ofertaDeMandado(sinPresupuesto)!.errand!.purchaseBudget, isNull);
    });

    test('malformada devuelve null', () {
      expect(ofertaDeMandado(const {}), isNull);
    });
  });
}
