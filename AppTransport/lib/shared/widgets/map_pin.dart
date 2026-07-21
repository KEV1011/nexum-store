import 'package:flutter/material.dart';

/// Pin de mapa profesional (estilo Google Maps): gota de color con un glifo
/// blanco dentro y sombra en el suelo. La PUNTA queda en la coordenada — el
/// Marker debe usar `alignment: Alignment.topCenter`.
///
/// Reemplaza los puntos planos de origen/destino por marcadores legibles y
/// consistentes con el resto de la app.
class MapPin extends StatelessWidget {
  const MapPin({
    required this.color,
    required this.icon,
    super.key,
  });

  final Color color;
  final IconData icon;

  /// Tamaño recomendado del Marker que lo contiene.
  static const double markerWidth = 40;
  static const double markerHeight = 48;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: markerWidth,
      height: markerHeight,
      child: Stack(
        alignment: Alignment.topCenter,
        clipBehavior: Clip.none,
        children: [
          // Sombra elíptica en el suelo (da profundidad).
          Positioned(
            bottom: 2,
            child: Container(
              width: 14,
              height: 5,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
          // Cuerpo del pin (gota) — Icons.location_on es exactamente esa forma.
          Icon(
            Icons.location_on,
            size: 44,
            color: color,
            shadows: const [
              Shadow(color: Color(0x55000000), blurRadius: 4, offset: Offset(0, 2)),
            ],
          ),
          // Cabeza blanca con el glifo del punto (origen/destino).
          Positioned(
            top: 7,
            child: Container(
              width: 20,
              height: 20,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 13, color: color),
            ),
          ),
        ],
      ),
    );
  }
}
