import 'package:latlong2/latlong.dart';

import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/core/utils/polyline_decoder.dart';

// ── Ruta real por las calles (proxy /geo/directions del backend) ──────────────
//
// Devuelve los puntos del trayecto siguiendo las vías (Routes API de Google,
// con la llave viviendo SOLO en el servidor), o `null` si el proxy no tiene
// llave o falla — el mapa cae al trazado actual (línea recta / esquina en L).
// Caché en memoria por par de coordenadas: no quema cuota en rebuilds.

final Map<String, List<LatLng>> _cache = {};

String _key(double aLat, double aLng, double bLat, double bLng) =>
    '${aLat.toStringAsFixed(4)},${aLng.toStringAsFixed(4)}'
    '->${bLat.toStringAsFixed(4)},${bLng.toStringAsFixed(4)}';

Future<List<LatLng>?> fetchRoutePoints({
  required double originLat,
  required double originLng,
  required double destLat,
  required double destLng,
}) async {
  final key = _key(originLat, originLng, destLat, destLng);
  final cached = _cache[key];
  if (cached != null) return cached;

  try {
    final res = await DioClient().get<Map<String, dynamic>>(
      '/geo/directions',
      queryParameters: {
        'originLat': originLat,
        'originLng': originLng,
        'destLat': destLat,
        'destLng': destLng,
      },
    );
    final data = res.data?['data'] as Map<String, dynamic>?;
    final encoded = data?['polyline'] as String? ?? '';
    if (encoded.isEmpty) return null;
    final points = decodePolyline(encoded);
    if (points.length < 2) return null;
    _cache[key] = points;
    return points;
  } catch (_) {
    return null; // sin llave/red: el mapa usa el trazado de siempre
  }
}
