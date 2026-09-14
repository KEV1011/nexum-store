// Igual que `manifest_android_test.dart`, pero para el plist: nadie lo compila
// y un desajuste solo aparece en un iPhone real o en la revisión de Apple.
//
// La que motiva el archivo: esta app llevaba `NSAllowsArbitraryLoads`, que
// apaga la seguridad de transporte para TODOS los hosts. Que era un descuido y
// no una decisión se veía solo — la app del conductor no lo tenía, y el Android
// de este mismo repositorio hace lo contrario.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';


/// El plist sin sus comentarios.
///
/// Buscar sobre el texto crudo hace que la prueba cuente lo que EXPLICAN los
/// comentarios. Pasó: el plist del cliente documenta por qué se retiró
/// `NSAllowsArbitraryLoads`, y esa mención hizo fallar la comprobación de que
/// no está. Un comentario que describe el peligro no es el peligro.
String _sinComentarios(String plist) =>
    plist.replaceAll(RegExp(r'<!--.*?-->', dotAll: true), '');

void main() {
  final plist =
      _sinComentarios(File('ios/Runner/Info.plist').readAsStringSync());

  test('la seguridad de transporte queda activa', () {
    expect(
      plist.contains('NSAllowsArbitraryLoads'),
      isFalse,
      reason: 'Aceptaría HTTP plano contra cualquier servidor.',
    );
  });

  test('el desarrollo local sigue funcionando sin abrir internet entera', () {
    expect(plist.contains('<key>NSAllowsLocalNetworking</key>'), isTrue);
  });

  test('el cliente NO declara el modo de fondo de ubicación', () {
    // No rastrea nada con la app cerrada, y declarar un modo que no se usa es
    // de lo primero que Apple pregunta. Esto es lo contrario de la app del
    // conductor, donde ese modo es obligatorio: la asimetría es a propósito.
    final modos = RegExp(
      r'<key>UIBackgroundModes</key>\s*<array>(.*?)</array>',
      dotAll: true,
    ).firstMatch(plist);
    expect(modos, isNotNull);
    expect(modos!.group(1), isNot(contains('<string>location</string>')));
  });

  test('pero sí puede despertar con un aviso', () {
    // Registra `FirebaseMessaging.onBackgroundMessage`; sin este modo iOS no
    // lo ejecuta nunca y «tu conductor llegó» no abre nada.
    expect(plist.contains('<string>remote-notification</string>'), isTrue);
  });

  test('declara el cifrado de exportación', () {
    expect(plist.contains('<key>ITSAppUsesNonExemptEncryption</key>'), isTrue);
  });

  test('cada permiso declarado dice para qué, en español', () {
    for (final clave in [
      'NSLocationWhenInUseUsageDescription',
      'NSCameraUsageDescription',
      'NSPhotoLibraryUsageDescription',
    ]) {
      final m =
          RegExp('<key>$clave</key>\\s*<string>([^<]*)</string>').firstMatch(plist);
      expect(m, isNotNull, reason: 'Falta $clave.');
      expect(m!.group(1)!.trim().length, greaterThan(40),
          reason: '$clave no explica el uso concreto.');
    }
  });
}
