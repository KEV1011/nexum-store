import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Todo botón que es SOLO un icono tiene que decir qué hace.
///
/// POR QUÉ, Y POR QUÉ AHORA. Google Play pasa cada versión por un **informe
/// previo al lanzamiento** que incluye accesibilidad, y «este elemento puede no
/// tener una etiqueta legible por un lector de pantalla» es uno de los avisos
/// que levanta. Medido antes de escribir esto: de los 28 `IconButton` de esta
/// app, **22 no tenían ninguna etiqueta** (21 % puestos); en la del pasajero,
/// 30 de 51 (41 %). Para quien usa TalkBack, un botón sin etiqueta se anuncia
/// como «botón» y nada más: la flecha de volver, la X de cerrar y el avión de
/// enviar un mensaje son todos «botón».
///
/// No es solo accesibilidad. `tooltip` también es lo que aparece al mantener el
/// dedo sobre el botón, así que la etiqueta sirve a cualquiera que no reconozca
/// el icono — que en una app que se usa conduciendo es mucha gente.
///
/// LA REGLA ES BINARIA A PROPÓSITO: o `tooltip`, o `semanticLabel` en el
/// `Icon`. No se admite «está claro por el contexto», porque el lector de
/// pantalla no lee el contexto, lee el botón.
///
/// CUBRE LOS CUATRO CONSTRUCTORES, y no es exhaustividad gratuita: la primera
/// medición usaba `IconButton(` como marca de texto y se saltó en silencio los
/// seis `IconButton.filled(`/`.filledTonal(` de las dos apps —cinco sin
/// etiqueta, entre ellos los dos pasos de «cuántos puestos reservo»—. Un
/// contador que no mira una variante no dice «faltan cinco»: dice cero, que es
/// la clase de resultado que se cree. Con las cuatro formas contadas son 29
/// botones en esta app y 56 en la del pasajero.
///
/// Y UNA ADVERTENCIA QUE ESTA PRUEBA NO PUEDE COMPROBAR: si el icono cambia con
/// el estado, la etiqueta tiene que cambiar con él. El botón del PIN en los
/// ajustes alterna entre mostrar y ocultar; una etiqueta fija
/// diría «Mostrar el PIN» en el botón que lo oculta, y eso es PEOR que no tener
/// etiqueta, porque TalkBack la lee como si fuera verdad. Los seis botones así
/// de las dos apps llevan su etiqueta condicional.
void main() {
  test('ningún botón de icono se queda sin etiqueta', () {
    final sinEtiqueta = <String>[];
    var total = 0;

    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final src = f.readAsStringSync();
      for (final m in _marca.allMatches(src)) {
        final inicio = m.start;
        total++;
        final cuerpo = _balancear(src, inicio);
        if (cuerpo == null) continue;
        if (cuerpo.contains('tooltip:') || cuerpo.contains('semanticLabel:')) {
          continue;
        }
        final linea = src.substring(0, inicio).split('\n').length;
        sinEtiqueta.add('${f.path}:$linea');
      }
    }

    // Si el recuento cae a cero, el parser se rompió y la prueba estaría
    // pasando sin mirar nada — que es la forma más silenciosa de perder una
    // guarda.
    expect(total, greaterThan(15), reason: 'El parser no encontró IconButton');

    expect(
      sinEtiqueta,
      isEmpty,
      reason: 'Botones de icono que TalkBack anuncia solo como «botón». '
          "Añade `tooltip: 'Volver'` (o lo que haga) al IconButton. Si el "
          'icono cambia con el estado, la etiqueta también:\n'
          '${sinEtiqueta.join('\n')}',
    );
  });
}

/// Los CUATRO constructores de `IconButton`, nombrados uno a uno.
///
/// No vale `IconButton\.\w+\(`: eso casa también con `IconButton.styleFrom(`,
/// que es un ayudante de estilo y aparece DENTRO de los propios botones —
/// contarlo habría inventado botones sin etiqueta que no existen, y una prueba
/// que señala usos correctos acaba desactivada.
///
/// El `(?<![A-Za-z_])` evita que un widget propio llamado `MiIconButton` se
/// cuente como uno de Material: tendría sus propios parámetros y la etiqueta
/// la pondría quien lo use, no él.
final _marca = RegExp(
    r'(?<![A-Za-z_])IconButton(\.(filled|filledTonal|outlined))?\(');

/// El texto de la llamada que empieza en [inicio], balanceando paréntesis.
///
/// Hace falta balancear y no cortar por líneas: un `IconButton` tiene dentro
/// otras llamadas con sus propios paréntesis, y mirar «las seis líneas
/// siguientes» daría por bueno un `tooltip` que pertenece al widget de al lado.
String? _balancear(String src, int inicio) {
  final abre = src.indexOf('(', inicio);
  if (abre < 0) return null;
  var prof = 0;
  for (var j = abre; j < src.length; j++) {
    final c = src[j];
    if (c == '(') {
      prof++;
    } else if (c == ')') {
      prof--;
      if (prof == 0) return src.substring(abre, j + 1);
    }
  }
  return null;
}
