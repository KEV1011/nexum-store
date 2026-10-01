// Las paradas que el pasajero pidió, tal como le llegan al conductor.
//
// Se reportó desde producción: «verifiquemos que cuando se pida un servicio
// las paradas le salgan en el mapa al conductor». No salían — el mapeador se
// quedaba solo con el nombre y tiraba las coordenadas, con un comentario que
// daba eso por bueno («ya las usó el servidor para medir y cobrar»). Sin
// punto no hay marcador posible, así que el conductor leía «Pasa por: Éxito»
// y tenía que adivinar cuál.

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/shared/models/oferta_mapper.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/'
    'trip_request_entity.dart';

Map<String, dynamic> _oferta({List<dynamic>? stops}) => {
      'id': 'trip-1',
      'passenger': {'id': 'u1', 'name': 'Ana'},
      'origin': {'lat': 7.3754, 'lng': -72.6486, 'address': 'Calle 5 # 3-40'},
      'destination': {
        'lat': 7.3800,
        'lng': -72.6400,
        'address': 'Carrera 7 # 2-10',
      },
      'distanceKm': 2.4,
      'estimatedMinutes': 9,
      'estimatedFare': 8500,
      if (stops != null) 'stops': stops,
    };

void main() {
  test('una parada con punto llega DIBUJABLE, no solo con su nombre', () {
    final r = ofertaDeViaje(_oferta(stops: [
      {'name': 'Éxito Pamplona', 'lat': 7.377, 'lng': -72.647, 'order': 0},
    ]));
    expect(r, isNotNull);
    expect(r!.stops, hasLength(1));
    expect(r.stops.first.nombre, 'Éxito Pamplona');
    expect(r.stops.first.tienePunto, isTrue);
    expect(r.stops.first.lat, 7.377);
  });

  test('una parada SIN punto se conserva: se enseña aunque no se pinte', () {
    // «Donde la panadería» es una parada válida que el pasajero escribió a
    // mano. Descartarla dejaría al conductor sin saber que existe; pintarla
    // en un sitio inventado sería peor.
    final r = ofertaDeViaje(_oferta(stops: [
      {'name': 'Donde la panadería', 'order': 0},
    ]));
    expect(r!.stops, hasLength(1));
    expect(r.stops.first.tienePunto, isFalse);
  });

  test('una parada sin nombre se descarta: no se puede ni anunciar', () {
    final r = ofertaDeViaje(_oferta(stops: [
      {'lat': 7.377, 'lng': -72.647, 'order': 0},
      {'name': 'Terminal', 'order': 1},
    ]));
    expect(r!.stops.map((s) => s.nombre), ['Terminal']);
  });

  test('conservan el ORDEN en que llegan: numerarlas mal es pasarse de largo',
      () {
    final r = ofertaDeViaje(_oferta(stops: [
      {'name': 'Primera', 'order': 0},
      {'name': 'Segunda', 'order': 1},
      {'name': 'Tercera', 'order': 2},
    ]));
    expect(r!.stops.map((s) => s.nombre), ['Primera', 'Segunda', 'Tercera']);
  });

  test('sin paradas la lista queda vacía, no nula', () {
    expect(ofertaDeViaje(_oferta())!.stops, isEmpty);
  });

  test('una parada malformada no tumba la oferta entera', () {
    // El conductor perdería la carrera por un dato accesorio.
    final r = ofertaDeViaje(_oferta(stops: ['no soy un objeto', 42]));
    expect(r, isNotNull);
    expect(r!.stops, isEmpty);
  });

  test('copyWith conserva las paradas', () {
    // El mismo descuido que perdió el PIN del envío: refrescar la oferta
    // habría borrado los desvíos que el conductor ya aceptó.
    final r = ofertaDeViaje(_oferta(stops: [
      {'name': 'Éxito', 'lat': 7.377, 'lng': -72.647, 'order': 0},
    ]))!;
    expect(r.copyWith().stops, hasLength(1));
  });

  test('TripStopEntity solo se considera dibujable con las DOS coordenadas',
      () {
    expect(const TripStopEntity(nombre: 'X', lat: 7.3).tienePunto, isFalse);
    expect(const TripStopEntity(nombre: 'X', lng: -72.6).tienePunto, isFalse);
    expect(
      const TripStopEntity(nombre: 'X', lat: 7.3, lng: -72.6).tienePunto,
      isTrue,
    );
  });
}
