import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Toda hoja inferior tiene que poder deslizarse.
///
/// EL FALLO QUE MOTIVA ESTA PRUEBA YA PASÓ. Las hojas del repo eran un
/// `Column` con `mainAxisSize.min` dentro de un `Container`, sin nada que
/// deslizara. Mientras el contenido cupo en pantalla no se notó. Dejó de
/// caber en la reserva intermunicipal —mapa de sillas, recogida, notas,
/// cupón, comodidades y un formulario de datos POR CADA pasajero— y el
/// botón de confirmar quedó debajo del borde, sin forma de llegar a él.
///
/// Y NO HACE FALTA UNA HOJA LARGA: cualquiera con un campo de texto se
/// desborda igual en cuanto sale el teclado, porque la mitad de la pantalla
/// desaparece y lo que cabía deja de caber. De las quince hojas del repo,
/// trece tienen campos.
///
/// NO LO CAZA NADA MÁS. Un `Column` que se sale no es un error de
/// compilación ni una advertencia del linter; en depuración pinta la franja
/// amarilla, y en release simplemente recorta. El compilador calla, el CI
/// calla, y solo se ve con el dedo en la pantalla.
///
/// LAS DOS REGLAS:
///
///  1. Toda hoja debe terminar en algo que deslice: [HojaDeslizable] (el
///     marco bueno, con el borde superior quieto) o `envolverHoja` (el
///     envoltorio mínimo que conserva el aspecto de la hoja que ya existía).
///     También valen `ListView`/`DraggableScrollableSheet` si la hoja ya los
///     traía.
///  2. Nada de `Expanded` ni `Spacer` en el nivel raíz del contenido: dentro
///     de un scroll la altura es ilimitada y «ocupa lo que sobre» no
///     significa nada — revienta en EJECUCIÓN, que es justo lo que no se ve
///     desde aquí. Dentro de un `Row` siguen siendo correctos, y por eso la
///     prueba mira solo los hijos DIRECTOS.
void main() {
  final raiz = Directory('lib');

  List<File> dart() => raiz
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();

  /// El bloque equilibrado que empieza en el paréntesis/corchete de [i].
  String bloque(String s, int i) {
    var nivel = 0;
    for (var j = i; j < s.length; j++) {
      final c = s[j];
      if (c == '(' || c == '[' || c == '{') nivel++;
      if (c == ')' || c == ']' || c == '}') {
        nivel--;
        if (nivel == 0) return s.substring(i, j + 1);
      }
    }
    return s.substring(i);
  }

  /// Los hijos DIRECTOS de la primera lista `children: [ … ]` de [cuerpo].
  List<String> hijosDirectos(String cuerpo) {
    final ic = cuerpo.indexOf('children:');
    if (ic == -1) return const [];
    final arr = bloque(cuerpo, cuerpo.indexOf('[', ic));
    final salida = <String>[];
    final actual = StringBuffer();
    var nivel = 0;
    for (var k = 0; k < arr.length; k++) {
      final c = arr[k];
      if (c == '(' || c == '[' || c == '{') nivel++;
      if (c == ')' || c == ']' || c == '}') {
        nivel--;
        if (nivel == 0) {
          salida.add(actual.toString());
          break;
        }
      }
      if (nivel == 1 && c == ',') {
        salida.add(actual.toString());
        actual.clear();
      } else if (nivel >= 1) {
        actual.write(c);
      }
    }
    return salida;
  }

  bool esHueco(String hijo) {
    final t = hijo.trim().replaceFirst(RegExp(r'^\[+'), '').trim();
    return t.startsWith('Expanded(') || t.startsWith('Spacer(');
  }

  test('toda hoja inferior termina en algo que desliza', () {
    // La hoja puede ser un widget aparte (lo normal) o estar escrita en el
    // sitio. En los dos casos se mira la CLASE o el trozo del builder.
    final deslizables = [
      'HojaDeslizable', 'envolverHoja', 'SingleChildScrollView',
      'ListView', 'CustomScrollView', 'DraggableScrollableSheet',
    ];
    final fuentes = {for (final f in dart()) f.path: f.readAsStringSync()};
    final sinScroll = <String>[];

    fuentes.forEach((ruta, s) {
      for (final m in RegExp('showModalBottomSheet').allMatches(s)) {
        final trozo = s.substring(
          m.start,
          m.start + 2500 > s.length ? s.length : m.start + 2500,
        );
        final cls = RegExp(r'builder:\s*\([^)]*\)\s*=>\s*(?:const\s+)?(_?[A-Z]\w+)\s*\(')
            .firstMatch(trozo);
        String? cuerpo;
        if (cls != null) {
          final nombre = cls.group(1)!;
          for (final otra in fuentes.values) {
            final mc = RegExp('class $nombre\\b').firstMatch(otra);
            if (mc != null) {
              final fin = mc.start + 14000;
              cuerpo = otra.substring(mc.start, fin > otra.length ? otra.length : fin);
              break;
            }
          }
          if (cuerpo == null) continue; // widget de otro paquete
        } else {
          cuerpo = trozo;
        }
        if (!deslizables.any(cuerpo.contains) && cuerpo.contains('Column(')) {
          final linea = '\n'.allMatches(s.substring(0, m.start)).length + 1;
          sinScroll.add('$ruta:$linea');
        }
      }
    });

    expect(
      sinScroll,
      isEmpty,
      reason: 'Estas hojas no se pueden deslizar: con el teclado abierto —o '
          'con el contenido largo— su botón queda debajo del borde de la '
          'pantalla. Envuélvelas con envolverHoja(context, …) o pásalas a '
          'HojaDeslizable.\n${sinScroll.join('\n')}',
    );
  });

  test('ninguna hoja deja un Expanded o Spacer en la raíz del scroll', () {
    final malos = <String>[];
    for (final f in dart()) {
      final s = f.readAsStringSync();
      for (final m in RegExp(r'envolverHoja\(').allMatches(s)) {
        final b = bloque(s, m.end - 1);
        final coma = b.indexOf(',');
        if (coma == -1) continue;
        final cuerpo = b.substring(coma + 1, b.length - 1);
        if (esHueco(cuerpo)) malos.add('${f.path} (raíz)');
        for (final h in hijosDirectos(cuerpo)) {
          if (esHueco(h)) malos.add('${f.path}: ${h.trim()}');
        }
      }
      for (final m in RegExp(r'HojaDeslizable\(').allMatches(s)) {
        final b = bloque(s, m.end - 1);
        for (final h in hijosDirectos(b)) {
          if (esHueco(h)) malos.add('${f.path}: ${h.trim()}');
        }
      }
    }
    expect(
      malos,
      isEmpty,
      reason: 'Dentro de un scroll la altura es ilimitada: un Expanded o un '
          'Spacer en el nivel raíz revienta en ejecución.\n${malos.join('\n')}',
    );
  });
}
