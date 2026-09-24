import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Ilustraciones propias de ZIPA: los vehículos del intermunicipal y la comida.
///
/// POR QUÉ DIBUJADAS Y NO UNA IMAGEN
/// ---------------------------------
/// Se probaron las tres que trajo el usuario y ninguna servía, cada una por su
/// motivo concreto:
///
///  · Los dos buses venían **de frente**. A 44 px un bus de frente es un
///    rectángulo con una franja de parabrisas: igual que cualquier caja. Uno
///    era además **blanco** —invisible sobre el fondo claro de la tarjeta— y
///    el otro **verde**, que compite con el verde de la marca.
///  · La de comida eran **cuatro objetos superpuestos** (papas, vaso,
///    hamburguesa y bolsa térmica). A ese tamaño es una mancha roja, y no hay
///    recorte rectangular que saque uno limpio porque se tocan entre sí.
///
/// Y sobre todo: para hablar con un terminal hacen falta **tres siluetas
/// distintas** —van, buseta y bus—, y de eso no había ninguna imagen.
///
/// Dibujadas, además, se adaptan al tema: la carrocería toma el color del
/// tinte de la categoría y las ventanas el del fondo, así que en modo oscuro
/// no hay que exportar nada. Un PNG no puede hacer eso.
///
/// CÓMO ESTÁN HECHAS
/// -----------------
/// Rejilla de alto fijo (44) y largo propio de cada vehículo. Lo que los
/// distingue a simple vista NO es el largo absoluto —cada uno se escala a su
/// cuadro y acaban igual de anchos— sino la **proporción** y el **número de
/// ventanas**: la van es rechoncha con dos, el bus alargado con cinco.
///
/// La geometría se afinó con `tools/previsualizar-vehiculos.py`, que dibuja
/// estos mismos números con Pillow a 44, 64 y 128 px y **sobre el fondo real
/// del cuadro**, no sobre blanco. Hizo falta: la primera comida era una bolsa
/// térmica que se leía como un maletín, y su plato quedaba invisible sobre el
/// ámbar de la tarjeta. **Si se tocan estos números, se tocan los del script.**
enum ZipaVehiculo { van, buseta, bus }

/// El alto de la rejilla, común a los tres. Solo cambia el largo.
const double _alto = 44;

const Map<ZipaVehiculo, _Medidas> _medidas = {
  ZipaVehiculo.van: _Medidas(largo: 60, ventanas: 2, morro: 9, techoAlto: false),
  ZipaVehiculo.buseta: _Medidas(largo: 78, ventanas: 4, morro: 5, techoAlto: true),
  ZipaVehiculo.bus: _Medidas(largo: 96, ventanas: 5, morro: 0, techoAlto: true),
};

class _Medidas {
  const _Medidas({
    required this.largo,
    required this.ventanas,
    required this.morro,
    required this.techoAlto,
  });
  final double largo;
  final int ventanas;
  final double morro;
  final bool techoAlto;
}

/// Las piezas de un vehículo, ya en coordenadas de la rejilla.
class _Piezas {
  const _Piezas(this.cuerpo, this.huecos, this.ruedas);
  final Path cuerpo;
  final Path huecos;
  final Path ruedas;
}

_Piezas _construir(ZipaVehiculo v) {
  final m = _medidas[v]!;
  final yTecho = m.techoAlto ? 5.0 : 8.0;
  const ySuelo = 33.0;
  const x0 = 2.0;
  final x1 = m.largo - 2;

  final cuerpo = Path();
  if (m.morro > 0) {
    cuerpo.addPolygon([
      Offset(x0 + m.morro, yTecho),
      Offset(x1 - 3, yTecho),
      Offset(x1, yTecho + 3.5),
      Offset(x1, ySuelo),
      Offset(x0, ySuelo),
      Offset(x0, yTecho + 5 + m.morro * 0.55),
      Offset(x0 + m.morro * 0.5, yTecho + 2 + m.morro * 0.2),
    ], true);
  } else {
    // Bus: frente PLANO. Con el punto del morro puesto a cero quedaba un
    // chaflán en la esquina delantera y el bus parecía golpeado.
    cuerpo.addPolygon([
      Offset(x0 + 2, yTecho),
      Offset(x1 - 3, yTecho),
      Offset(x1, yTecho + 3.5),
      Offset(x1, ySuelo),
      Offset(x0, ySuelo),
      Offset(x0, yTecho + 2.5),
    ], true);
  }

  final huecos = Path();
  final vY0 = yTecho + 3;
  final vY1 = yTecho + 13;
  final izq = x0 + 2.5 + m.morro;
  final util = (x1 - 3) - izq;
  const separacion = 2.2;
  final anchoV = (util - separacion * (m.ventanas - 1)) / m.ventanas;
  for (var i = 0; i < m.ventanas; i++) {
    final vx = izq + i * (anchoV + separacion);
    // El parabrisas sigue la inclinación del morro; las laterales son rectas.
    final sesgo = (i == 0 && m.morro > 0) ? 2.2 : 0.0;
    huecos.addPolygon([
      Offset(vx + sesgo, vY0),
      Offset(vx + anchoV, vY0),
      Offset(vx + anchoV, vY1),
      Offset(vx, vY1),
    ], true);
  }

  // Ruedas GRANDES y asomando por debajo: a 44 px unas pequeñas desaparecen y
  // el vehículo se queda flotando como una caja.
  const r = 5.4;
  final ruedas = Path()
    ..addOval(Rect.fromCircle(center: Offset(x0 + m.morro + 6.5, ySuelo), radius: r))
    ..addOval(Rect.fromCircle(center: Offset(x1 - 7.5, ySuelo), radius: r));

  return _Piezas(cuerpo, huecos, ruedas);
}

final Map<ZipaVehiculo, _Piezas> _cacheVehiculo = {};

_Piezas _piezasDe(ZipaVehiculo v) =>
    _cacheVehiculo.putIfAbsent(v, () => _construir(v));

/// Pinta el vehículo de perfil dentro del cuadro que se le dé.
///
/// `cuerpo` es el color de la carrocería y `hueco` el de las ventanas — que
/// normalmente es el FONDO del cuadro, para que se lean como aberturas en vez
/// de como parches pegados.
class ZipaVehiculoPainter extends CustomPainter {
  const ZipaVehiculoPainter({
    required this.vehiculo,
    required this.cuerpo,
    required this.hueco,
    required this.rueda,
  });

  final ZipaVehiculo vehiculo;
  final Color cuerpo;
  final Color hueco;
  final Color rueda;

  @override
  void paint(Canvas canvas, Size size) {
    final m = _medidas[vehiculo]!;
    final p = _piezasDe(vehiculo);
    // Se ajusta por el lado que más aprieta, así el dibujo nunca se deforma.
    final s = (size.width / m.largo) < (size.height / _alto)
        ? size.width / m.largo
        : size.height / _alto;

    canvas.save();
    canvas.translate(
      (size.width - m.largo * s) / 2,
      (size.height - _alto * s) / 2,
    );
    canvas.scale(s);

    final pintura = Paint()..isAntiAlias = true;
    // Las ruedas van DEBAJO de la carrocería: encima parecerían pegatinas.
    canvas.drawPath(p.ruedas, pintura..color = rueda);
    canvas.drawPath(p.cuerpo, pintura..color = cuerpo);
    canvas.drawPath(p.huecos, pintura..color = hueco);
    canvas.restore();
  }

  @override
  bool shouldRepaint(ZipaVehiculoPainter old) =>
      old.vehiculo != vehiculo ||
      old.cuerpo != cuerpo ||
      old.hueco != hueco ||
      old.rueda != rueda;
}

// ─── Comida ──────────────────────────────────────────────────────────────────

const double _rejillaComida = 44;

/// Campana de servir sobre el plato.
///
/// La primera versión era una bolsa térmica y se leía como un MALETÍN: asa
/// rígida arriba y cuerpo cuadrado son un portafolio. Y no es un plato de
/// comida concreto —una hamburguesa le diría «comida rápida» a un restaurante
/// de menú del día.
Path _construirComida() {
  // Cúpula: media elipse ANCHA. Con media circunferencia parecía un iglú.
  // El ángulo crece en sentido horario y la y va hacia abajo, así que barrer
  // media vuelta desde 180° pasa por ARRIBA — el mismo giro que el `pieslice`
  // 180→360 del script de previsualización.
  const cupula = Rect.fromLTRB(6, 8, 38, 38);
  final p = Path()
    ..moveTo(cupula.left, cupula.center.dy)
    ..arcTo(cupula, math.pi, math.pi, false)
    ..close()
    ..addOval(const Rect.fromLTRB(19.2, 4.4, 24.8, 10.0)) // pomo
    // Plato: UNA sola pieza y más ancha que la cúpula. Con borde de campana Y
    // plato se leían como dos barras apiladas, y el conjunto parecía una
    // hamburguesa de rayas.
    ..addRRect(RRect.fromLTRBR(3.5, 30.5, 40.5, 35, const Radius.circular(2.2)));
  return p;
}

Path? _cacheComida;

/// Pinta la campana. Un solo color: es una silueta, como los glifos.
class ZipaComidaPainter extends CustomPainter {
  const ZipaComidaPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final trazo = _cacheComida ??= _construirComida();
    final s = size.shortestSide / _rejillaComida;
    canvas.save();
    canvas.translate(
      (size.width - _rejillaComida * s) / 2,
      (size.height - _rejillaComida * s) / 2,
    );
    canvas.scale(s);
    canvas.drawPath(trazo, Paint()
      ..color = color
      ..isAntiAlias = true);
    canvas.restore();
  }

  @override
  bool shouldRepaint(ZipaComidaPainter old) => old.color != color;
}

/// La silueta que corresponde al tipo que manda el servidor (VAN|BUSETA|BUS).
///
/// Devuelve `null` para cualquier otra cosa —una salida sin vehículo declarado,
/// o un tipo que este build todavía no conoce— y quien lo use no dibuja nada.
/// Caer al bus «por defecto» sería enseñarle un bus a quien va a subirse a una
/// van, que es exactamente el tipo de dato inventado que aquí no se permite.
ZipaVehiculo? vehiculoDeTipo(String? tipo) => switch (tipo?.toUpperCase()) {
      'VAN' => ZipaVehiculo.van,
      'BUSETA' => ZipaVehiculo.buseta,
      'BUS' => ZipaVehiculo.bus,
      _ => null,
    };
