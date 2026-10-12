/// El historial de ganancias guardado en el teléfono.
///
/// LA CUARTA VEZ QUE APARECE EL MISMO DEFECTO, y aquí lo que se pierde es
/// dinero a la vista: `_load()` leía la caché con un `map` sobre la lista
/// entera, y FUERA del `try` de arriba —que solo cubre la llamada al
/// backend—. Un solo viaje guardado que no se pudiera leer hacía lanzar al
/// método y el conductor se quedaba **sin ningún historial de ganancias**,
/// sin error en pantalla y sin nada en los registros.
///
/// Y es el caso realista, no el raro: esta caché la escribió una versión
/// ANTERIOR de la app con su propio `toJson`, así que basta con que el parser
/// pase a exigir un campo que entonces no se guardaba. La rama del servidor
/// (`_tripFromApi`) ya era tolerante campo a campo; esta era la que no.
///
/// De paso se fija que el tipo de servicio sobreviva al guardado: `toJson` no
/// lo escribía, así que el historial sin conexión decía «Servicio» en cada
/// línea y los chips de filtro no casaban con nada.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/features/trip_history/presentation/providers/trip_history_provider.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Un viaje con lo que `fromJson` exige, en el formato con el que la propia
/// app lo guardó.
Map<String, dynamic> viaje(String id, {String? servicio}) => {
      'id': id,
      if (servicio != null) 'serviceType': servicio,
      'passenger_id': 'u-$id',
      'passenger_name': 'Pasajero',
      'origin': <String, dynamic>{
        'latitude': 7.3754,
        'longitude': -72.6486,
        'address': 'Calle 5 # 3-40',
      },
      'destination': <String, dynamic>{
        'latitude': 7.38,
        'longitude': -72.65,
        'address': 'Carrera 4A # 10-53',
      },
      'distance_km': 3.2,
      'duration_minutes': 12,
      'gross_fare': 8500,
      'net_earning': 7225,
      'commission': 1275,
      'started_at': '2026-10-11T15:00:00.000Z',
      'finished_at': '2026-10-11T15:12:00.000Z',
    };

/// Carga el historial con [cache] guardada. El backend no responde en las
/// pruebas (el binding de Flutter contesta 400 a todo), así que `_load()`
/// cae a la caché, que es justo la rama que se mide.
Future<List<TripModel>> cargado(List<Object> cache) async {
  SharedPreferences.setMockInitialValues({
    'nexum_trip_history_v1':
        cache.map((e) => e is String ? e : jsonEncode(e)).toList(),
  });
  final n = TripHistoryNotifier();
  // `refresh()` devuelve el mismo `_load()` del constructor; es la única
  // forma de esperarlo, y leer dos veces la caché da lo mismo.
  await n.refresh();
  final viajes = n.state;
  n.dispose();
  return viajes;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('el historial guardado se lee viaje a viaje', () {
    test('los que están bien se cargan', () async {
      final v = await cargado([viaje('a'), viaje('b')]);
      expect(v.map((t) => t.id), ['a', 'b']);
      expect(v.first.netEarning, 7225);
    });

    test('UN viaje ilegible no borra el historial entero', () async {
      // La comprobación que justifica el fichero: antes esto dejaba la lista
      // en cero y el conductor creía no haber ganado nada.
      final roto = viaje('malo')..remove('gross_fare');
      final v = await cargado([viaje('a'), roto, viaje('b')]);
      expect(
        v.map((t) => t.id),
        ['a', 'b'],
        reason: 'se pierde el viaje ilegible, no las ganancias de los demás',
      );
    });

    test('una entrada que ni siquiera es JSON tampoco lo borra', () async {
      final v = await cargado(['no es json', viaje('ok')]);
      expect(v.map((t) => t.id), ['ok']);
    });

    test('un viaje sin ubicación legible se descarta solo él', () async {
      // `LocationModel.fromJson` exige latitud, longitud y dirección: es
      // exactamente el campo que una versión anterior podía no guardar.
      final roto = viaje('malo')
        ..['origin'] = <String, dynamic>{'latitude': 7.3, 'longitude': -72.6};
      expect((await cargado([roto, viaje('ok')])).map((t) => t.id), ['ok']);
    });

    test('sin nada guardado, historial vacío y sin viajes de demo', () async {
      expect(await cargado([]), isEmpty);
    });

    test('los viajes semilla de versiones viejas se purgan', () async {
      final v = await cargado([viaje('seed-001'), viaje('real')]);
      expect(v.map((t) => t.id), ['real']);
    });

    test('la purga de semillas no se lleva un viaje real por delante',
        () async {
      // «seed» tiene que ir al principio: un id que la contenga en medio es
      // un viaje de verdad.
      expect(
        (await cargado([viaje('abc-seed-9')])).map((t) => t.id),
        ['abc-seed-9'],
      );
    });
  });

  group('el tipo de servicio sobrevive al guardado', () {
    test('ida y vuelta por el JSON de la caché', () {
      final t = TripModel(
        id: 'x',
        serviceType: 'FLETE',
        passengerId: 'u',
        passengerName: 'Pasajero',
        origin: const LocationModel(
          latitude: 7.3,
          longitude: -72.6,
          address: 'a',
        ),
        destination: const LocationModel(
          latitude: 7.4,
          longitude: -72.7,
          address: 'b',
        ),
        distanceKm: 1,
        durationMinutes: 5,
        grossFare: 10000,
        netEarning: 8500,
        commission: 1500,
        startedAt: DateTime.utc(2026, 10, 11, 15),
        finishedAt: DateTime.utc(2026, 10, 11, 15, 5),
      );
      // Sin la clave en `toJson`, esto vuelve en null y el historial sin
      // conexión pinta «Servicio» en vez de «Flete de carga».
      expect(TripModel.fromJson(t.toJson()).serviceType, 'FLETE');
    });

    test('se lee de la caché del teléfono', () async {
      final v = await cargado([viaje('t', servicio: 'TAXI')]);
      expect(v.single.serviceType, 'TAXI');
    });

    test('un viaje guardado por una versión que no lo escribía sigue valiendo',
        () async {
      // Compatibilidad: sin el campo el historial dice lo único que sabe, y
      // eso es correcto; lo que no puede es dejar de cargarse.
      final v = await cargado([viaje('viejo')]);
      expect(v.single.serviceType, isNull);
      expect(v.single.id, 'viejo');
    });
  });
}
