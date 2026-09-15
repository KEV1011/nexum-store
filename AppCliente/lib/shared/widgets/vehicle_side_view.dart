// El vehículo de PERFIL, para elegir categoría.
//
// No sustituye al dibujo cenital: en el mapa, mirar el carro desde arriba es
// lo correcto —es la vista del mapa— y ahí `VehicleTopDownPainter` se queda.
//
// El problema era usar ESE dibujo en el selector: un carro visto desde arriba,
// a 40 px y girado en diagonal, se lee como una ficha de juego. Es el detalle
// que hace que una app parezca de juguete. Uber, DiDi y Cabify usan todos la
// misma solución y no por casualidad: **silueta de perfil**, grande, casi
// monocroma y sin cuadro de color detrás. De perfil un carro se reconoce en
// una fracción de segundo porque es como lo vemos en la calle.
//
// Sigue siendo vector pintado a mano: nítido a cualquier tamaño, sin archivo
// que pese ni licencia de nadie.
//
// El taxi conserva el amarillo A PROPÓSITO. En Colombia el taxi es amarillo y
// esa es información, no decoración: distingue el servicio público regulado
// del particular de un vistazo, que es justo la decisión que toma el pasajero
// en esta pantalla.

import 'package:flutter/material.dart';

enum VehicleSideKind { car, taxi, moto, truck }

class VehicleSideViewPainter extends CustomPainter {
  const VehicleSideViewPainter({required this.kind, required this.body});

  final VehicleSideKind kind;

  /// Color de la carrocería. Las ruedas y los cristales se derivan de él para
  /// que el conjunto se vea de una pieza y no como un collage.
  final Color body;

  @override
  void paint(Canvas lienzo, Size s) {
    final llanta = Color.lerp(body, Colors.black, 0.62)!;
    final cristal = Color.lerp(body, Colors.white, 0.68)!;
    final sombreado = Color.lerp(body, Colors.black, 0.18)!;

    // Sombra de contacto: sin ella el vehículo flota y se nota.
    lienzo.drawOval(
      Rect.fromCenter(
        center: Offset(s.width * 0.52, s.height * 0.90),
        width: s.width * 0.80,
        height: s.height * 0.10,
      ),
      Paint()..color = Colors.black.withValues(alpha: 0.10),
    );

    switch (kind) {
      case VehicleSideKind.moto:
        _moto(lienzo, s, body, llanta, cristal);
      case VehicleSideKind.truck:
        _camion(lienzo, s, body, llanta, cristal, sombreado);
      case VehicleSideKind.car:
      case VehicleSideKind.taxi:
        _carro(lienzo, s, body, llanta, cristal, sombreado);
        if (kind == VehicleSideKind.taxi) _letreroTaxi(lienzo, s, sombreado);
    }
  }

  // ── Carro y taxi ───────────────────────────────────────────────────────────

  void _carro(
    Canvas c,
    Size s,
    Color cuerpo,
    Color llanta,
    Color cristal,
    Color sombreado,
  ) {
    double x(double v) => s.width * v;
    double y(double v) => s.height * v;

    // Perfil mirando a la derecha: trasera, pilar, techo, parabrisas, capó,
    // morro y bajos.
    final silueta = Path()
      ..moveTo(x(0.055), y(0.755))
      ..cubicTo(x(0.050), y(0.650), x(0.070), y(0.600), x(0.150), y(0.588))
      ..cubicTo(x(0.245), y(0.575), x(0.300), y(0.370), x(0.405), y(0.352))
      ..lineTo(x(0.600), y(0.352))
      ..cubicTo(x(0.700), y(0.368), x(0.745), y(0.520), x(0.825), y(0.572))
      ..cubicTo(x(0.900), y(0.598), x(0.955), y(0.645), x(0.955), y(0.755))
      ..close();
    c.drawPath(silueta, Paint()..color = cuerpo);

    // Faldón inferior: una franja algo más oscura da volumen sin degradados.
    c.save();
    c.clipPath(silueta);
    c.drawRect(
      Rect.fromLTRB(0, y(0.690), s.width, s.height),
      Paint()..color = sombreado,
    );
    c.restore();

    // Cristales. Dos, con el montante en medio: uno solo se lee como una
    // ventanilla de autobús.
    final trasero = Path()
      ..moveTo(x(0.268), y(0.548))
      ..lineTo(x(0.420), y(0.398))
      ..lineTo(x(0.478), y(0.398))
      ..lineTo(x(0.478), y(0.548))
      ..close();
    final delantero = Path()
      ..moveTo(x(0.512), y(0.398))
      ..lineTo(x(0.598), y(0.398))
      ..lineTo(x(0.690), y(0.540))
      ..lineTo(x(0.512), y(0.548))
      ..close();
    final tinta = Paint()..color = cristal;
    c.drawPath(trasero, tinta);
    c.drawPath(delantero, tinta);

    _rueda(c, Offset(x(0.278), y(0.772)), s.width * 0.118, llanta, cristal);
    _rueda(c, Offset(x(0.762), y(0.772)), s.width * 0.118, llanta, cristal);
  }

  /// El letrero del techo: es lo que convierte un carro en un taxi de un
  /// vistazo, más que el color.
  void _letreroTaxi(Canvas c, Size s, Color sombreado) {
    final r = RRect.fromRectAndRadius(
      Rect.fromLTRB(
        s.width * 0.400,
        s.height * 0.268,
        s.width * 0.585,
        s.height * 0.352,
      ),
      Radius.circular(s.width * 0.022),
    );
    c.drawRRect(r, Paint()..color = sombreado);
  }

  // ── Moto ───────────────────────────────────────────────────────────────────

  void _moto(Canvas c, Size s, Color cuerpo, Color llanta, Color cristal) {
    double x(double v) => s.width * v;
    double y(double v) => s.height * v;

    final trazo = Paint()
      ..color = cuerpo
      ..style = PaintingStyle.stroke
      ..strokeWidth = s.width * 0.055
      ..strokeCap = StrokeCap.round;

    // Horquilla delantera y manillar.
    c.drawLine(Offset(x(0.700), y(0.560)), Offset(x(0.800), y(0.762)), trazo);
    c.drawLine(Offset(x(0.700), y(0.560)), Offset(x(0.735), y(0.390)), trazo);
    c.drawLine(Offset(x(0.660), y(0.372)), Offset(x(0.812), y(0.372)), trazo);

    // Cuerpo: plataforma para los pies y asiento.
    final chasis = Path()
      ..moveTo(x(0.190), y(0.612))
      ..cubicTo(x(0.255), y(0.500), x(0.360), y(0.482), x(0.470), y(0.512))
      ..lineTo(x(0.600), y(0.560))
      ..cubicTo(x(0.640), y(0.600), x(0.610), y(0.672), x(0.540), y(0.680))
      ..lineTo(x(0.340), y(0.700))
      ..cubicTo(x(0.250), y(0.712), x(0.190), y(0.690), x(0.190), y(0.612))
      ..close();
    c.drawPath(chasis, Paint()..color = cuerpo);

    _rueda(c, Offset(x(0.212), y(0.762)), s.width * 0.140, llanta, cristal);
    _rueda(c, Offset(x(0.800), y(0.762)), s.width * 0.140, llanta, cristal);
  }

  // ── Camión ─────────────────────────────────────────────────────────────────

  void _camion(
    Canvas c,
    Size s,
    Color cuerpo,
    Color llanta,
    Color cristal,
    Color sombreado,
  ) {
    double x(double v) => s.width * v;
    double y(double v) => s.height * v;

    // Furgón.
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(x(0.050), y(0.315), x(0.565), y(0.740)),
        Radius.circular(s.width * 0.022),
      ),
      Paint()..color = sombreado,
    );

    // Cabina, con el parabrisas inclinado.
    final cabina = Path()
      ..moveTo(x(0.565), y(0.740))
      ..lineTo(x(0.565), y(0.430))
      ..lineTo(x(0.760), y(0.430))
      ..cubicTo(x(0.850), y(0.448), x(0.930), y(0.560), x(0.945), y(0.660))
      ..lineTo(x(0.945), y(0.740))
      ..close();
    c.drawPath(cabina, Paint()..color = cuerpo);

    final ventana = Path()
      ..moveTo(x(0.640), y(0.478))
      ..lineTo(x(0.762), y(0.478))
      ..lineTo(x(0.858), y(0.598))
      ..lineTo(x(0.640), y(0.598))
      ..close();
    c.drawPath(ventana, Paint()..color = cristal);

    _rueda(c, Offset(x(0.230), y(0.762)), s.width * 0.112, llanta, cristal);
    _rueda(c, Offset(x(0.760), y(0.762)), s.width * 0.112, llanta, cristal);
  }

  // ── Común ──────────────────────────────────────────────────────────────────

  void _rueda(Canvas c, Offset centro, double radio, Color llanta, Color buje) {
    c.drawCircle(centro, radio, Paint()..color = llanta);
    c.drawCircle(centro, radio * 0.42, Paint()..color = buje);
  }

  @override
  bool shouldRepaint(VehicleSideViewPainter old) =>
      old.kind != kind || old.body != body;
}
