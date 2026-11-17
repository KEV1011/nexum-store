import 'dart:math' as math;

/// Un pasajero a recoger en un viaje por puestos.
class PuntoRecogida {
  const PuntoRecogida({
    required this.bookingId,
    required this.nombre,
    required this.lat,
    required this.lng,
    this.direccion,
  });

  final String bookingId;
  final String nombre;
  final String? direccion;
  final double lat;
  final double lng;
}

double _km(double aLat, double aLng, double bLat, double bLng) {
  double r(double x) => x * math.pi / 180;
  final dLat = r(bLat - aLat);
  final dLng = r(bLng - aLng);
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.cos(r(aLat)) * math.cos(r(bLat)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * 6371 * math.asin(math.min(1, math.sqrt(h)));
}

/// En qué orden pasar por los pasajeros: siempre el más cercano al punto
/// donde está el taxi (el vecino más próximo), empezando por el origen.
///
/// No es el óptimo matemático, pero con cuatro puestos como mucho la
/// diferencia son cuadras, y es el orden que un taxista entiende de un
/// vistazo. Lo que NO se hace es dejarlos en el orden en que reservaron: el
/// primero en reservar puede vivir al final del trayecto.
///
/// Pura y determinista (un empate deja el orden de entrada): la ruta del
/// mapa y la lista numerada tienen que decir LO MISMO.
List<PuntoRecogida> ordenarRecogidas(
  double origenLat,
  double origenLng,
  List<PuntoRecogida> puntos,
) {
  final pendientes = [...puntos];
  final orden = <PuntoRecogida>[];
  var lat = origenLat;
  var lng = origenLng;
  while (pendientes.isNotEmpty) {
    var mejor = 0;
    var mejorKm = double.infinity;
    for (var i = 0; i < pendientes.length; i++) {
      final d = _km(lat, lng, pendientes[i].lat, pendientes[i].lng);
      if (d < mejorKm) {
        mejorKm = d;
        mejor = i;
      }
    }
    final p = pendientes.removeAt(mejor);
    orden.add(p);
    lat = p.lat;
    lng = p.lng;
  }
  return orden;
}
