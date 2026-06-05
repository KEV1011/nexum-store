import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

/// Componentes visuales compartidos para los mapas (flutter_map + OSM).
///
/// Centraliza el estilo «dark» de los tiles y los marcadores personalizados
/// (vehículos vistos desde arriba, callout de recogida y punto azul pulsante)
/// para que las 4 pantallas con mapa luzcan consistentes.

/// User-Agent requerido por los proveedores de tiles para identificar la app.
const String kTileUserAgent = 'com.nexum.nexum_client';

/// Capa de tiles oscura (CartoDB «Dark Matter») — gratuita y sin API key,
/// reemplaza el estilo claro por defecto de OpenStreetMap.
TileLayer darkTileLayer() => TileLayer(
  urlTemplate:
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  subdomains: const ['a', 'b', 'c', 'd'],
  userAgentPackageName: kTileUserAgent,
  maxNativeZoom: 20,
);

// ── Marcador de vehículo (vista cenital) ─────────────────────────────────────

/// Marcador de un vehículo visto desde arriba (estilo apps de transporte).
///
/// Dibuja una silueta limpia de carro o moto orientada según [headingDeg]
/// (0° = norte). Se pinta con [CustomPaint] para no depender de assets.
class VehicleTopMarker extends StatelessWidget {
  const VehicleTopMarker({
    required this.color,
    this.isMoto = false,
    this.headingDeg = 0,
    this.size = 34,
    super.key,
  });

  final Color color;
  final bool isMoto;
  final double headingDeg;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: headingDeg * math.pi / 180,
      child: CustomPaint(
        size: Size(size, size),
        painter: _VehiclePainter(color: color, isMoto: isMoto),
      ),
    );
  }
}

class _VehiclePainter extends CustomPainter {
  _VehiclePainter({required this.color, required this.isMoto});

  final Color color;
  final bool isMoto;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.35)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5);
    final body = Paint()..color = color;
    final glass = Paint()..color = Colors.white.withValues(alpha: 0.85);

    if (isMoto) {
      // Cuerpo delgado + dos ruedas.
      final bodyRect = RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, cy), width: 9, height: 20),
        const Radius.circular(4),
      );
      canvas.drawRRect(bodyRect.shift(const Offset(0, 1.5)), shadow);
      canvas.drawRRect(bodyRect, body);
      // Manubrio.
      final bar = Paint()
        ..color = Colors.black.withValues(alpha: 0.55)
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round;
      canvas.drawLine(
        Offset(cx - 6, cy - 6),
        Offset(cx + 6, cy - 6),
        bar,
      );
      // Asiento.
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset(cx, cy + 3), width: 6, height: 7),
          const Radius.circular(2),
        ),
        glass,
      );
      return;
    }

    // Carro: carrocería redondeada + parabrisas y luneta.
    final bodyRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(cx, cy), width: 18, height: 30),
      const Radius.circular(6),
    );
    canvas.drawRRect(bodyRect.shift(const Offset(0, 1.8)), shadow);
    canvas.drawRRect(bodyRect, body);

    // Parabrisas (frente, hacia el norte).
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, cy - 8), width: 13, height: 7),
        const Radius.circular(3),
      ),
      glass,
    );
    // Luneta trasera.
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, cy + 8), width: 12, height: 5),
        const Radius.circular(2.5),
      ),
      glass..color = Colors.white.withValues(alpha: 0.6),
    );
  }

  @override
  bool shouldRepaint(_VehiclePainter old) =>
      old.color != color || old.isMoto != isMoto;
}

// ── Callout «Punto de recogida» ──────────────────────────────────────────────

/// Tarjeta flotante sobre el pin de recogida con la dirección y un chevron.
/// Pensada para usarse como `child` de un [Marker] anclado abajo-centro.
class PickupCallout extends StatelessWidget {
  const PickupCallout({
    required this.title,
    required this.address,
    this.onTap,
    super.key,
  });

  final String title;
  final String address;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Burbuja.
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 220),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xEE1A1D27),
                borderRadius: BorderRadius.circular(12),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x66000000),
                    blurRadius: 10,
                    offset: Offset(0, 3),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            color: Color(0xFF94A3B8),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          address,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (onTap != null) ...[
                    const SizedBox(width: 6),
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: Color(0xFF94A3B8),
                      size: 18,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        // Cola/triángulo.
        CustomPaint(size: const Size(14, 7), painter: _TrianglePainter()),
        const SizedBox(height: 1),
        // Pin de recogida.
        Container(
          width: 30,
          height: 30,
          decoration: const BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Color(0x55000000),
                blurRadius: 6,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: const Icon(
            Icons.person_pin_circle_rounded,
            color: Color(0xFF1A1D27),
            size: 20,
          ),
        ),
      ],
    );
  }
}

class _TrianglePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xEE1A1D27);
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => false;
}

// ── Punto azul pulsante (ubicación del usuario) ──────────────────────────────

/// Punto de ubicación del usuario con halo pulsante, como en Google Maps.
class PulsingLocationDot extends StatefulWidget {
  const PulsingLocationDot({
    this.color = const Color(0xFF2D6CF6),
    this.size = 22,
    super.key,
  });

  final Color color;
  final double size;

  @override
  State<PulsingLocationDot> createState() => _PulsingLocationDotState();
}

class _PulsingLocationDotState extends State<PulsingLocationDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, child) {
        final t = _ctrl.value;
        final haloSize = widget.size + (widget.size * 1.6) * t;
        return SizedBox(
          width: widget.size * 2.8,
          height: widget.size * 2.8,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Halo pulsante.
              Container(
                width: haloSize,
                height: haloSize,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withValues(alpha: (1 - t) * 0.30),
                ),
              ),
              // Punto sólido con borde blanco.
              child!,
            ],
          ),
        );
      },
      child: Container(
        width: widget.size * 0.7,
        height: widget.size * 0.7,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: widget.color,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: [
            BoxShadow(
              color: widget.color.withValues(alpha: 0.5),
              blurRadius: 8,
            ),
          ],
        ),
      ),
    );
  }
}
