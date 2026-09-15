import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Ninguna copia puede perder un campo por el camino.
///
/// El bug que motiva esta prueba ya pasó, y costó caro: `copyWith` de un
/// pedido no pasaba `deliveryPin` al constructor, así que la primera
/// actualización en vivo lo ponía en null. El repartidor pedía un PIN que el
/// cliente ya no veía en su pantalla, y **el envío no se podía cerrar**.
///
/// No lo caza nada más. El compilador calla porque todos los parámetros son
/// opcionales con nombre; el linter también; y en la app solo se nota cuando
/// alguien intenta entregar. Es el fallo perfecto: silencioso hasta que hay un
/// cliente y un repartidor en la calle discutiendo.
///
/// La regla NO es «todo campo debe ser un parámetro de copyWith» —una copia
/// parcial es legítima: hay campos que nunca cambian, como el id—. La regla es
/// que **el constructor de dentro debe recibir algo para cada campo**, sea
/// `x: x ?? this.x` o `x: id`. Si un campo no aparece ahí, la copia lo pone al
/// valor por defecto sin avisar.
///
/// Se analiza el texto fuente porque Dart no tiene reflexión en las pruebas.
/// Ojo con eso: `copyWith({...}) { ... }` tiene DOS bloques de llaves —la lista
/// de parámetros y el cuerpo—. Agarrar el primero da 35 falsos positivos de 35
/// clases, que fue exactamente lo que pasó al escribir esto.
void main() {
  group('copyWith no pierde campos', () {
    late final List<_Clase> clases;

    setUpAll(() => clases = _clasesConCopyWith(Directory('lib')));

    test('hay clases que revisar (si no, la prueba no prueba nada)', () {
      expect(clases, isNotEmpty, reason: 'no encontré ninguna clase con copyWith en lib/');
    });

    test('cada copyWith construye con TODOS los campos de su clase', () {
      final fallos = <String>[];
      for (final c in clases) {
        final faltan = c.campos.difference(c.camposConstruidos).toList()..sort();
        if (faltan.isNotEmpty) {
          fallos.add('${c.nombre} (${c.fichero}) no pasa: ${faltan.join(", ")}');
        }
      }
      expect(
        fallos,
        isEmpty,
        reason: 'Estas copias dejarían el campo en su valor por defecto:\n'
            '  ${fallos.join("\n  ")}',
      );
    });
  });
}

class _Clase {
  _Clase(this.nombre, this.fichero, this.campos, this.camposConstruidos);

  final String nombre;
  final String fichero;

  /// Campos `final` declarados en la clase.
  final Set<String> campos;

  /// Nombres que el cuerpo de copyWith pasa como argumento con nombre.
  final Set<String> camposConstruidos;
}

final _declaraClase = RegExp(r'^class\s+(\w+)', multiLine: true);
final _campoFinal = RegExp(r'^\s{2}final\s+[\w<>,\s?]+?\s+(\w+)\s*;', multiLine: true);
final _firmaCopyWith = RegExp(r'\b\w+\s+copyWith\s*\(');
final _argConNombre = RegExp(r'(\w+)\s*:');

/// Índice del carácter que cierra el bloque abierto en [desde].
int _cierra(String s, int desde, String abre, String cierra) {
  var prof = 0;
  for (var i = desde; i < s.length; i++) {
    if (s[i] == abre) {
      prof++;
    } else if (s[i] == cierra) {
      prof--;
      if (prof == 0) return i;
    }
  }
  return s.length - 1;
}

/// El cuerpo real de copyWith, saltándose la lista de parámetros.
/// Admite las dos formas: `{ return X(...); }` y `=> X(...);`.
String? _cuerpoDeCopyWith(String cuerpoClase) {
  final m = _firmaCopyWith.firstMatch(cuerpoClase);
  if (m == null) return null;
  final finParams = _cierra(cuerpoClase, m.end - 1, '(', ')');
  final resto = cuerpoClase.substring(finParams);
  final flecha = resto.indexOf('=>');
  final llave = resto.indexOf('{');
  if (flecha != -1 && (llave == -1 || flecha < llave)) {
    final fin = resto.indexOf(';', flecha);
    return resto.substring(flecha, fin == -1 ? resto.length : fin);
  }
  if (llave == -1) return null;
  return resto.substring(llave, _cierra(resto, llave, '{', '}') + 1);
}

List<_Clase> _clasesConCopyWith(Directory raiz) {
  final salida = <_Clase>[];
  for (final f in raiz.listSync(recursive: true).whereType<File>()) {
    if (!f.path.endsWith('.dart')) continue;
    final texto = f.readAsStringSync();
    if (!texto.contains('copyWith')) continue;

    for (final m in _declaraClase.allMatches(texto)) {
      final abre = texto.indexOf('{', m.end);
      if (abre == -1) continue;
      final cuerpo = texto.substring(abre, _cierra(texto, abre, '{', '}') + 1);
      final cw = _cuerpoDeCopyWith(cuerpo);
      if (cw == null) continue;
      salida.add(_Clase(
        m.group(1)!,
        f.path,
        _campoFinal.allMatches(cuerpo).map((c) => c.group(1)!).toSet(),
        _argConNombre.allMatches(cw).map((c) => c.group(1)!).toSet(),
      ));
    }
  }
  return salida;
}
