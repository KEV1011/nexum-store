import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';
import 'package:nexum_client/features/orders/domain/entities/customer_order_entity.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';

// Cuando un conductor SUELTA un servicio (la app se le cerró y no puede
// seguir), el servidor lo devuelve a la búsqueda. La actualización en vivo
// llega sin ficha de conductor, y el `??` de cada copyWith conservaba la del
// que se fue: el cliente veía «Buscando conductor» con la foto, la placa y el
// teléfono de alguien que ya no venía.
void main() {
  group('viaje', () {
    TransportRequestEntity conConductor() => TransportRequestEntity.fromJson({
          'id': 't1',
          'requestRef': 'NXT-1',
          'serviceType': 'taxi',
          'originAddress': 'Parque',
          'destinationAddress': 'Universidad',
          'estimatedFare': 6000,
          'distanceKm': 2.1,
          'etaMinutes': 8,
          'status': 'accepted',
          'createdAt': '2026-11-17T10:00:00.000Z',
          'driverId': 'd1',
          'driverName': 'Steve',
          'driverPhone': '+573001112233',
          'driverVehicle': 'Chevrolet Spark • ABC123',
        });

    test('de vuelta a buscar, la ficha del conductor anterior desaparece', () {
      final r = conConductor().copyWith(
        status: TransportStatus.searching,
        sinConductor: true,
      );
      expect(r.status, TransportStatus.searching);
      expect(r.driverName, isNull);
      expect(r.driverPhone, isNull);
      expect(r.driverId, isNull);
      expect(r.driverVehicle, isNull);
    });

    test('una actualización normal la conserva (el valor por defecto no borra nada)', () {
      final r = conConductor().copyWith(status: TransportStatus.arriving);
      expect(r.driverName, 'Steve');
      expect(r.driverId, 'd1');
    });

    test('lo que no es del conductor se conserva aunque se borre su ficha', () {
      final r = conConductor().copyWith(sinConductor: true);
      expect(r.requestRef, 'NXT-1');
      expect(r.estimatedFare, 6000);
      expect(r.originAddress, 'Parque');
    });
  });

  group('pedido', () {
    CustomerOrderEntity conRepartidor() => CustomerOrderEntity.fromApi({
          'id': 'o1',
          'orderRef': 'NX-TK86BA',
          'businessName': 'Pieros Pizza',
          'status': 'driverToPickup',
          'driverName': 'Steve',
          'driverPhone': '+573001112233',
          'driverLat': 7.37,
          'driverLng': -72.64,
        });

    test('de vuelta a «en preparación», sin repartidor', () {
      final o = conRepartidor().copyWith(
        status: CustomerOrderStatus.preparing,
        sinConductor: true,
      );
      expect(o.driverName, isNull);
      expect(o.driverPhone, isNull);
      expect(o.driverLat, isNull);
      expect(o.orderRef, 'NX-TK86BA');
    });

    test('sin la marca se conserva', () {
      expect(conRepartidor().copyWith(status: CustomerOrderStatus.atPickup).driverName, 'Steve');
    });
  });

  group('mandado', () {
    ErrandEntity conMandadero() => ErrandEntity.fromServer({
          'id': 'e1',
          'category': 'food',
          'description': 'Compra en La Casona',
          'status': 'accepted',
          'driverName': 'Steve',
          'driverPhone': '+573001112233',
          'driverRating': 4.8,
        });

    test('de vuelta a buscar, sin mandadero', () {
      final e = conMandadero().copyWith(status: ErrandStatus.searching, sinConductor: true);
      expect(e.messengerName, isNull);
      expect(e.messengerPhone, isNull);
      expect(e.messengerRating, isNull);
      expect(e.description, 'Compra en La Casona');
    });

    test('sin la marca se conserva', () {
      expect(conMandadero().copyWith(status: ErrandStatus.shopping).messengerName, 'Steve');
    });
  });
}
