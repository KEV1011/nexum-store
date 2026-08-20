import 'package:dio/dio.dart';
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
    if (encoded.isEmpty) {
      _porQueNoHayRuta('el servidor respondió sin trazado');
      return null;
    }
    final points = decodePolyline(encoded);
    if (points.length < 2) {
      _porQueNoHayRuta('el trazado trae ${points.length} punto(s)');
      return null;
    }
    _cache[key] = points;
    return points;
  } catch (e) {
    // El motivo IMPORTA: sin él, "la ruta sale recta" solo se puede diagnosticar
    // adivinando. Aquí había un `catch (_)` mudo y por eso no se sabía si
    // faltaba la llave de Google, si el token no valía o si no había red.
    _porQueNoHayRuta(e is DioException
        ? 'HTTP ${e.response?.statusCode}: '
            '${(e.response?.data as Map?)?['error'] ?? e.message}'
        : e.toString());
    return null;
  }
}

/// Deja constancia de por qué el mapa va a dibujar la recta.
void _porQueNoHayRuta(String motivo) {
  // ignore: avoid_print
  print('[Ruta] sin trazado por calles → se dibuja la recta. Motivo: $motivo');
}
