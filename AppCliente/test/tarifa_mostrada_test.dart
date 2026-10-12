/// La cifra que el pasajero ve de su viaje.
///
/// EL MISMO DEFECTO QUE EL RECIBO DEL PEDIDO, en la otra superficie —y es la
/// regla de este repositorio: cuando se corrige un número derivado, hay que
/// buscarlo en la dirección contraria—. La pantalla de pedir ya usaba
/// `totalPasajero`, con su comentario explicando que prometer un precio y
/// cobrar otro no se puede; el SEGUIMIENTO, que es la pantalla que se mira
/// durante y después del viaje, usaba `displayFare` = `finalFare ??
/// estimatedFare`, o sea la tarifa SIN el cupón restado… bajo la etiqueta
/// «Total cobrado».
///
/// Así que las dos pantallas del mismo viaje decían cifras distintas, y
/// pagando en efectivo el pasajero le habría dado al conductor la de la
/// equivocada.
///
/// `totalPasajero` lo calcula el servidor (`lib/descuento-viaje.ts`) y es el
/// único de los tres que trae el descuento dentro.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';

/// El viaje tal como lo manda `_toTripDTO` de `client.service.ts`.
Map<String, dynamic> viaje({
  double estimatedFare = 8500,
  double? finalFare,
  int? promoDiscount,
  double? totalPasajero,
  String status = 'completed',
}) =>
    <String, dynamic>{
      'id': 'trip-1',
      'requestRef': 'NX-001',
      'serviceType': 'taxi',
      'originAddress': 'Calle 5 # 3-40',
      'destinationAddress': 'Carrera 4A # 10-53',
      'estimatedFare': estimatedFare,
      if (finalFare != null) 'finalFare': finalFare,
      if (promoDiscount != null) 'promoDiscount': promoDiscount,
      if (totalPasajero != null) 'totalPasajero': totalPasajero,
      'distanceKm': 3.2,
      'etaMinutes': 12,
      'status': status,
      'createdAt': '2026-10-12T15:00:00.000Z',
    };

void main() {
  group('lo que paga el pasajero', () {
    test('con cupón manda el total del servidor, no la tarifa completa', () {
      // La comprobación que justifica el fichero: 8.500 de carrera con 2.500
      // de cupón son 6.000, y es lo que hay que enseñar.
      final t = TransportRequestEntity.fromJson(
        viaje(finalFare: 8500, promoDiscount: 2500, totalPasajero: 6000),
      );
      expect(t.displayFare, 6000);
    });

    test('con cupón, antes de terminar el viaje, también', () {
      // Mientras el viaje corre el servidor aplica el cupón sobre la
      // estimación: enseñar la estimación a secas sería prometer de más.
      final t = TransportRequestEntity.fromJson(
        viaje(
          status: 'in_progress',
          promoDiscount: 2500,
          totalPasajero: 6000,
        ),
      );
      expect(t.displayFare, 6000);
    });

    test('sin cupón se enseña lo que se cobró', () {
      final t = TransportRequestEntity.fromJson(
        viaje(finalFare: 9000, totalPasajero: 9000),
      );
      expect(t.displayFare, 9000);
      expect(t.promoDiscount, 0);
    });

    test('un backend que no manda el total cae a lo cobrado', () {
      // Compatibilidad: y sin cupón las dos cifras coinciden, así que no se
      // pierde nada.
      final t = TransportRequestEntity.fromJson(viaje(finalFare: 9000));
      expect(t.displayFare, 9000);
    });

    test('viaje aún sin cobrar: la estimación, que es lo único que hay', () {
      final t = TransportRequestEntity.fromJson(viaje(status: 'searching'));
      expect(t.displayFare, 8500);
      expect(t.finalFare, isNull);
    });
  });

  group('la cifra no se pierde por el camino', () {
    test('una actualización en vivo la conserva', () {
      // Las actualizaciones de estado NO traen el total, igual que no traen
      // el PIN: sin el `??` el pasajero volvería a ver la tarifa completa en
      // cuanto el viaje cambiara de estado.
      final t = TransportRequestEntity.fromJson(
        viaje(finalFare: 8500, promoDiscount: 2500, totalPasajero: 6000),
      );
      final despues = t.copyWith(status: TransportStatus.completed);
      expect(despues.displayFare, 6000);
      expect(despues.promoDiscount, 2500);
    });

    test('ida y vuelta por la caché del teléfono', () {
      final t = TransportRequestEntity.fromJson(
        viaje(finalFare: 8500, promoDiscount: 2500, totalPasajero: 6000),
      );
      final guardado = TransportRequestEntity.fromJson(t.toJson());
      expect(guardado.displayFare, 6000);
    });
  });
}
