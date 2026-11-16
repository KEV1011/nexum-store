/// Con qué arranca Firebase en iPhone (`opciones_firebase.dart`).
///
/// En iOS los datos llegan por `--dart-define` desde el workflow. Lo que no
/// puede pasar: arrancar a medias con un dato de menos (el error saldría al
/// pedir el token, lejos de su causa) o tocar Android, que se configura solo.
library;

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/core/services/opciones_firebase.dart';

void main() {
  test('con los cuatro datos, opciones completas', () {
    final o = opcionesFirebaseIos(
      apiKey: ' AIza-x ',
      appId: '1:1:ios:1',
      senderId: '1',
      projectId: 'zipa',
      bundleId: 'com.zipa.app',
    );
    expect(o, isNotNull);
    expect(o!.apiKey, 'AIza-x');
    expect(o.iosBundleId, 'com.zipa.app');
  });

  test('con un dato de menos, nada (se arranca como antes, sin avisos)', () {
    expect(
      opcionesFirebaseIos(apiKey: '', appId: 'a', senderId: 's', projectId: 'p'),
      isNull,
    );
    expect(
      opcionesFirebaseIos(apiKey: 'k', appId: 'a', senderId: '  ', projectId: 'p'),
      isNull,
    );
  });

  test('en Android no se pasa nada: lo resuelve google-services.json', () {
    expect(opcionesFirebase(), isNull);
  });

  test('en iPhone, compilado sin los datos, tampoco', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    expect(opcionesFirebase(), isNull);
  });

  test('las dos apps llevan EXACTAMENTE el mismo fichero', () {
    // Si cae, no se edita la prueba: se copia el fichero al otro lado.
    final aqui = File('lib/core/services/opciones_firebase.dart');
    final alla = File('../AppTransport/lib/shared/services/opciones_firebase.dart');
    expect(aqui.existsSync(), isTrue);
    expect(alla.existsSync(), isTrue, reason: 'falta la copia de la otra app');
    expect(alla.readAsStringSync(), aqui.readAsStringSync());
  });
}
