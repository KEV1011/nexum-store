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
    this.icon,
    this.numero,
    super.key,
  }) : assert(icon != null || numero != null, 'El pin necesita glifo o número');

  final Color color;
  final IconData? icon;

  /// Para las paradas intermedias: el ORDEN en que hay que hacerlas.
  ///
  /// Un glifo repetido en tres paradas no dice cuál va primero, y pasarse de
  /// largo la segunda obliga a devolverse con el pasajero dentro.
  final String? numero;

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
              child: numero != null
                  ? Text(
                      numero!,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        color: color,
                        height: 1,
                      ),
                    )
                  : Icon(icon, size: 13, color: color),
            ),
          ),
        ],
      ),
    );
  }
}
