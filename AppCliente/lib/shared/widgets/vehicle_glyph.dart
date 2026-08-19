import 'package:flutter/material.dart';

/// Tipo de vehículo para el marcador del mapa.
///
/// Son cinco y no tres porque el backend YA distingue seis tipos de vehículo
/// (PARTICULAR, TAXI, MOTO, TURBO, CAMION, MULA) y aquí se aplastaban en
/// carro/moto/camión: un taxi salía con el mismo icono que un particular. No
/// nos faltaban iconos — tirábamos el detalle que ya teníamos.
///
/// TURBO, CAMION y MULA sí comparten glifo a propósito: Material Icons no tiene
/// tres camiones que se distingan de un vistazo a 22 px, y tres iconos que se
/// ven iguales no informan de nada; solo dan la falsa impresión de que sí.
enum VehicleGlyphKind {
  /// Carro particular.
  car,

  /// Taxi (el del cartel en el techo).
  taxi,

  /// Moto de pasajeros.
  moto,

  /// Moto de reparto: la del cajón detrás. Es el glifo de pedidos y mandados,
  /// para que quien espera comida no vea el mismo icono que quien espera una
  /// carrera.
  delivery,

  /// Turbo, camión o mula.
  truck,
}

/// Marcador de vehículo estilo Google Maps: chip circular blanco con el ícono
/// oficial de Google (Material Icons) que se desliza por la ruta A→B. Los íconos miran a la
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
  IconData get _icon => vehicleGlyphIcon(kind);

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

/// Ícono de Material Icons (Apache 2.0, de Google y libre) para cada tipo.
///
/// Es el mismo ícono del marcador, también para usarlo fuera del mapa (p. ej.
/// la miniatura del vehículo en la ficha del conductor cuando la empresa no
/// subió una foto real). Una sola fuente: si cambia el del mapa, cambia el de
/// la ficha.
///
/// Los vehículos que dibuja Google Maps en su navegación NO se pueden usar:
/// son contenido de Google Maps y sus términos prohíben reutilizarlo fuera de
/// un mapa suyo. Material Icons sí es de Google y sí es libre.
IconData vehicleGlyphIcon(VehicleGlyphKind kind) => switch (kind) {
      VehicleGlyphKind.car => Icons.directions_car,
      VehicleGlyphKind.taxi => Icons.local_taxi,
      VehicleGlyphKind.moto => Icons.two_wheeler,
      VehicleGlyphKind.delivery => Icons.delivery_dining,
      VehicleGlyphKind.truck => Icons.local_shipping,
    };

/// Traduce el tipo REAL del vehículo del backend (PARTICULAR|TAXI|MOTO|TURBO|
/// CAMION|MULA) al glifo del mapa. [fallback] cubre datos faltantes
/// (histórico/APK viejo) — nunca rompe un mapa por dato faltante.
///
/// [entrega] marca que el servicio es un pedido o un mandado. Convierte la moto
/// en moto de reparto: el dato del vehículo dice "MOTO" en los dos casos, así
/// que sin esto el cajón de reparto no aparecería nunca. No toca los carros —
/// un domicilio en carro sigue siendo un carro.
VehicleGlyphKind vehicleGlyphKindFor(
  String? vehicleType, {
  VehicleGlyphKind fallback = VehicleGlyphKind.car,
  bool entrega = false,
}) {
  final tipo = switch (vehicleType?.toUpperCase()) {
    'MOTO' => VehicleGlyphKind.moto,
    'TURBO' || 'CAMION' || 'MULA' => VehicleGlyphKind.truck,
    'TAXI' => VehicleGlyphKind.taxi,
    'PARTICULAR' => VehicleGlyphKind.car,
    _ => fallback,
  };
  if (entrega && tipo == VehicleGlyphKind.moto) return VehicleGlyphKind.delivery;
  return tipo;
}
