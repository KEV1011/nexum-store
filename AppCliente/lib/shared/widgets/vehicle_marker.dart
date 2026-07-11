import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

/// Rumbo (grados, 0 = norte) entre dos puntos. Útil para orientar el marcador
/// del vehículo hacia la dirección de viaje.
double bearingBetween(LatLng from, LatLng to) {
  final dLon = (to.longitude - from.longitude) * math.pi / 180;
  final lat1 = from.latitude * math.pi / 180;
  final lat2 = to.latitude * math.pi / 180;
  final y = math.sin(dLon) * math.cos(lat2);
  final x = math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

/// Marcador de vehículo estilo Uber/DiDi: una insignia con el ícono del carro o
/// moto (siempre legible en vertical) y un haz direccional que ROTA hacia el
/// rumbo de viaje. La rotación se anima suave entre actualizaciones de GPS.
class VehicleMarker extends StatelessWidget {
  const VehicleMarker({
    super.key,
    required this.headingDegrees,
    required this.color,
    this.isMoto = false,
    this.pulse,
    this.animate = true,
  });

  /// Rumbo en grados (0 = norte, 90 = este).
  final double headingDegrees;
  final Color color;
  final bool isMoto;

  /// Pulso opcional para el efecto "en vivo".
  final Animation<double>? pulse;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 66,
      height: 66,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Halo de "en vivo".
          if (animate && pulse != null)
            AnimatedBuilder(
              animation: pulse!,
              builder: (context, _) {
                final t = pulse!.value;
                return Container(
                  width: 34 + 30 * t,
                  height: 34 + 30 * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color.withValues(alpha: 0.20 * (1 - t)),
                  ),
                );
              },
            ),
          // Haz direccional que rota hacia el rumbo.
          AnimatedRotation(
            turns: headingDegrees / 360,
            duration: const Duration(milliseconds: 500),
            curve: Curves.easeOut,
            child: CustomPaint(
              size: const Size(66, 66),
              painter: _BeamPainter(color: color),
            ),
          ),
          // Insignia del vehículo (vertical, siempre legible).
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.28),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Center(
              child: Container(
                width: 31,
                height: 31,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: Icon(
                  isMoto
                      ? Icons.two_wheeler_rounded
                      : Icons.directions_car_rounded,
                  color: Colors.white,
                  size: 18,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cono/haz suave que sale de la insignia apuntando al norte del widget; el
/// AnimatedRotation lo gira hacia el rumbo real.
class _BeamPainter extends CustomPainter {
  const _BeamPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final rect = Rect.fromCircle(center: center, radius: size.width / 2);
    final paint = Paint()
      ..shader = SweepGradient(
        // Centrado en la parte superior (−90°): el haz apunta "hacia arriba".
        startAngle: -math.pi / 2 - 0.5,
        endAngle: -math.pi / 2 + 0.5,
        colors: [
          color.withValues(alpha: 0.0),
          color.withValues(alpha: 0.45),
          color.withValues(alpha: 0.0),
        ],
        stops: const [0.0, 0.5, 1.0],
      ).createShader(rect);
    canvas.drawCircle(center, size.width / 2, paint);
  }

  @override
  bool shouldRepaint(_BeamPainter oldDelegate) => oldDelegate.color != color;
}
