import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Centro de Pamplona, Nariño — usado como respaldo cuando no hay
/// permisos de ubicación o el GPS aún no entrega una posición.
const LatLng kPamplonaCenter = LatLng(1.2136, -77.2811);

/// Resultado de una consulta de ubicación: posición + si es real o respaldo.
class UserLocation {
  const UserLocation({required this.position, required this.isFallback});

  final LatLng position;

  /// `true` cuando devolvemos [kPamplonaCenter] por falta de permisos/GPS.
  final bool isFallback;

  static const UserLocation fallback = UserLocation(
    position: kPamplonaCenter,
    isFallback: true,
  );
}

/// Envuelve `geolocator` para resolver permisos y obtener la posición actual,
/// degradando con elegancia a Pamplona si algo falla.
class LocationService {
  const LocationService();

  /// Pide permisos (si hace falta) y devuelve la ubicación actual.
  /// Nunca lanza: ante cualquier problema retorna [UserLocation.fallback].
  Future<UserLocation> current() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return UserLocation.fallback;

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return UserLocation.fallback;
      }

      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 12),
        ),
      );
      return UserLocation(
        position: LatLng(pos.latitude, pos.longitude),
        isFallback: false,
      );
    } catch (_) {
      return UserLocation.fallback;
    }
  }

  /// Flujo de posiciones para seguir al usuario en el mapa (origen en vivo).
  Stream<LatLng> positionStream() {
    return Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 15,
      ),
    ).map((p) => LatLng(p.latitude, p.longitude));
  }
}

final locationServiceProvider = Provider<LocationService>(
  (ref) => const LocationService(),
);

/// Resuelve la ubicación actual del usuario una sola vez (con respaldo).
final currentLocationProvider = FutureProvider<UserLocation>((ref) async {
  return ref.watch(locationServiceProvider).current();
});
