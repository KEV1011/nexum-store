// Google Play exige una divulgación destacada dentro de la app ANTES de que
// salte el diálogo del sistema de ubicación. Una regla así no se sostiene
// pidiéndole a nadie que se acuerde: se sostiene dejando un solo sitio por el
// que se puede pedir, y comprobándolo.
//
// Esta prueba LEE el código fuente, que es la única forma de comprobar una
// regla sobre cómo se escribe el código y no sobre lo que hace al ejecutarse.
//
// El barrido aquí SÍ es de `lib/` entera, al revés que el de los iconos: no
// hay deuda histórica que tolerar —los cuatro sitios que llamaban por su
// cuenta están migrados— así que cualquier reaparición es deuda nueva.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// El único archivo autorizado. Si algún día hay dos, la regla ya no existe.
const _puerta = 'lib/core/ubicacion/ubicacion_gate.dart';

void main() {
  test('solo la puerta pide el permiso de ubicación', () {
    final infractores = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      if (f.path.replaceAll(r'\', '/').endsWith(_puerta)) continue;
      final lineas = f.readAsLinesSync();
      for (var i = 0; i < lineas.length; i++) {
        final l = lineas[i];
        if (l.trimLeft().startsWith('//')) continue;
        if (l.contains('Geolocator.requestPermission')) {
          infractores.add('${f.path}:${i + 1}  ${l.trim()}');
        }
      }
    }
    expect(
      infractores,
      isEmpty,
      reason: 'Pide el permiso sin divulgación previa. Usa `Ubicacion.pedir`:\n'
          '${infractores.join('\n')}',
    );
  });

  test('la puerta existe y enseña la divulgación antes de pedir', () {
    // El orden importa: si `requestPermission` estuviera antes que la
    // divulgación, la hoja saldría DESPUÉS del diálogo del sistema y no
    // serviría de nada.
    //
    // Se cuentan solo las líneas de CÓDIGO. La primera versión buscaba sobre
    // el archivo entero y fallaba por su propia culpa: el comentario de
    // cabecera nombra `Geolocator.requestPermission()` al explicar de dónde
    // viene el arreglo, y esa mención salía antes que la llamada real.
    int? iDivulgacion;
    int? iPeticion;
    final lineas = File(_puerta).readAsLinesSync();
    for (var i = 0; i < lineas.length; i++) {
      final l = lineas[i];
      if (l.trimLeft().startsWith('//')) continue;
      if (iDivulgacion == null && l.contains('_divulgacion(context)')) {
        iDivulgacion = i;
      }
      if (iPeticion == null && l.contains('Geolocator.requestPermission')) {
        iPeticion = i;
      }
    }
    expect(iDivulgacion, isNotNull, reason: 'No se enseña la divulgación.');
    expect(iPeticion, isNotNull, reason: 'La puerta no pide nada.');
    expect(iPeticion!, greaterThan(iDivulgacion!),
        reason: 'La divulgación tiene que ir ANTES de pedir el permiso.');
  });

  test('la divulgación dice las cuatro cosas que Play exige', () {
    // Qué se recoge, para qué, con quién se comparte y cuándo deja de
    // recogerse. Falta una y la divulgación no cumple, por muy bonita que sea.
    final fuente = File(_puerta).readAsStringSync().toLowerCase();
    expect(fuente, contains('ubicación precisa'));
    expect(fuente, contains('sirve para'));
    expect(fuente, contains('servidores de zipa'));
    expect(fuente, contains('deja de recogerse'));
  });

  test('«ahora no» no acaba pidiendo el permiso igual', () {
    // Insistir después de un no gasta el único intento que da Android antes
    // del «no volver a preguntar», y deja al usuario sin vuelta atrás.
    final fuente = File(_puerta).readAsStringSync();
    expect(fuente, contains('if (sigue != true) return false;'));
  });
}
