import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/'
    'passenger_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/'
    'trip_request_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

const _pasajero = PassengerEntity(
  id: 'u1',
  name: 'Ana',
  rating: null,
  totalTrips: 0,
  photoUrl: '',
);

const _punto = LocationModel(
  latitude: 7.3754,
  longitude: -72.6486,
  address: 'Cra. 6',
);

TripRequestEntity _oferta({String? metodo, String? nota}) => TripRequestEntity(
      id: 't1',
      passenger: _pasajero,
      origin: _punto,
      destination: _punto,
      distanceKm: 2.7,
      durationMinutes: 9,
      estimatedFare: 7000,
      distanceToPickupKm: 0.4,
      etaToPickupMinutes: 2,
      paymentMethod: metodo,
      paymentNote: nota,
    );

void main() {
  group('avisoDePago', () {
    test('el efectivo no aclara nada: es lo que el conductor ya espera', () {
      expect(_oferta(metodo: 'efectivo').avisoDePago, isNull);
      expect(_oferta().avisoDePago, isNull);
    });

    test('cada billetera dice CUÁL es, para abrir la app correcta', () {
      expect(_oferta(metodo: 'nequi').avisoDePago, contains('Nequi'));
      expect(_oferta(metodo: 'daviplata').avisoDePago, contains('Daviplata'));
      expect(
        _oferta(metodo: 'bancolombia').avisoDePago,
        contains('Bancolombia'),
      );
    });

    test('SOLO el pago en línea dice que ya está pagado', () {
      // Si una transferencia dijera "ya pagado", el conductor dejaría bajarse
      // al pasajero sin cobrarle. Es el error que cuesta dinero.
      for (final m in ['efectivo', 'nequi', 'daviplata', 'bancolombia',
        'transferencia']) {
        expect(
          _oferta(metodo: m).avisoDePago?.toLowerCase() ?? '',
          isNot(contains('pagado')),
          reason: 'El método "$m" no está pagado por adelantado.',
        );
      }
      expect(_oferta(metodo: 'en_linea').avisoDePago, contains('Ya pagado'));
    });

    test('manda el texto del servidor sobre la tabla local', () {
      // Así, un método nuevo en el backend se lee bien en una app vieja.
      final o = _oferta(metodo: 'movii', nota: 'Te paga por Movii');
      expect(o.avisoDePago, 'Te paga por Movii');
    });

    test('un método desconocido sin texto del servidor no inventa nada', () {
      expect(_oferta(metodo: 'bitcoin').avisoDePago, isNull);
    });
  });
}
