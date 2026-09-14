// El AndroidManifest no lo compila nadie: ni el analizador ni las pruebas lo
// miran, y un atributo de más solo se nota en el teléfono de un usuario. Estas
// comprobaciones existen porque ya pasó una vez.
//
// `android:taskAffinity=""` estuvo puesto en las dos apps. Una actividad sin
// afinidad no pertenece a la tarea de su propio paquete, así que al volver
// desde el lanzador Android no encuentra la tarea que dejaste y arranca una
// instancia nueva: la app parece haberse cerrado sola. En el conductor eso es
// peor todavía — vuelve al inicio con un viaje en curso.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  final manifiesto =
      File('android/app/src/main/AndroidManifest.xml').readAsStringSync();

  test('la actividad NO declara taskAffinity vacío', () {
    expect(
      manifiesto.contains('taskAffinity=""'),
      isFalse,
      reason: 'Sin afinidad, volver desde el lanzador arranca la app de cero.',
    );
  });

  test('la app pide montón grande: el mapa es lo que más memoria consume', () {
    expect(manifiesto.contains('android:largeHeap="true"'), isTrue);
  });

  test('los cambios de letra y densidad no recrean la actividad', () {
    final config =
        RegExp(r'android:configChanges="([^"]+)"').firstMatch(manifiesto);
    expect(config, isNotNull, reason: 'La actividad debe declarar configChanges.');
    final valores = config!.group(1)!;
    for (final necesario in ['fontScale', 'density', 'screenSize', 'screenLayout']) {
      expect(valores.contains(necesario), isTrue, reason: 'Falta $necesario.');
    }
  });
}
