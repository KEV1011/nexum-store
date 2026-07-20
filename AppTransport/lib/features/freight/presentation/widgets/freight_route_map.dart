import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/shared/services/route_service.dart';

/// Mapa compacto del trayecto de un flete: marcador de origen (verde),
/// marcador de destino (rojo) y una línea entre ambos. Las coordenadas vienen
/// del backend (centroide de ciudad); si faltan, no se muestra el mapa.
class FreightRouteMap extends StatefulWidget {
  const FreightRouteMap({
    super.key,
    required this.originLat,
    required this.originLng,
    required this.destLat,
    required this.destLng,
    this.driverLat,
    this.driverLng,
    this.height = 150,
  });

  final double originLat;
  final double originLng;
  final double destLat;
  final double destLng;

  /// Posición EN VIVO del conductor asignado (si el backend la envía en el
  /// DTO del flete ACCEPTED/IN_PROGRESS): pinta el camión sobre la ruta.
  final double? driverLat;
  final double? driverLng;

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
      driverLat: (f['driverLat'] as num?)?.toDouble(),
      driverLng: (f['driverLng'] as num?)?.toDouble(),
      height: height,
    );
  }

  @override
  State<FreightRouteMap> createState() => _FreightRouteMapState();
}

class _FreightRouteMapState extends State<FreightRouteMap> {
  /// Ruta REAL por las vías (Routes API vía el proxy). Null = fallback recta.
  List<LatLng>? _route;

  @override
  void initState() {
    super.initState();
    fetchRoutePoints(
      originLat: widget.originLat,
      originLng: widget.originLng,
      destLat: widget.destLat,
      destLng: widget.destLng,
    ).then((pts) {
      if (mounted && pts != null) setState(() => _route = pts);
    });
  }

  @override
  Widget build(BuildContext context) {
    final origin = LatLng(widget.originLat, widget.originLng);
    final dest = LatLng(widget.destLat, widget.destLng);
    final driver = (widget.driverLat != null && widget.driverLng != null)
        ? LatLng(widget.driverLat!, widget.driverLng!)
        : null;
    final center = LatLng(
      (widget.originLat + widget.destLat) / 2,
      (widget.originLng + widget.destLng) / 2,
    );

    // Zoom aproximado según la separación entre puntos (grados → nivel).
    final span = math.max(
      (widget.originLat - widget.destLat).abs(),
      (widget.originLng - widget.destLng).abs(),
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
        height: widget.height,
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
                    // Ruta real por las calles si el proxy tiene llave; recta
                    // (pasando por el camión) como fallback.
                    points: _route ?? [origin, if (driver != null) driver, dest],
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
                  if (driver != null)
                    Marker(
                      point: driver,
                      width: 34,
                      height: 34,
                      child: const _Pin(
                        color: Color(0xFF0EA5E9),
                        icon: Icons.local_shipping_rounded,
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
