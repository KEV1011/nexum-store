import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// Mapa compacto del trayecto de un flete: marcador de origen (verde),
/// marcador de destino (rojo) y una línea entre ambos. Las coordenadas vienen
/// del backend (centroide de ciudad); si faltan, no se muestra el mapa.
class FreightRouteMap extends StatelessWidget {
  const FreightRouteMap({
    super.key,
    required this.originLat,
    required this.originLng,
    required this.destLat,
    required this.destLng,
    this.height = 150,
  });

  final double originLat;
  final double originLng;
  final double destLat;
  final double destLng;
  final double height;

  /// Construye el widget desde un JSON de flete; devuelve `null` si no hay
  /// coordenadas suficientes para dibujar la trayectoria.
  static Widget? fromFreight(Map<String, dynamic> f, {double height = 150}) {
    final oLat = (f['originLat'] as num?)?.toDouble();
    final oLng = (f['originLng'] as num?)?.toDouble();
    final dLat = (f['destLat'] as num?)?.toDouble();
    final dLng = (f['destLng'] as num?)?.toDouble();
    if (oLat == null || oLng == null || dLat == null || dLng == null) {
      return null;
    }
    return FreightRouteMap(
      originLat: oLat,
      originLng: oLng,
      destLat: dLat,
      destLng: dLng,
      height: height,
    );
  }

  @override
  Widget build(BuildContext context) {
    final origin = LatLng(originLat, originLng);
    final dest = LatLng(destLat, destLng);
    final center = LatLng(
      (originLat + destLat) / 2,
      (originLng + destLng) / 2,
    );

    // Zoom aproximado según la separación entre puntos (grados → nivel).
    final span = math.max(
      (originLat - destLat).abs(),
      (originLng - destLng).abs(),
    );
    final zoom = span < 0.02
        ? 13.0
        : span < 0.1
            ? 11.0
            : span < 0.5
                ? 9.0
                : span < 2
                    ? 7.5
                    : 6.0;

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: height,
        child: IgnorePointer(
          // El mapa es una vista previa dentro de una tarjeta desplazable: no
          // captura los gestos de scroll de la lista.
          child: FlutterMap(
            options: MapOptions(
              initialCenter: center,
              initialZoom: zoom,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.nexum.driver',
              ),
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: [origin, dest],
                    strokeWidth: 3.5,
                    color: const Color(0xFFF59E0B),
                  ),
                ],
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: origin,
                    width: 34,
                    height: 34,
                    child: const _Pin(
                      color: Color(0xFF16A34A),
                      icon: Icons.radio_button_checked_rounded,
                    ),
                  ),
                  Marker(
                    point: dest,
                    width: 34,
                    height: 34,
                    child: const _Pin(
                      color: Color(0xFFDC2626),
                      icon: Icons.location_on_rounded,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Pin extends StatelessWidget {
  const _Pin({required this.color, required this.icon});

  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2.5),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.4),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Icon(icon, color: Colors.white, size: 16),
    );
  }
}
