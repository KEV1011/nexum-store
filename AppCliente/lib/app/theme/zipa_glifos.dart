import 'dart:math' as math;
import 'dart:ui' show PathOperation;

import 'package:flutter/material.dart';

/// Los glifos propios de ZIPA: los cuatro servicios, dibujados a mano.
///
/// POR QUÉ NO SON ICONOS DE CATÁLOGO
/// ---------------------------------
/// Las cuatro puertas de la home son lo primero que se ve al abrir la app y lo
/// único que la distingue de cualquier otra. Con `Icons.local_taxi_rounded` y
/// compañía, esa pantalla es la de todo el mundo: son los mismos glifos que
/// usan miles de apps. El resto del catálogo (buscar, chevron, campana…) sigue
/// en Material a propósito — ahí un icono propio no aporta nada y solo sería
/// deuda.
///
/// Están PINTADOS con vectores, no traídos como imagen, por lo mismo que el
/// vehículo cenital del mapa: nítidos a cualquier densidad, sin archivos que
/// exportar en tres resoluciones y sin licencia de nadie que respetar.
///
/// CÓMO ESTÁN HECHOS
/// -----------------
/// Rejilla de 24x24 unidades, la misma de Material, escalada al tamaño que
/// pida quien los use. Son SILUETAS RELLENAS y no líneas: los otros iconos del
/// catálogo son de la familia `rounded`, que es rellena, y un glifo de línea al
/// lado se lee como de otra familia. Además una silueta aguanta el reescalado a
/// 20 px, que es donde de verdad se juzgan; con trazo, los huecos se taponan.
///
/// La geometría se afinó fuera de aquí, con `tools/previsualizar-glifos.py`,
/// que dibuja exactamente estos mismos números con Pillow y los saca a PNG a
/// 20, 29 y 128 px. No hay Flutter en el entorno de desarrollo, así que sin ese
/// paso lo primero que vería el dibujo sería un teléfono del usuario — y
/// «compila» no es «se ve bien». De las cuatro formas, tres cambiaron por
/// completo después de mirarlas: el taxi tenía las ruedas dentro de la puerta,
/// la caja se leía como un regalo con lazo y la buseta de frente parecía un
/// electrodoméstico. **Si se tocan estos números, se tocan los del script.**
///
/// ⚠ EL HUECO NO ES PINTAR ENCIMA. Las ventanas y los bujes son agujeros de
/// verdad en la silueta (`PathOperation.difference`), no una forma del color
/// del fondo: estos glifos van sobre el tinte de la categoría, que no es
/// blanco, y un parche del color equivocado se vería como una mancha. Por eso
/// el orden importa y cada glifo se arma explícitamente en vez de acumular
/// «sólidos» y «huecos» en dos listas: en la buseta, los montantes van DESPUÉS
/// de abrir la fila de ventanas, o el agujero se los comería.
enum ZipaGlifo { movilidad, restaurantes, envios, intermunicipal }

/// El lado de la rejilla de diseño. Todo se define aquí y se escala al pintar.
const double _rejilla = 24;

// ── Ayudas de construcción ───────────────────────────────────────────────────

Path _rrect(double x0, double y0, double x1, double y1, double r) =>
    Path()..addRRect(RRect.fromLTRBR(x0, y0, x1, y1, Radius.circular(r)));

Path _circ(double cx, double cy, double r) =>
    Path()..addOval(Rect.fromCircle(center: Offset(cx, cy), radius: r));

Path _poly(List<Offset> puntos) => Path()..addPolygon(puntos, true);

/// La mitad de ARRIBA de un círculo: la campana de servir.
///
/// En Flutter el ángulo crece en sentido horario y la y va hacia abajo, así que
/// barrer media vuelta desde 180° pasa por arriba, no por abajo.
Path _medioDisco(double cx, double cy, double r) => Path()
  ..moveTo(cx - r, cy)
  ..arcTo(Rect.fromCircle(center: Offset(cx, cy), radius: r), math.pi, math.pi, false)
  ..close();

Path _mas(Path a, Path b) => Path.combine(PathOperation.union, a, b);
Path _menos(Path a, Path b) => Path.combine(PathOperation.difference, a, b);

Path _union(List<Path> partes) => partes.reduce(_mas);

// ── Los cuatro glifos ────────────────────────────────────────────────────────

/// Taxi de perfil. El cartel del techo es lo único que lo separa de un carro,
/// igual que en la calle.
Path _movilidad() {
  final cuerpo = _union([
    _rrect(10.2, 4.4, 13.8, 6.9, 0.8), // cartel del techo
    _poly(const [
      Offset(6.0, 11.6),
      Offset(8.3, 6.7),
      Offset(15.7, 6.7),
      Offset(18.0, 11.6),
    ]), // cabina
    _rrect(2.2, 11.4, 21.8, 16.6, 2.2), // carrocería
    _circ(7.0, 17.0, 2.1), // rueda delantera
    _circ(17.0, 17.0, 2.1), // rueda trasera
  ]);
  final huecos = _union([
    _circ(7.0, 17.0, 0.85), // buje
    _circ(17.0, 17.0, 0.85), // buje
    // Las ventanas. Sin ellas la cabina es un triángulo macizo y el taxi se
    // lee como una casita.
    _poly(const [
      Offset(8.0, 10.6),
      Offset(9.6, 8.1),
      Offset(11.4, 8.1),
      Offset(11.4, 10.6),
    ]),
    _poly(const [
      Offset(12.6, 8.1),
      Offset(14.4, 8.1),
      Offset(16.0, 10.6),
      Offset(12.6, 10.6),
    ]),
  ]);
  return _menos(cuerpo, huecos);
}

/// Campana de servir.
///
/// Más legible a 20 px que un tenedor y un cuchillo cruzados, que a ese tamaño
/// son dos palitos indistinguibles.
Path _restaurantes() => _union([
      _circ(12.0, 7.0, 1.35), // pomo
      _medioDisco(12.0, 16.4, 8.2), // campana
      _rrect(2.2, 16.2, 21.8, 18.4, 1.1), // bandeja
    ]);

/// Caja de envío: la tapa MÁS ANCHA que el cuerpo es lo que la hace caja.
Path _envios() {
  final cuerpo = _mas(
    _rrect(2.2, 5.0, 21.8, 9.9, 1.3), // tapa
    _rrect(4.1, 10.5, 19.9, 19.3, 1.5), // cuerpo
  );
  return _menos(cuerpo, _rrect(9.9, 13.2, 14.1, 14.9, 0.7)); // tirador
}

/// Buseta de perfil: cuerpo alto, fila de ventanas, dos ruedas.
///
/// Se probó de frente para no repetir silueta con el taxi y se leía como un
/// electrodoméstico: un rectángulo alto con una pantalla y dos puntos. De
/// perfil no se confunden — el taxi es bajo y con el techo inclinado, la buseta
/// es una caja alta con ventanas.
Path _intermunicipal() {
  // Primero la carrocería con la fila de ventanas abierta…
  var p = _menos(
    _rrect(2.2, 4.8, 21.8, 17.2, 2.8),
    _rrect(4.3, 7.0, 19.7, 11.9, 1.2),
  );
  // …y DESPUÉS los montantes, que van dentro de ese hueco. Al revés se los
  // comería la ventana.
  p = _union([
    p,
    _rrect(9.1, 7.0, 10.2, 11.9, 0), // montante
    _rrect(13.8, 7.0, 14.9, 11.9, 0), // montante
    _circ(7.0, 17.6, 2.1), // rueda delantera
    _circ(17.0, 17.6, 2.1), // rueda trasera
  ]);
  return _menos(p, _mas(_circ(7.0, 17.6, 0.85), _circ(17.0, 17.6, 0.85))); // bujes
}

/// Los trazados ya combinados, que no dependen del tamaño ni del color.
///
/// Se guardan porque `Path.combine` recorta de verdad —no es apilar formas— y
/// rehacerlo en cada fotograma de una barra de navegación sería trabajo tirado:
/// el dibujo es siempre el mismo, lo único que cambia es la escala del lienzo.
final Map<ZipaGlifo, Path> _cache = {};

Path trazadoDe(ZipaGlifo g) => _cache.putIfAbsent(g, () => switch (g) {
      ZipaGlifo.movilidad => _movilidad(),
      ZipaGlifo.restaurantes => _restaurantes(),
      ZipaGlifo.envios => _envios(),
      ZipaGlifo.intermunicipal => _intermunicipal(),
    });

/// Pinta un glifo de ZIPA del color que se le pida, en el cuadro que se le dé.
class ZipaGlifoPainter extends CustomPainter {
  const ZipaGlifoPainter({required this.glifo, required this.color});

  final ZipaGlifo glifo;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    // El lado corto manda: así un cuadro que no sea cuadrado no deforma el
    // dibujo, solo lo deja con aire a los lados.
    final s = size.shortestSide / _rejilla;
    canvas.save();
    canvas.translate(
      (size.width - _rejilla * s) / 2,
      (size.height - _rejilla * s) / 2,
    );
    canvas.scale(s);
    canvas.drawPath(
      trazadoDe(glifo),
      Paint()
        ..color = color
        ..isAntiAlias = true,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(ZipaGlifoPainter old) =>
      old.glifo != glifo || old.color != color;
}
