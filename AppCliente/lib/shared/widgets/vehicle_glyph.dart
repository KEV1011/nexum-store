import 'package:flutter/material.dart';

/// Tipo de vehículo ilustrado para el marcador del mapa.
enum VehicleGlyphKind { car, moto, truck }

/// Marcador de vehículo ILUSTRADO (estilo flat: carro / moto / camión de vista
/// lateral) que se desliza por la ruta A→B. Los dibujos miran a la DERECHA y se
/// voltean automáticamente cuando el conductor va hacia el oeste, para que el
/// vehículo siempre "mire" hacia donde avanza (estilo Uber/DiDi casual).
class VehicleGlyph extends StatelessWidget {
  const VehicleGlyph({
    required this.kind,
    required this.headingDegrees,
    this.pulse,
    this.animate = true,
    super.key,
  });

  final VehicleGlyphKind kind;

  /// Rumbo en grados (0 = norte, 90 = este). Determina si se voltea.
  final double headingDegrees;

  /// Pulso opcional para el halo "en vivo".
  final Animation<double>? pulse;
  final bool animate;

  static const double markerWidth = 66;
  static const double markerHeight = 52;

  String get _asset => switch (kind) {
        VehicleGlyphKind.car => 'assets/vehicles/car.png',
        VehicleGlyphKind.moto => 'assets/vehicles/moto.png',
        VehicleGlyphKind.truck => 'assets/vehicles/truck.png',
      };

  @override
  Widget build(BuildContext context) {
    // Rumbo hacia el oeste (180°–360°) ⇒ mira a la izquierda.
    final faceLeft = headingDegrees > 180;

    return SizedBox(
      width: markerWidth,
      height: markerHeight,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          // Halo "en vivo".
          if (animate && pulse != null)
            AnimatedBuilder(
              animation: pulse!,
              builder: (context, _) {
                final t = pulse!.value;
                return Container(
                  width: 30 + 26 * t,
                  height: 30 + 26 * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF0A7D57).withValues(alpha: 0.16 * (1 - t)),
                  ),
                );
              },
            ),
          // Sombra en el suelo (bajo las ruedas).
          Positioned(
            bottom: 4,
            child: Container(
              width: 40,
              height: 8,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          // Vehículo ilustrado, volteado según la dirección.
          Transform.flip(
            flipX: faceLeft,
            child: Image.asset(
              _asset,
              width: 58,
              filterQuality: FilterQuality.medium,
            ),
          ),
        ],
      ),
    );
  }
}
