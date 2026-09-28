import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Ningún emoji se DIBUJA en la app del conductor.
///
/// La app del cliente ya tenía esta regla dentro de `zipa_icon_test`, pegada a
/// su catálogo de iconos. El conductor no tiene catálogo, así que no tenía
/// regla — y acumuló ocho: la bandera `🇨🇴` de la pantalla de ingreso, dos
/// palomas `✓`, una corona `👑`, un `🎉` y dos estrellas.
///
/// Por qué importa, y no es cosmética:
///
///   · **No se ve igual en todos los teléfonos.** Un emoji lo dibuja la fuente
///     del sistema. `🇨🇴` son dos caracteres indicadores regionales que solo
///     se combinan en una bandera si la fuente la trae; donde no, sale un
///     recuadro con «CO». Eso estaba en la PRIMERA pantalla de la app.
///   · **No obedece al tema.** Un emoji trae sus propios colores, así que en
///     modo oscuro y sobre un fondo de marca aparece como una mancha ajena a
///     la paleta.
///   · **No escala con el texto.** Un `⭐` junto a un número en negrita sale
///     desalineado, y a 10 px es una mancha.
///
/// Un `Icon` de Material no tiene ninguno de los tres problemas: toma color,
/// tamaño y alineación del sitio donde va.
///
/// La regla mira solo lo que está DENTRO de comillas: en un comentario, una
/// flecha `→` o un aviso `⚠` son legítimos y frecuentes en este repo.
void main() {
  test('no hay emojis en las cadenas que se pintan', () {
    // Banderas, pictogramas, estrellas, palomas y símbolos de aviso. Deja
    // fuera flechas y guiones tipográficos, que son puntuación.
    final emoji = RegExp(
      r'[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2B50}\u{2605}\u{2606}'
      r'\u{2713}\u{2714}\u{26A0}\u{2728}\u{2757}\u{203C}]',
      unicode: true,
    );

    final hallazgos = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final lineas = f.readAsLinesSync();
      for (var i = 0; i < lineas.length; i++) {
        final ln = lineas[i];
        final t = ln.trimLeft();
        if (t.startsWith('//') || t.startsWith('*')) continue;
        for (final m in emoji.allMatches(ln)) {
          // Dentro de comillas = se pinta. Contar las comillas que quedan a la
          // izquierda basta para la forma en que se escribe el código aquí:
          // impar significa que estamos dentro de un literal.
          final izq = ln.substring(0, m.start);
          final dentro = "'".allMatches(izq).length.isOdd ||
              '"'.allMatches(izq).length.isOdd;
          if (dentro) hallazgos.add('${f.path}:${i + 1}  ${m.group(0)}');
        }
      }
    }

    expect(
      hallazgos,
      isEmpty,
      reason: 'Emoji dibujado en la interfaz. Usa un Icon de Material (toma '
          'color, tamaño y alineación del sitio donde va) o dibújalo, como '
          'la bandera de la pantalla de ingreso:\n${hallazgos.join('\n')}',
    );
  });
}
