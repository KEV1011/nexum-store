import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Dibuja el vehículo VISTO DESDE ARRIBA, como en inDrive, Uber o DiDi.
///
/// Está pintado a mano con vectores y no con un archivo de imagen ni con un
/// icono de catálogo, por dos razones:
///
/// 1. Los vehículos que dibuja Google Maps en su navegación son contenido suyo
///    y sus términos prohíben reutilizarlos fuera de un mapa de Google. Esto es
///    nuestro y no depende de la licencia de nadie.
/// 2. Un vector se ve nítido a cualquier tamaño y en cualquier densidad de
///    pantalla, y puede girar con el rumbo sin perder calidad. Un PNG habría
///    que exportarlo en varias resoluciones y se ve borroso al rotar.
///
/// Antes aquí había un chip circular blanco con un icono de Material (el carro
/// de perfil), que es lo que se ve en las capturas: reconocible como "carro",
/// pero nada que ver con lo que enseñan las demás plataformas sobre el mapa.
class VehicleTopDownPainter extends CustomPainter {
  const VehicleTopDownPainter({
    required this.kind,
    required this.body,
    this.roof,
  });

  final VehicleTopDownKind kind;

  /// Color de la carrocería.
  final Color body;

  /// Color del techo/cabina. Por defecto, una versión más oscura del cuerpo.
  final Color? roof;

  Color get _roof =>
      roof ?? Color.lerp(body, Colors.black, 0.28) ?? body;

  /// Cristales: el mismo azul grisáceo que usan todas las ilustraciones de
  /// vehículos cenitales, porque es lo que hace que se lea como "visto desde
  /// arriba" y no como una mancha.
  static const _cristal = Color(0xFF9AA6B2);
  static const _cristalOscuro = Color(0xFF6B7885);
  static const _llanta = Color(0xFF23262B);

  @override
  void paint(Canvas canvas, Size size) {
    switch (kind) {
      case VehicleTopDownKind.car:
        _carro(canvas, size, taxi: false);
      case VehicleTopDownKind.taxi:
        _carro(canvas, size, taxi: true);
      case VehicleTopDownKind.moto:
        _moto(canvas, size, conCajon: false);
      case VehicleTopDownKind.delivery:
        _moto(canvas, size, conCajon: true);
      case VehicleTopDownKind.truck:
        _camion(canvas, size);
    }
  }

  // ── Carro / taxi ───────────────────────────────────────────────────────────
  //
  // Mira hacia ARRIBA (norte). Quien lo use lo gira según el rumbo.
  void _carro(Canvas canvas, Size size, {required bool taxi}) {
    final w = size.width;
    final h = size.height;
    // El carro ocupa el 62 % del ancho: el resto es aire para que la sombra y
    // el giro no se recorten contra el borde del marcador.
    final cw = w * 0.62;
    final ch = h * 0.92;
    final left = (w - cw) / 2;
    final top = (h - ch) / 2;

    final sombra = Paint()
      ..color = Colors.black.withValues(alpha: 0.28)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left, top + ch * 0.06, cw, ch),
        Radius.circular(cw * 0.30),
      ),
      sombra,
    );

    // Llantas: cuatro rectángulos oscuros que asoman por los costados. Son lo
    // que da la lectura cenital; sin ellas parece una pastilla de color.
    final llanta = Paint()..color = _llanta;
    final lw = cw * 0.14;
    final lh = ch * 0.17;
    for (final dy in [ch * 0.16, ch * 0.62]) {
      for (final dx in [-lw * 0.45, cw - lw * 0.55]) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(left + dx, top + dy, lw, lh),
            Radius.circular(lw * 0.35),
          ),
          llanta,
        );
      }
    }

    // Carrocería.
    final carroceria = RRect.fromRectAndRadius(
      Rect.fromLTWH(left, top, cw, ch),
      Radius.circular(cw * 0.30),
    );
    canvas.drawRRect(carroceria, Paint()..color = body);

    // Parabrisas (delante, arriba) y luneta (detrás).
    final vidrio = Paint()..color = _cristal;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left + cw * 0.14, top + ch * 0.13, cw * 0.72, ch * 0.16),
        Radius.circular(cw * 0.12),
      ),
      vidrio,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left + cw * 0.16, top + ch * 0.70, cw * 0.68, ch * 0.13),
        Radius.circular(cw * 0.10),
      ),
      Paint()..color = _cristalOscuro,
    );

    // Techo: la franja del medio, más oscura, que separa los dos cristales.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left + cw * 0.10, top + ch * 0.31, cw * 0.80, ch * 0.37),
        Radius.circular(cw * 0.16),
      ),
      Paint()..color = _roof,
    );

    // Espejos.
    final espejo = Paint()..color = _roof;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left - cw * 0.07, top + ch * 0.28, cw * 0.09, ch * 0.05),
        Radius.circular(cw * 0.04),
      ),
      espejo,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left + cw * 0.98, top + ch * 0.28, cw * 0.09, ch * 0.05),
        Radius.circular(cw * 0.04),
      ),
      espejo,
    );

    if (taxi) {
      // Cartel del techo: es lo único que distingue un taxi de un particular
      // visto desde arriba, igual que en la calle.
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left + cw * 0.28, top + ch * 0.42, cw * 0.44, ch * 0.11),
          Radius.circular(cw * 0.05),
        ),
        Paint()..color = const Color(0xFFFFC107),
      );
    }
  }

  // ── Moto / moto de reparto ─────────────────────────────────────────────────
  void _moto(Canvas canvas, Size size, {required bool conCajon}) {
    final w = size.width;
    final h = size.height;
    final cw = w * 0.34;
    final ch = h * 0.84;
    final left = (w - cw) / 2;
    final top = (h - ch) / 2;

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left, top + ch * 0.06, cw, ch),
        Radius.circular(cw * 0.45),
      ),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.26)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );

    // Ruedas delantera y trasera, alineadas (una moto vista desde arriba tiene
    // las dos en el mismo eje: eso es lo que la distingue de un carro).
    final llanta = Paint()..color = _llanta;
    for (final dy in [0.0, ch * 0.80]) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left + cw * 0.30, top + dy, cw * 0.40, ch * 0.20),
          Radius.circular(cw * 0.16),
        ),
        llanta,
      );
    }

    // Manillar: la barra ancha de delante.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left - cw * 0.34, top + ch * 0.17, cw * 1.68, ch * 0.07),
        Radius.circular(ch * 0.035),
      ),
      Paint()..color = _llanta,
    );

    // Cuerpo.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left + cw * 0.12, top + ch * 0.16, cw * 0.76, ch * 0.62),
        Radius.circular(cw * 0.30),
      ),
      Paint()..color = body,
    );

    // El conductor, visto desde arriba: hombros y casco.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left - cw * 0.08, top + ch * 0.34, cw * 1.16, ch * 0.20),
        Radius.circular(cw * 0.30),
      ),
      Paint()..color = _roof,
    );
    canvas.drawCircle(
      Offset(left + cw / 2, top + ch * 0.40),
      cw * 0.30,
      Paint()..color = _cristal,
    );

    if (conCajon) {
      // El cajón de reparto, detrás. Es lo que distingue un domicilio de una
      // carrera cuando se mira el mapa.
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left - cw * 0.16, top + ch * 0.58, cw * 1.32, ch * 0.26),
          Radius.circular(cw * 0.14),
        ),
        Paint()..color = const Color(0xFFE8543F),
      );
    }
  }

  // ── Camión ─────────────────────────────────────────────────────────────────
  void _camion(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cw = w * 0.64;
    final ch = h * 0.96;
    final left = (w - cw) / 2;
    final top = (h - ch) / 2;

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left, top + ch * 0.05, cw, ch),
        Radius.circular(cw * 0.14),
      ),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.28)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );

    // Seis ruedas: dos delante y cuatro detrás, que es lo que hace que se lea
    // como camión y no como un carro largo.
    final llanta = Paint()..color = _llanta;
    final lw = cw * 0.13;
    final lh = ch * 0.12;
    for (final dy in [ch * 0.12, ch * 0.60, ch * 0.76]) {
      for (final dx in [-lw * 0.45, cw - lw * 0.55]) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(left + dx, top + dy, lw, lh),
            Radius.circular(lw * 0.3),
          ),
          llanta,
        );
      }
    }

    // Caja (atrás) y cabina (delante), separadas.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left, top + ch * 0.34, cw, ch * 0.66),
        Radius.circular(cw * 0.08),
      ),
      Paint()..color = Color.lerp(body, Colors.white, 0.16) ?? body,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left + cw * 0.04, top, cw * 0.92, ch * 0.30),
        Radius.circular(cw * 0.12),
      ),
      Paint()..color = body,
    );
    // Parabrisas de la cabina.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(left + cw * 0.14, top + ch * 0.05, cw * 0.72, ch * 0.12),
        Radius.circular(cw * 0.06),
      ),
      Paint()..color = _cristal,
    );
  }

  @override
  bool shouldRepaint(VehicleTopDownPainter old) =>
      old.kind != kind || old.body != body || old.roof != roof;
}

/// Los cinco vehículos que sabe dibujar el pintor.
enum VehicleTopDownKind { car, taxi, moto, delivery, truck }

/// Convierte grados de rumbo (0 = norte) a radianes para `Transform.rotate`.
double radianesDeRumbo(double grados) => grados * math.pi / 180;
