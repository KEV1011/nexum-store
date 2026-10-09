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

  // ─── Las dos que ya costaron caro y no las vigilaba nadie ──────────────

  test('NO se declara ACCESS_BACKGROUND_LOCATION', () {
    // Es de las causas más comunes de rechazo en Play: declararlo obliga a
    // pasar el formulario de declaración de permisos, a grabar un video
    // demostrativo y a tener la pantalla de divulgación previa. Esta app NO lo
    // necesita —el rastreo vive en un foreground service de tipo `location`,
    // que desde Android 10 puede leer la ubicación con el permiso «mientras se
    // usa»— y el permiso se retiró a propósito antes de la primera subida.
    //
    // Sin esta comprobación, cualquier plugin nuevo que lo traiga en SU
    // manifiesto entra por la fusión sin que nadie se entere. Por eso se mira
    // también que, si llega, se retire con `tools:node="remove"`.
    //
    // SE MIRA EL XML SIN COMENTARIOS, y esto no es un detalle: la primera
    // versión de esta prueba FALLABA en la app del conductor, porque su
    // manifiesto NOMBRA el permiso en el comentario largo que explica por qué
    // no lo declara. Comprobado ejecutándola. Es la misma trampa que hace pasar
    // una guarda que encuentra la línea del `import` en vez del uso.
    final xml = _sinComentarios(manifiesto);
    final declarado = xml.contains('ACCESS_BACKGROUND_LOCATION') &&
        !RegExp(r'ACCESS_BACKGROUND_LOCATION[^>]*tools:node="remove"',
                dotAll: true)
            .hasMatch(xml);
    expect(
      declarado,
      isFalse,
      reason: 'Declararlo exige el formulario de Play y un video. Si de verdad '
          'hace falta, hay que añadir ADEMÁS la pantalla de divulgación previa '
          'antes de pedirlo. Ver el comentario largo del manifiesto.',
    );
  });

  test('no se declara ningún componente cuya clase no exista', () {
    // ESTO YA ROMPIÓ LA APP. Había un `<receiver android:name=".BootReceiver">`
    // escuchando BOOT_COMPLETED y MY_PACKAGE_REPLACED, y la clase no existía:
    // Android intentaba instanciarla al encender el teléfono y JUSTO DESPUÉS DE
    // CADA ACTUALIZACIÓN desde Play. Lo primero que veía un tester al
    // actualizar era «ZIPA Conductor se detuvo».
    //
    // Se comprueban solo los nombres RELATIVOS (los que empiezan por punto),
    // que son los del propio paquete: `com.google.…` y los de los plugins
    // vienen de sus propios manifiestos y no están en `kotlin/`.
    final kotlin = Directory('android/app/src/main/kotlin');
    final clases = <String>{};
    if (kotlin.existsSync()) {
      for (final f in kotlin.listSync(recursive: true)) {
        if (f is File && f.path.endsWith('.kt')) {
          clases.add(f.uri.pathSegments.last.replaceAll('.kt', ''));
        }
      }
    }

    final fantasmas = <String>[];
    for (final m in RegExp(r'android:name="\.([A-Za-z0-9_.]+)"')
        .allMatches(_sinComentarios(manifiesto))) {
      final nombre = m.group(1)!.split('.').last;
      if (!clases.contains(nombre)) fantasmas.add('.${m.group(1)}');
    }

    expect(
      fantasmas,
      isEmpty,
      reason: 'Declarados en el manifiesto pero sin clase en kotlin/. Android '
          'los instancia al arrancar o al actualizar y la app se cae con '
          'ClassNotFoundException: ${fantasmas.join(', ')}',
    );
  });
}

/// El manifiesto sin sus comentarios.
///
/// Hace falta: este archivo explica en comentarios LARGOS qué componentes se
/// retiraron y por qué, nombrándolos. Sin quitarlos, la prueba encontraría
/// `.BootReceiver` dentro del comentario que documenta su eliminación y
/// fallaría acusando justo al arreglo.
String _sinComentarios(String xml) =>
    xml.replaceAll(RegExp(r'<!--.*?-->', dotAll: true), '');
