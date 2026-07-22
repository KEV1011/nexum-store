import 'package:flutter/material.dart';

/// Tipo de vehículo para el marcador del mapa.
enum VehicleGlyphKind { car, moto, truck }

/// Marcador de vehículo estilo Google Maps: chip circular blanco con el ícono
/// oficial de Google (Material Icons: directions_car / two_wheeler /
/// local_shipping) que se desliza por la ruta A→B. Los íconos miran a la
/// DERECHA y se voltean automáticamente cuando el conductor va hacia el oeste,
/// para que el vehículo siempre "mire" hacia donde avanza.
class VehicleGlyph extends StatelessWidget {
  const VehicleGlyph({
    required this.kind,
    required this.headingDegrees,
    this.pulse,
    this.animate = true,
    this.color = const Color(0xFF202124), // gris 900 de Google
    super.key,
  });

  final VehicleGlyphKind kind;

  /// Rumbo en grados (0 = norte, 90 = este). Determina si se voltea.
  final double headingDegrees;

  /// Pulso opcional para el halo "en vivo".
  final Animation<double>? pulse;
  final bool animate;

  /// Color del ícono del vehículo (por defecto gris oscuro estilo Google Maps).
  final Color color;

  static const double markerWidth = 66;
  static const double markerHeight = 52;

  /// Ícono OFICIAL de Google (Material Icons) según el tipo de vehículo.
  IconData get _icon => switch (kind) {
        VehicleGlyphKind.car => Icons.directions_car,
        VehicleGlyphKind.moto => Icons.two_wheeler,
        VehicleGlyphKind.truck => Icons.local_shipping,
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
                  width: 34 + 26 * t,
                  height: 34 + 26 * t,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF1A73E8)
                        .withValues(alpha: 0.18 * (1 - t)),
                  ),
                );
              },
            ),
          // Chip circular blanco con el ícono de Google, estilo marcador de
          // vehículo de Google Maps (sombra suave + borde tenue).
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.black.withValues(alpha: 0.06),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.28),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            alignment: Alignment.center,
            child: Transform.flip(
              flipX: faceLeft,
              child: Icon(_icon, size: 22, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Traduce el tipo REAL del vehículo del backend (PARTICULAR|TAXI|MOTO|TURBO|
/// CAMION|MULA) al glifo del mapa. [fallback] cubre datos faltantes
/// (histórico/APK viejo) — nunca rompe un mapa por dato faltante.
VehicleGlyphKind vehicleGlyphKindFor(
  String? vehicleType, {
  VehicleGlyphKind fallback = VehicleGlyphKind.car,
}) {
  switch (vehicleType?.toUpperCase()) {
    case 'MOTO':
      return VehicleGlyphKind.moto;
    case 'TURBO':
    case 'CAMION':
    case 'MULA':
      return VehicleGlyphKind.truck;
    case 'PARTICULAR':
    case 'TAXI':
      return VehicleGlyphKind.car;
    default:
      return fallback;
  }
}
