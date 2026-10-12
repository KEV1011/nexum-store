/// El color de la letra de un botón se CALCULA, no se elige a ojo.
///
/// EL DATO QUE LO OBLIGÓ: el verde de ZIPA (#00C853) con texto blanco da
/// **2,24:1** y la norma pide 4,5:1 — con texto oscuro da **7,93:1**. Es
/// contraintuitivo, porque el verde parece oscuro de tan saturado, y por eso
/// medio producto llevaba blanco encima. Decidido por el usuario: el verde NO
/// se toca, la letra se adapta.
///
/// Y no hay un color bueno para todos: el rojo de error y el azul
/// intermunicipal sí piden blanco; el verde, el ámbar y el naranja del taxi
/// piden oscuro. Por eso se calcula por fondo.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/contraste.dart';

/// Los `styleFrom(` de un fichero, con su cuerpo recortado.
Iterable<({int linea, String cuerpo})> estilosDe(String fuente) sync* {
  final abre = RegExp(r'(Elevated|Filled|Outlined|Text)Button\.styleFrom\(');
  for (final m in abre.allMatches(fuente)) {
    var i = m.end;
    var prof = 1;
    while (i < fuente.length && prof > 0) {
      final c = fuente[i];
      // Las cadenas se saltan enteras: un parentesis dentro de un texto
      // descuadraria el recorte y la prueba acusaria a un boton correcto.
      if (c == "'" || c == '"') {
        final comilla = c;
        i++;
        while (i < fuente.length && fuente[i] != comilla) {
          i += fuente[i] == '\\' ? 2 : 1;
        }
      } else if (c == '(') {
        prof++;
      } else if (c == ')') {
        prof--;
        if (prof == 0) break;
      }
      i++;
    }
    yield (
      linea: '\n'.allMatches(fuente.substring(0, m.start)).length + 1,
      cuerpo: fuente.substring(m.end, i),
    );
  }
}

/// El valor de `clave:` hasta la coma de su nivel. Null si no está.
String? valorDe(String cuerpo, String clave) {
  final m = RegExp('\\b$clave\\s*:\\s*').firstMatch(cuerpo);
  if (m == null) return null;
  var i = m.end;
  var prof = 0;
  while (i < cuerpo.length) {
    final c = cuerpo[i];
    if (c == '(' || c == '[') {
      prof++;
    } else if (c == ')' || c == ']') {
      prof--;
    } else if (c == ',' && prof == 0) {
      break;
    }
    i++;
  }
  return cuerpo.substring(m.end, i).trim();
}

/// Todos los .dart de `lib/`.
List<File> fuentesDart() => Directory('lib')
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.endsWith('.dart'))
    .toList();

void main() {
  group('la regla de contraste', () {
    test('sobre el verde de la marca, la letra es OSCURA', () {
      // El caso que destapó todo. Si alguien «corrige» esto a blanco, el
      // botón principal de la app vuelve a 2,24:1.
      expect(colorDeTextoSobre(AppColors.primary), AppColors.textPrimary);
      expect(
        contrasteWcag(AppColors.primary, AppColors.textPrimary),
        greaterThan(4.5),
      );
    });

    test('sobre el rojo de error, BLANCA', () {
      expect(colorDeTextoSobre(AppColors.error), Colors.white);
    });

    test('sobre el azul intermunicipal, BLANCA', () {
      expect(colorDeTextoSobre(AppColors.intercityBrand), Colors.white);
    });

    test('sobre el ámbar y el naranja del taxi, OSCURA', () {
      // Los dos parecen «colores fuertes» y los dos son claros en luminancia.
      expect(colorDeTextoSobre(AppColors.warning), AppColors.textPrimary);
      expect(colorDeTextoSobre(AppColors.serviceTaxi), AppColors.textPrimary);
    });

    test('elige SIEMPRE la de más contraste, sea cual sea el fondo', () {
      // Barrido: para cualquier color, lo que devuelve tiene que ser el mejor
      // de los dos. Una regla escrita a ojo falla justo en los tonos medios.
      for (var r = 0; r < 256; r += 17) {
        for (var g = 0; g < 256; g += 17) {
          for (var b = 0; b < 256; b += 17) {
            final fondo = Color.fromARGB(255, r, g, b);
            final elegido = colorDeTextoSobre(fondo);
            final otro =
                elegido == Colors.white ? AppColors.textPrimary : Colors.white;
            expect(
              contrasteWcag(fondo, elegido),
              greaterThanOrEqualTo(contrasteWcag(fondo, otro)),
              reason: 'con el fondo $fondo se eligió el peor de los dos',
            );
          }
        }
      }
    });

    test('el contraste es simétrico y el máximo es negro sobre blanco', () {
      expect(
        contrasteWcag(Colors.white, Colors.black),
        closeTo(contrasteWcag(Colors.black, Colors.white), 0.001),
      );
      expect(contrasteWcag(Colors.black, Colors.white), closeTo(21, 0.01));
      expect(contrasteWcag(Colors.white, Colors.white), closeTo(1, 0.001));
    });

    test('los colores de marca sobre los que se pinta texto son usables', () {
      // Si alguno NO llega a 4,5 con ninguna de las dos letras, el problema es
      // el color y no la letra: hay que cambiarlo, no taparlo.
      for (final c in [
        AppColors.primary,
        AppColors.error,
        AppColors.warning,
        AppColors.success,
        AppColors.intercityBrand,
        AppColors.serviceTaxi,
      ]) {
        expect(fondoImposible(c), isFalse, reason: 'ningún texto se lee en $c');
      }
    });
  });

  group('ningún botón deja su letra al azar', () {
    test('si fija el fondo, fija el color del texto', () {
      // Sin `foregroundColor`, el color sale del `ColorScheme` del tema
      // —`onPrimary`, que en oscuro es un verde casi negro— y acaba encima de
      // un rojo o de un ámbar sin que nadie lo haya decidido.
      final malos = <String>[];
      for (final f in fuentesDart()) {
        for (final e in estilosDe(f.readAsStringSync())) {
          final bg = valorDe(e.cuerpo, 'backgroundColor');
          if (bg == null) continue;
          if (valorDe(e.cuerpo, 'foregroundColor') == null) {
            malos.add('${f.path}:${e.linea}');
          }
        }
      }
      expect(malos, isEmpty, reason: 'botones con fondo y sin letra:\n'
          '${malos.join("\n")}');
    });

    test('el color se calcula sobre EL MISMO fondo del botón', () {
      // La expresión va duplicada (una en el fondo, otra dentro de
      // `colorDeTextoSobre`): si alguien cambia una y no la otra, el contraste
      // se calcularía sobre un color que el botón ya no tiene.
      final torcidos = <String>[];
      for (final f in fuentesDart()) {
        for (final e in estilosDe(f.readAsStringSync())) {
          final bg = valorDe(e.cuerpo, 'backgroundColor');
          final fg = valorDe(e.cuerpo, 'foregroundColor');
          if (bg == null || fg == null) continue;
          if (!fg.startsWith('colorDeTextoSobre(')) continue;
          final dentro = fg.substring('colorDeTextoSobre('.length, fg.length - 1);
          String limpio(String s) => s.replaceAll(RegExp(r'\s+'), ' ').trim();
          if (limpio(dentro) != limpio(bg)) {
            torcidos.add('${f.path}:${e.linea}\n    fondo: ${limpio(bg)}\n'
                '    letra: ${limpio(dentro)}');
          }
        }
      }
      expect(torcidos, isEmpty, reason: 'el fondo y el cálculo se separaron:\n'
          '${torcidos.join("\n")}');
    });
  });
}
