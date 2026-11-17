import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/shared/services/servicios_abiertos.dart';

// Lo que devuelve GET /driver/servicios-abiertos, con la forma exacta de
// `ServicioAbiertoDTO` en el servidor. Esto se lee al abrir la app: una fila
// rara no puede tumbar el inicio.
void main() {
  Map<String, dynamic> viaje() => {
        'tipo': 'trip',
        'id': 'trip-1',
        'ref': 'NXT-1',
        'estado': 'ARRIVED',
        'fase': 'en_espera',
        'puedeSoltar': true,
        'desde': '2026-11-17T10:00:00.000Z',
        'oferta': {
          'id': 'trip-1',
          'passenger': {'id': 'u1', 'name': 'Laura', 'rating': null, 'totalTrips': 0},
          'origin': {'lat': 7.37, 'lng': -72.64, 'address': 'Parque'},
          'destination': {'lat': 7.38, 'lng': -72.65, 'address': 'Universidad'},
          'distanceKm': 2.1,
          'estimatedMinutes': 8,
          'estimatedFare': 6000,
          'serviceType': 'TAXI',
        },
      };

  Map<String, dynamic> mandado() => {
        'tipo': 'errand',
        'id': 'man-1',
        'ref': 'NXE-1',
        'estado': 'SHOPPING',
        'fase': 'en_espera',
        'puedeSoltar': false,
        'motivoNoSoltar': 'Ya empezaste la compra: termínala y entrégala.',
        'oferta': {
          'id': 'man-1',
          'category': 'food',
          'description': 'Compra en La Casona',
          'pickupAddress': 'La Casona',
          'dropoffAddress': 'Casa',
          'serviceFee': 6000,
        },
      };

  test('un servicio completo se lee con todo', () {
    final s = ServicioAbierto.fromJson(viaje())!;
    expect(s.tipo, 'trip');
    expect(s.fase, 'en_espera');
    expect(s.puedeSoltar, isTrue);
    expect(s.nombre, 'Viaje');
    expect(s.faseTexto, 'Esperando al pasajero');
  });

  test('la oferta se convierte con el mismo mapeador que las ofertas en vivo', () {
    final req = ServicioAbierto.fromJson(viaje())!.solicitud;
    expect(req, isNotNull);
    expect(req!.id, 'trip-1');
    final m = ServicioAbierto.fromJson(mandado())!.solicitud;
    expect(m, isNotNull);
    expect(m!.isErrand, isTrue);
  });

  test('el que no se puede soltar trae el motivo', () {
    final s = ServicioAbierto.fromJson(mandado())!;
    expect(s.puedeSoltar, isFalse);
    expect(s.motivoNoSoltar, contains('compra'));
    expect(s.faseTexto, 'Haciendo la compra');
  });

  test('sin tipo, sin id, sin oferta o con un tipo desconocido: null, no revienta', () {
    expect(ServicioAbierto.fromJson(viaje()..remove('tipo')), isNull);
    expect(ServicioAbierto.fromJson(viaje()..remove('id')), isNull);
    expect(ServicioAbierto.fromJson(viaje()..remove('oferta')), isNull);
    expect(ServicioAbierto.fromJson(viaje()..['tipo'] = 'flete'), isNull);
    expect(ServicioAbierto.fromJson(const {}), isNull);
  });

  test('sin puedeSoltar se asume que NO (soltar a ciegas es lo caro)', () {
    final s = ServicioAbierto.fromJson(viaje()..remove('puedeSoltar'))!;
    expect(s.puedeSoltar, isFalse);
  });
}
