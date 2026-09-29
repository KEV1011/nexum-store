// El AndroidManifest no lo compila nadie: ni el analizador ni las pruebas lo
// miran, y un atributo de más solo se nota en el teléfono de un usuario. Estas
// comprobaciones existen porque ya pasó una vez.
//
// `android:taskAffinity=""` estuvo puesto en las dos apps. Una actividad sin
// afinidad no pertenece a la tarea de su propio paquete, así que al volver
// desde el lanzador Android no encuentra la tarea que dejaste y arranca una
// instancia nueva: la app parece haberse cerrado sola. Eso era exactamente lo
// que le pasaba al pasajero que salía a otra app con un viaje en curso.

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
    // Sin esto, subir el tamaño de letra o el zoom de pantalla del sistema
    // mata y recrea la actividad, y el pasajero pierde lo que tuviera abierto.
    final config = RegExp(r'android:configChanges="([^"]+)"').firstMatch(manifiesto);
    expect(config, isNotNull, reason: 'La actividad debe declarar configChanges.');
    final valores = config!.group(1)!;
    for (final necesario in ['fontScale', 'density', 'screenSize', 'screenLayout']) {
      expect(valores.contains(necesario), isTrue, reason: 'Falta $necesario.');
    }
  });
  // ── ID de publicidad ───────────────────────────────────────────────────
  //
  // En Play se declara que la app NO usa ID de publicidad, y es cierto: no
  // hay un solo SDK publicitario. Pero esa declaración se comprueba contra
  // el APK, no contra lo que uno escribe en el formulario, y el manifiesto
  // de cualquier librería puede traer `AD_ID` y colarlo en la fusión sin
  // que nadie lo vea. Play detecta el desajuste y RECHAZA la versión.
  //
  // La línea `tools:node="remove"` hace que el «No» sea cierto por
  // construcción. Si alguien la quita, la declaración pasa a ser falsa en
  // silencio: de ahí esta prueba.
  test('el permiso de ID de publicidad se retira de la fusión', () {
    expect(
      manifiesto.contains('com.google.android.gms.permission.AD_ID'),
      isTrue,
      reason: 'Debe estar declarado para poder retirarlo con tools:node.',
    );
    final bloque = RegExp(
      r'<uses-permission[^>]*com\.google\.android\.gms\.permission\.AD_ID[^>]*>',
      dotAll: true,
    ).firstMatch(manifiesto);
    expect(bloque, isNotNull);
    expect(
      bloque!.group(0)!.contains('tools:node="remove"'),
      isTrue,
      reason: 'Sin tools:node="remove" el permiso entra en el APK y Play '
          'rechaza la version por declarar que no se usa ID de publicidad.',
    );
  });

  test('el espacio de nombres tools esta declarado', () {
    // Sin el xmlns, `tools:node` es un atributo desconocido y el fusionador
    // lo ignora: el permiso se colaria igual y la prueba de arriba pasaria.
    expect(
      manifiesto.contains('xmlns:tools="http://schemas.android.com/tools"'),
      isTrue,
    );
  });
}
