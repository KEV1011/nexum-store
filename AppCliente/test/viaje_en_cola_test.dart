import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/transport/domain/entities/transport_request_entity.dart';

// Viaje encadenado: el conductor aceptó este viaje mientras termina otro con
// un pasajero a bordo. El servidor lo marca con `driverFinishingOtherTrip` y
// la app lo dice; sin eso, el carro yendo hacia otro lado se lee como que no
// viene.
void main() {
  Map<String, dynamic> base({bool? enCola}) => {
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
        'driverName': 'Steve',
        if (enCola != null) 'driverFinishingOtherTrip': enCola,
      };

  test('se lee del servidor y sin el dato es falso', () {
    expect(TransportRequestEntity.fromJson(base(enCola: true)).terminandoOtroViaje,
        isTrue,);
    expect(TransportRequestEntity.fromJson(base()).terminandoOtroViaje, isFalse);
  });

  test('sobrevive al disco (la app se cierra con el viaje aceptado)', () {
    final r = TransportRequestEntity.fromJson(base(enCola: true));
    expect(TransportRequestEntity.fromJson(r.toJson()).terminandoOtroViaje,
        isTrue,);
  });

  test('si el conductor suelta el viaje, el aviso se va con su ficha', () {
    final r = TransportRequestEntity.fromJson(base(enCola: true))
        .copyWith(status: TransportStatus.searching, sinConductor: true);
    expect(r.terminandoOtroViaje, isFalse);
  });
}
