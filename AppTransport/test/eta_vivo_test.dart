import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:nexum_driver/core/utils/eta_vivo.dart';

/// El ETA en vivo.
///
/// Lo que se prueba no es la precisión del minuto —es una estimación— sino que
/// el número SE MUEVA cuando el conductor se mueve, que era el fallo: el ETA se
/// calculaba al reservar y se quedaba congelado, así que decía «9 min» tanto
/// cuando el conductor arrancaba como cuando ya estaba doblando la esquina.
void main() {
  // Pamplona: parque principal → terminal, unos 2 km.
  const origen = LatLng(7.3754, -72.6486);
  const destino = LatLng(7.3921, -72.6602);
  const mitad = LatLng(7.3838, -72.6544);

  group('con el pasajero a bordo', () {
    test('acercarse al destino BAJA el ETA', () {
      final lejos = etaEnVivoMin(
        conductor: origen, destino: destino, aBordo: true,
        etaTotalMin: 9, distanciaTotalKm: 2.9,
      );
      final cerca = etaEnVivoMin(
        conductor: mitad, destino: destino, aBordo: true,
        etaTotalMin: 9, distanciaTotalKm: 2.9,
      );
      expect(lejos, isNotNull);
      expect(cerca, isNotNull);
      expect(cerca!, lessThan(lejos!));
    });

    test('pegado al destino da el mínimo, nunca 0', () {
      final eta = etaEnVivoMin(
        conductor: destino, destino: destino, aBordo: true,
        etaTotalMin: 9, distanciaTotalKm: 2.9,
      );
      // Un 0 en pantalla se lee como «ya llegó» y hace salir a la calle.
      expect(eta, 1);
    });

    test('no supera el ETA total aunque el conductor se aleje', () {
      // Si se pasa de largo, la fracción se topa en 1: enseñar 40 min cuando el
      // servidor dijo 9 sería alarmar por un rodeo de dos calles.
      final eta = etaEnVivoMin(
        conductor: const LatLng(7.30, -72.80), destino: destino, aBordo: true,
        etaTotalMin: 9, distanciaTotalKm: 2.9,
      );
      expect(eta, lessThanOrEqualTo(9));
    });

    test('hereda la medición del servidor: doble ETA, doble espera', () {
      // No hay velocidad propia en este camino: el resultado escala con el ETA
      // que dio el servidor, así que si allí se activa la ruta real de Google,
      // esto la hereda sin tocar nada.
      final a = etaEnVivoMin(
        conductor: mitad, destino: destino, aBordo: true,
        etaTotalMin: 10, distanciaTotalKm: 2.9,
      )!;
      final b = etaEnVivoMin(
        conductor: mitad, destino: destino, aBordo: true,
        etaTotalMin: 20, distanciaTotalKm: 2.9,
      )!;
      expect(b, greaterThan(a));
    });
  });

  group('de camino a recoger', () {
    test('acercarse al pasajero BAJA el ETA', () {
      final lejos = etaEnVivoMin(
        conductor: destino, destino: origen, aBordo: false,
      );
      final cerca = etaEnVivoMin(
        conductor: mitad, destino: origen, aBordo: false,
      );
      expect(cerca!, lessThan(lejos!));
    });

    test('no necesita los datos del servidor', () {
      // Ese tramo no está en la distancia del viaje (origen→destino), así que
      // tiene que salir adelante sin ellos.
      expect(
        etaEnVivoMin(conductor: destino, destino: origen, aBordo: false),
        isNotNull,
      );
    });
  });

  group('cuando no se puede saber', () {
    test('sin posición del conductor devuelve null', () {
      expect(
        etaEnVivoMin(conductor: null, destino: destino, aBordo: true),
        isNull,
      );
    });

    test('sin objetivo devuelve null', () {
      expect(
        etaEnVivoMin(conductor: origen, destino: null, aBordo: true),
        isNull,
      );
    });

    test('a bordo pero sin distancia del servidor, cae a la velocidad', () {
      // No devuelve null: la velocidad de referencia siempre puede responder.
      final eta = etaEnVivoMin(
        conductor: origen, destino: destino, aBordo: true,
        etaTotalMin: 9, distanciaTotalKm: null,
      );
      expect(eta, isNotNull);
      expect(eta!, greaterThan(0));
    });
  });

  test('las dos apps llevan EXACTAMENTE el mismo cálculo', () {
    // Desde esta tanda el conductor también usa este archivo: su ETA era un
    // contador a ciegas que bajaba un segundo por segundo aunque estuviera
    // parado en un semáforo. No hay paquete compartido, así que el fichero
    // está duplicado — y si las dos copias se separaran, la app del pasajero
    // diría tres minutos y la del conductor diez para el MISMO viaje, que es
    // una discusión en la puerta del carro que nadie puede arbitrar.
    //
    // Se comparan BYTE A BYTE: este archivo no importa nada del paquete
    // propio, así que las dos copias son idénticas sin normalizar nada. Si
    // esta prueba cae, la respuesta no es editarla: es copiar el fichero al
    // otro lado. El mismo test corre en las dos apps y busca la otra copia a
    // los dos lados, para no tener una versión por app.
    const rel = 'lib/core/utils/eta_vivo.dart';
    final aqui = File(rel);
    final alla = [File('../AppTransport/$rel'), File('../AppCliente/$rel')]
        .firstWhere(
      (f) => f.existsSync() && f.absolute.path != aqui.absolute.path,
      orElse: () => File('no-existe'),
    );
    expect(aqui.existsSync(), isTrue);
    expect(alla.existsSync(), isTrue, reason: 'falta la copia de la otra app');
    expect(
      alla.readAsStringSync(),
      aqui.readAsStringSync(),
      reason: 'los dos ETA se separaron: copia el fichero al otro lado',
    );
  });
}
