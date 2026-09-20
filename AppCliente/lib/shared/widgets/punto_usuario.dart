import 'package:flutter/material.dart';

/// Dónde está QUIEN MIRA el mapa: el punto azul de toda la vida.
///
/// Faltaba en todos los mapas de la app, y se notaba justo donde más importa:
/// en el selector de dirección el pin se queda fijo en el centro y se mueve el
/// mapa debajo, así que sin una referencia de dónde estás uno arrastra a
/// ciegas. Lo único que se veía eran los puntos de interés grises que dibujan
/// los tiles de Google, que no son nuestros y encima confunden.
///
/// Es azul y no verde a propósito: el verde es la marca y ya lo usan el pin de
/// destino y los botones. El azul de «tú estás aquí» es una convención que
/// viene de Google Maps y que la gente lee sin pensar; cambiarla por color de
/// marca sería bonito y peor.
///
/// El aro blanco no es adorno: sobre el mapa oscuro un punto azul suelto se
/// confunde con una vía, y sobre el mapa claro con un lago.
class PuntoUsuario extends StatelessWidget {
  const PuntoUsuario({super.key});

  /// Lado del Marker que lo contiene. El punto va CENTRADO en la coordenada
  /// —no anclado por la punta como `MapPin`—, porque no es una gota: marca una
  /// posición, no señala un sitio.
  static const double lado = 22;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 16,
        height: 16,
        decoration: BoxDecoration(
          color: const Color(0xFF1A73E8),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2.5),
          boxShadow: const [
            BoxShadow(color: Color(0x4D000000), blurRadius: 4, offset: Offset(0, 1)),
          ],
        ),
      ),
    );
  }
}
