// El Info.plist no lo compila nadie. El analizador no lo mira, las pruebas de
// widgets tampoco, y un desajuste solo se nota en un iPhone de verdad — o en la
// revisión de Apple, que es peor porque tarda una semana en contestar.
//
// Estas comprobaciones existen porque ya pasó: el plist prometía ubicación en
// segundo plano y no declaraba `UIBackgroundModes`, así que iOS suspendía la
// app al minimizarla, el latido de GPS se cortaba y el conductor salía del
// despacho por frescura con el teléfono en el bolsillo. Nada en pantalla lo
// decía.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final plist = File('ios/Runner/Info.plist').readAsStringSync();
  final settings =
      File('lib/shared/services/location_service.dart').readAsStringSync();

  group('ubicación en segundo plano', () {
    test('declara el modo de fondo `location`', () {
      // Sin esto no hay rastreo con la app minimizada, por mucho permiso que
      // conceda el conductor.
      final modos = RegExp(
        r'<key>UIBackgroundModes</key>\s*<array>(.*?)</array>',
        dotAll: true,
      ).firstMatch(plist);
      expect(modos, isNotNull, reason: 'Falta UIBackgroundModes.');
      expect(modos!.group(1), contains('<string>location</string>'));
    });

    test('el flag de CLLocationManager va emparejado con el modo', () {
      // Los dos, o ninguno: `allowBackgroundLocationUpdates` sin el modo
      // declarado hace que iOS LANCE al arrancar el stream, y el conductor no
      // podría ni conectarse. Esta prueba ata las dos mitades, que viven en
      // archivos distintos y por eso se desincronizan.
      final pideFondo = settings.contains('allowBackgroundLocationUpdates: true');
      final declaraModo = plist.contains('<string>location</string>');
      expect(
        pideFondo,
        declaraModo,
        reason: pideFondo
            ? 'El código pide updates en fondo y el plist no declara el modo.'
            : 'El plist declara el modo y nadie lo usa: o sobra, o falta el flag.',
      );
    });

    test('el indicador azul queda visible', () {
      // Es lo que le dice al conductor que se está compartiendo su posición.
      // Ocultarlo sería justo lo que Apple llama rastreo encubierto.
      expect(settings.contains('showBackgroundLocationIndicator: true'), isTrue);
    });
  });

  group('permisos: ni más ni menos', () {
    test('pide «mientras se usa» y NO «siempre»', () {
      // geolocator decide qué diálogo enseña MIRANDO EL PLIST: con la clave de
      // «Siempre» presente pide el permiso más sensible que hay. No nos hace
      // falta —el modo de fondo ya nos da el rastreo con la app minimizada— y
      // pedir de más es motivo de rechazo.
      expect(plist.contains('NSLocationWhenInUseUsageDescription'), isTrue);
      expect(
        plist.contains('<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>'),
        isFalse,
        reason: 'Volver a pedir «Siempre» exige antes una pantalla que lo explique.',
      );
    });

    test('cada permiso declarado dice para qué, en español', () {
      for (final clave in [
        'NSLocationWhenInUseUsageDescription',
        'NSCameraUsageDescription',
        'NSPhotoLibraryUsageDescription',
      ]) {
        final m = RegExp('<key>$clave</key>\\s*<string>([^<]*)</string>')
            .firstMatch(plist);
        expect(m, isNotNull, reason: 'Falta $clave.');
        // Un texto de tres palabras («Para usar el mapa») es de los que Apple
        // devuelve pidiendo que se explique el uso concreto.
        expect(m!.group(1)!.trim().length, greaterThan(40),
            reason: '$clave no explica el uso concreto.');
      }
    });
  });

  test('el aviso de servicio puede despertar la app', () {
    // La app registra `FirebaseMessaging.onBackgroundMessage`; sin este modo
    // iOS jamás lo ejecuta y la oferta de viaje llega muda.
    expect(plist.contains('<string>remote-notification</string>'), isTrue);
  });

  test('declara el cifrado de exportación', () {
    // No rechaza la app, pero sin esto CADA subida a TestFlight se detiene a
    // preguntarlo a mano.
    expect(plist.contains('<key>ITSAppUsesNonExemptEncryption</key>'), isTrue);
  });

  test('no apaga la seguridad de transporte', () {
    // `NSAllowsArbitraryLoads` acepta HTTP plano contra cualquier host.
    expect(plist.contains('NSAllowsArbitraryLoads'), isFalse);
  });
}
