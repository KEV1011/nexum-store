import 'package:flutter/material.dart';

/// Pin de mapa profesional (estilo Google Maps): gota de color con un glifo
/// blanco dentro y sombra en el suelo. La PUNTA queda en la coordenada — el
/// Marker debe usar `alignment: Alignment.topCenter`.
///
/// LA PUNTA ESTÁ EN EL BORDE DE ABAJO DEL CUADRO, y eso es lo que importa.
/// `Alignment.topCenter` pone el cuadro entero ENCIMA del punto: la
/// coordenada cae en el centro de su borde inferior. Antes la gota era el
/// glifo `Icons.location_on`, cuya punta queda a 22/24 de su alto, así que
/// la punta flotaba ~8 px por encima del punto y la sombra caía debajo: el
/// local, la bandera del destino y cada parada se veían corridos respecto a
/// la línea de la ruta, y en el selector de ubicación se guardaba un punto
/// 8 px más abajo del que señalaba el pin. Ahora la gota se dibuja con su
/// trazado y la punta cae exactamente en (ancho / 2, alto).
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

  /// Escala del trazado: el mismo tamaño que tenía el glifo (44 px sobre su
  /// rejilla de 24).
  static const double _escala = 44 / 24;

  /// Dónde cae la coordenada dentro del cuadro: la punta de la gota.
  static const Offset punta = Offset(markerWidth / 2, markerHeight);

  /// La gota, con la punta en [punta]. Es la forma de `Icons.location_on`
  /// (rejilla de 24, punta en (12, 22)), llevada a este cuadro.
  static Path gota() {
    const dx = markerWidth / 2 - 12 * _escala;
    const dy = markerHeight - 22 * _escala;
    Offset p(double x, double y) => Offset(dx + x * _escala, dy + y * _escala);
    final a = p(12, 2);
    final b1 = p(8.13, 2);
    final b2 = p(5, 5.13);
    final b = p(5, 9);
    final c1 = p(5, 14.25);
    final c = p(12, 22);
    final d2 = p(19, 14.25);
    final d = p(19, 9);
    final e1 = p(19, 5.13);
    final e2 = p(15.87, 2);
    return Path()
      ..moveTo(a.dx, a.dy)
      ..cubicTo(b1.dx, b1.dy, b2.dx, b2.dy, b.dx, b.dy)
      ..cubicTo(c1.dx, c1.dy, c.dx, c.dy, c.dx, c.dy)
      ..cubicTo(c.dx, c.dy, d2.dx, d2.dy, d.dx, d.dy)
      ..cubicTo(e1.dx, e1.dy, e2.dx, e2.dy, a.dx, a.dy)
      ..close();
  }

  /// Centro de la cabeza redonda de la gota, donde va el glifo blanco.
  static const Offset _cabeza = Offset(
    markerWidth / 2,
    markerHeight - (22 - 9) * _escala,
  );

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: markerWidth,
      height: markerHeight,
      child: Stack(
        alignment: Alignment.topCenter,
        clipBehavior: Clip.none,
        children: [
          // Sombra elíptica en el suelo, centrada en la punta: es donde el
          // pin «toca» el mapa.
          Positioned(
            top: markerHeight - 2.5,
            left: markerWidth / 2 - 7,
            child: Container(
              width: 14,
              height: 5,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
          // Cuerpo del pin (gota).
          Positioned.fill(
            child: CustomPaint(painter: _GotaPainter(color)),
          ),
          // Cabeza blanca con el glifo del punto (origen/destino).
          Positioned(
            top: _cabeza.dy - 10,
            left: _cabeza.dx - 10,
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

class _GotaPainter extends CustomPainter {
  const _GotaPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final gota = MapPin.gota();
    // La misma sombra suave que llevaba el glifo (desenfoque 4, 2 px abajo).
    canvas
      ..drawPath(
        gota.shift(const Offset(0, 2)),
        Paint()
          ..color = const Color(0x55000000)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
      )
      ..drawPath(gota, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _GotaPainter old) => old.color != color;
}
