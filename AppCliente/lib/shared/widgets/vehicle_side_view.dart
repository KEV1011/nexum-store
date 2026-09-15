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
        _camion(lienzo, s, body, llanta, cristal,
            Color.lerp(body, Colors.black, 0.22)!);
      case VehicleSideKind.car:
      case VehicleSideKind.taxi:
        _carro(lienzo, s, body, llanta, cristal);
        if (kind == VehicleSideKind.taxi) {
          _letreroTaxi(lienzo, s, Color.lerp(body, Colors.black, 0.30)!);
        }
    }
  }

  // ── Carro y taxi ───────────────────────────────────────────────────────────

  void _carro(Canvas c, Size s, Color cuerpo, Color llanta, Color cristal) {
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

    // SIN faldón. Se probó una franja más oscura en los bajos para dar volumen
    // y el resultado, sobre el amarillo del taxi, se lee como un estribo
    // pegado al carro: una pieza que no existe. Las siluetas de Uber y DiDi
    // son de un solo color por esto mismo — el volumen lo dan la forma y las
    // ruedas, no las franjas.

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

    // Una moto se reconoce por su ESQUELETO —dos ruedas separadas, un cuadro
    // que las une y una horquilla que sube al manillar—, no por su volumen. El
    // primer intento la dibujó como una mancha con un manillar flotando al
    // lado, y a ese tamaño no se entendía qué era.
    final trazo = Paint()
      ..color = cuerpo
      ..style = PaintingStyle.stroke
      ..strokeWidth = s.width * 0.052
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // Basculante y cuadro: del buje trasero al eje de dirección.
    c.drawPath(
      Path()
        ..moveTo(x(0.195), y(0.765))
        ..lineTo(x(0.395), y(0.640))
        ..lineTo(x(0.610), y(0.618))
        ..lineTo(x(0.690), y(0.480)),
      trazo,
    );
    // Horquilla delantera, del eje de dirección al buje de la rueda.
    c.drawLine(Offset(x(0.690), y(0.480)), Offset(x(0.805), y(0.765)), trazo);
    // Manillar.
    c.drawLine(Offset(x(0.618), y(0.408)), Offset(x(0.772), y(0.392)), trazo);
    c.drawLine(Offset(x(0.690), y(0.480)), Offset(x(0.700), y(0.400)), trazo);

    // Asiento y tanque, en una pieza: es la línea que remata la silueta.
    final sillin = Path()
      ..moveTo(x(0.232), y(0.586))
      ..cubicTo(x(0.250), y(0.522), x(0.362), y(0.506), x(0.458), y(0.522))
      ..cubicTo(x(0.532), y(0.534), x(0.590), y(0.474), x(0.662), y(0.482))
      ..cubicTo(x(0.702), y(0.508), x(0.690), y(0.582), x(0.630), y(0.600))
      ..lineTo(x(0.332), y(0.626))
      ..cubicTo(x(0.266), y(0.634), x(0.226), y(0.620), x(0.232), y(0.586))
      ..close();
    c.drawPath(sillin, Paint()..color = cuerpo);

    _rueda(c, Offset(x(0.195), y(0.772)), s.width * 0.126, llanta, cristal);
    _rueda(c, Offset(x(0.805), y(0.772)), s.width * 0.126, llanta, cristal);
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

    _rueda(c, Offset(x(0.180), y(0.766)), s.width * 0.116, llanta, cristal);
    _rueda(c, Offset(x(0.775), y(0.766)), s.width * 0.116, llanta, cristal);
  }

  // ── Común ──────────────────────────────────────────────────────────────────

  void _rueda(Canvas c, Offset centro, double radio, Color llanta, Color buje) {
    c.drawCircle(centro, radio, Paint()..color = llanta);
    c.drawCircle(
      centro,
      radio * 0.32,
      Paint()..color = Color.lerp(llanta, buje, 0.55)!,
    );
  }

  @override
  bool shouldRepaint(VehicleSideViewPainter old) =>
      old.kind != kind || old.body != body;
}
