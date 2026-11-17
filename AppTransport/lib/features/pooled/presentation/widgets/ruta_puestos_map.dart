import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/features/pooled/domain/orden_recogidas.dart';
import 'package:nexum_driver/shared/services/route_service.dart';
import 'package:nexum_driver/shared/widgets/google_map_tiles.dart';
import 'package:nexum_driver/shared/widgets/map_pin.dart';

/// El trayecto de un viaje por puestos URBANO tal como lo va a hacer el
/// taxista: origen → cada recogida en orden → destino.
///
/// POR QUÉ EXISTE. La tarjeta dibujaba el viaje con `FreightRouteMap` y los
/// centroides del MUNICIPIO, que en un viaje urbano son el mismo punto: salía
/// un solo pin en el centro del pueblo y ninguna ruta. Y aunque hubiera
/// pintado los dos extremos, el taxista no pasa del origen al destino en
/// línea recta: pasa por cada pasajero.
///
/// `recogidas` llega YA ORDENADA (`ordenarRecogidas`): el número del pin es el
/// mismo que el de la lista de abajo, y si cada uno ordenara por su cuenta
/// acabarían diciendo cosas distintas.
class RutaPuestosMap extends StatefulWidget {
  const RutaPuestosMap({
    super.key,
    required this.originLat,
    required this.originLng,
    required this.destLat,
    required this.destLng,
    this.recogidas = const [],
    this.height = 200,
  });

  final double originLat;
  final double originLng;
  final double destLat;
  final double destLng;
  final List<PuntoRecogida> recogidas;
  final double height;

  @override
  State<RutaPuestosMap> createState() => _RutaPuestosMapState();
}

class _RutaPuestosMapState extends State<RutaPuestosMap> {
  /// Tramo a tramo por las calles. Un tramo sin ruta (sin llave de Google, o
  /// falló) se queda en recta: el resto del trayecto se sigue viendo bien.
  List<LatLng>? _ruta;

  List<LatLng> get _paradas => [
        LatLng(widget.originLat, widget.originLng),
        for (final r in widget.recogidas) LatLng(r.lat, r.lng),
        LatLng(widget.destLat, widget.destLng),
      ];

  @override
  void initState() {
    super.initState();
    _trazar();
  }

  Future<void> _trazar() async {
    final ps = _paradas;
    final ruta = <LatLng>[ps.first];
    var algunaReal = false;
    for (var i = 0; i < ps.length - 1; i++) {
      final a = ps[i];
      final b = ps[i + 1];
      // Dos puntos casi iguales (el autor sube en el origen) no son un tramo.
      if (const Distance().as(LengthUnit.Meter, a, b) < 30) continue;
      final tramo = await fetchRoutePoints(
        originLat: a.latitude,
        originLng: a.longitude,
        destLat: b.latitude,
        destLng: b.longitude,
      );
      if (tramo != null && tramo.length > 1) {
        algunaReal = true;
        ruta.addAll(tramo.skip(1));
      } else {
        ruta.add(b);
      }
    }
    if (mounted && algunaReal) setState(() => _ruta = ruta);
  }

  @override
  Widget build(BuildContext context) {
    final ps = _paradas;
    final origen = ps.first;
    final destino = ps.last;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: widget.height,
        child: IgnorePointer(
          // Vista previa dentro de una lista: no se roba el desplazamiento.
          child: FlutterMap(
            options: MapOptions(
              backgroundColor: mapaFondoOscuro,
              initialCenter: origen,
              initialZoom: 14,
              initialCameraFit: CameraFit.coordinates(
                coordinates: ps,
                padding: const EdgeInsets.fromLTRB(36, 52, 36, 24),
                maxZoom: 16,
              ),
            ),
            children: [
              const GoogleMapTiles(),
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: _ruta ?? ps,
                    strokeWidth: 4,
                    color: const Color(0xFFF59E0B),
                  ),
                ],
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: origen,
                    width: MapPin.markerWidth,
                    height: MapPin.markerHeight,
                    alignment: Alignment.topCenter,
                    child: const MapPin(
                      color: Color(0xFF16A34A),
                      icon: Icons.trip_origin,
                    ),
                  ),
                  Marker(
                    point: destino,
                    width: MapPin.markerWidth,
                    height: MapPin.markerHeight,
                    alignment: Alignment.topCenter,
                    child: const MapPin(
                      color: Color(0xFFDC2626),
                      icon: Icons.flag_rounded,
                    ),
                  ),
                  // Las recogidas al final para que queden ENCIMA: son lo que
                  // el taxista busca, y la del autor cae sobre el origen.
                  for (var i = 0; i < widget.recogidas.length; i++)
                    Marker(
                      point: LatLng(widget.recogidas[i].lat, widget.recogidas[i].lng),
                      width: MapPin.markerWidth,
                      height: MapPin.markerHeight,
                      alignment: Alignment.topCenter,
                      child: MapPin(
                        color: const Color(0xFF1E3A8A),
                        numero: '${i + 1}',
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
