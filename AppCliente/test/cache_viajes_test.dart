/// Los viajes guardados en el teléfono, y el arranque que depende de ellos.
///
/// LO QUE SE PROTEGE AQUÍ NO ES UN VIAJE, ES EL ARRANQUE. `_load()` leía la
/// caché con un `map` suelto: un solo viaje que no se pudiera parsear hacía
/// lanzar al método, y entonces no se actualizaba el estado NI se llamaba a
/// `_avisarCargado()`. Ese `Completer` es el que espera el arranque de la app
/// para saber si devolver al pasajero a su viaje — sin completarse, la app se
/// queda en el splash. Para siempre.
///
/// El propio comentario de `_avisarCargado` advertía de ese daño y cubría el
/// caso de que el provider muriera; faltaba el de un viaje ilegible. Y es el
/// realista: esta caché la escribió una versión ANTERIOR de la app, así que
/// basta con que el parser pase a exigir un campo que entonces no se
/// guardaba.
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/transport/presentation/providers/transport_provider.dart';
import 'package:nexum_client/shared/services/transport_ws_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Un viaje con lo mínimo que `fromJson` exige, ya terminado para que la
/// carga no intente reanudar ningún seguimiento.
Map<String, dynamic> viaje(String id) => {
      'id': id,
      'requestRef': 'NX-$id',
      'serviceType': 'transporte',
      'originAddress': 'Calle 5 # 3-40',
      'destinationAddress': 'Carrera 4 # 10-53',
      'estimatedFare': 8500,
      'distanceKm': 3.2,
      'etaMinutes': 12,
      'status': 'completed',
      'createdAt': '2026-10-11T15:00:00.000Z',
    };

Future<List<String>> idsCargados(List<Object> cache) async {
  SharedPreferences.setMockInitialValues({
    'nexum_transport_v1': cache.map(jsonEncode).toList(),
  });
  final n = TransportNotifier(Dio(), TransportWsService());
  await n.cargado;
  final ids = n.state.requests.map((r) => r.id).toList();
  n.dispose();
  return ids;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('cargar los viajes guardados', () {
    test('se leen los que están bien', () async {
      expect(await idsCargados([viaje('a'), viaje('b')]), ['a', 'b']);
    });

    test('UN viaje ilegible no deja la app en el splash', () async {
      // La comprobación que justifica el fichero. Que `cargado` se complete
      // es la mitad que importa: sin eso el arranque espera para siempre.
      final roto = viaje('malo')..remove('estimatedFare');
      final ids = await idsCargados([viaje('a'), roto, viaje('b')]);
      expect(ids, ['a', 'b'], reason: 'se pierde el ilegible, no el arranque');
    });

    test('una entrada que ni siquiera es JSON tampoco lo deja colgado',
        () async {
      SharedPreferences.setMockInitialValues({
        'nexum_transport_v1': ['no es json', jsonEncode(viaje('ok'))],
      });
      final n = TransportNotifier(Dio(), TransportWsService());
      await n.cargado;
      expect(n.state.requests.map((r) => r.id), ['ok']);
      expect(n.state.isLoading, isFalse);
      n.dispose();
    });

    test('sin nada guardado, arranca igual y sin viajes', () async {
      expect(await idsCargados([]), isEmpty);
    });

    test('un estado que esta versión no conoce no descarta el viaje', () async {
      // Lo cubre el `orElse` del parser; se fija para que no se quite.
      final futuro = viaje('x')..['status'] = 'un_estado_del_futuro';
      expect(await idsCargados([futuro]), ['x']);
    });

    test('los alias del backend se entienden', () async {
      // El backend llama «taxi» y «particular» a lo que la app llama
      // «transporte», y «mandado» viaja como envío. Si eso se rompiera, los
      // viajes seguirían cargando pero en la pestaña equivocada.
      final taxi = viaje('t')..['serviceType'] = 'taxi';
      final mandado = viaje('m')..['serviceType'] = 'mandado';
      expect(await idsCargados([taxi, mandado]), ['t', 'm']);
    });
  });
}
