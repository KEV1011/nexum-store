/// Hacia dónde apunta el vehículo en el mapa, sin temblar ni girar de golpe.
///
/// POR QUÉ EXISTE. El rumbo del marcador se calculaba entre cada par de
/// lecturas de GPS. Parado en un semáforo, el GPS deriva dos o tres metros en
/// cualquier dirección y el carro daba vueltas sobre sí mismo; y el
/// `heading` que entrega el propio teléfono es ruido por debajo de unos 5 km/h.
/// Además el giro era instantáneo, así que cada lectura se veía como un salto.
///
/// Las reglas:
/// - el rumbo solo cambia cuando el vehículo AVANZÓ de verdad desde el último
///   punto en que se fijó (por defecto 8 m) — parado, conserva el que traía;
/// - el `heading` del GPS solo se cree en movimiento;
/// - con una ruta REAL dibujada, el marcador se pega a la vía y toma el rumbo
///   del tramo: es lo que hacen Uber y DiDi, y por eso el carro no «flota»
///   media cuadra al lado de la calle. Pegar es SOLO DIBUJO: la posición que
///   se manda al servidor sigue siendo la del GPS.
///
/// Este archivo es IDÉNTICO en las dos apps (lo vigila una prueba): el
/// conductor y el pasajero tienen que ver el mismo carro apuntando al mismo
/// sitio.
library;

import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

const _metrosPorGradoLat = 110540.0;
const _metrosPorGradoLngEcuador = 111320.0;

double _rad(double g) => g * math.pi / 180;

/// Distancia aproximada en metros (equirectangular: sobra a escala de calle).
double metrosAprox(LatLng a, LatLng b) {
  final x = (b.longitude - a.longitude) *
      _metrosPorGradoLngEcuador *
      math.cos(_rad((a.latitude + b.latitude) / 2));
  final y = (b.latitude - a.latitude) * _metrosPorGradoLat;
  return math.sqrt(x * x + y * y);
}

/// Rumbo en grados (0 = norte, 90 = este) de [desde] a [hasta].
double rumboEntre(LatLng desde, LatLng hasta) {
  final dLon = _rad(hasta.longitude - desde.longitude);
  final lat1 = _rad(desde.latitude);
  final lat2 = _rad(hasta.latitude);
  final y = math.sin(dLon) * math.cos(lat2);
  final x = math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLon);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

/// Rumbo de [desde] a [hasta], o null si el vehículo no avanzó [minMetros].
double? rumboSiAvanzo(LatLng desde, LatLng hasta, {double minMetros = 8}) {
  if (metrosAprox(desde, hasta) < minMetros) return null;
  return rumboEntre(desde, hasta);
}

/// El `heading` del GPS, o null si no es creíble.
///
/// Por debajo de [minVelocidad] (m/s; 1,5 ≈ 5 km/h) el teléfono no sabe hacia
/// dónde va y el valor salta. 0 o negativo es «no lo sé» en geolocator.
double? rumboDelGps({
  required double heading,
  required double velocidadMs,
  double minVelocidad = 1.5,
}) {
  if (velocidadMs < minVelocidad || heading <= 0 || heading.isNaN) return null;
  return heading % 360;
}

/// Lleva [nuevo] al valor equivalente más cercano a [anterior], sin acotar a
/// 0–360: así una animación lineal entre los dos gira por el lado CORTO. De
/// 350° a 10° son 20° a la derecha, no 340° a la izquierda.
double rumboContinuo(double anterior, double nuevo) {
  var delta = (nuevo - anterior) % 360;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return anterior + delta;
}

/// Recuerda el último rumbo creíble y el punto donde se fijó.
///
/// El ancla es lo que lo hace estable: medir siempre contra la lectura
/// ANTERIOR haría que, a paso lento, ningún par de lecturas superara el umbral
/// y el rumbo no se actualizara nunca. Contra el ancla, los metros se acumulan.
class RumboEstable {
  RumboEstable({this.minMetros = 8});

  final double minMetros;
  LatLng? _ancla;
  double _rumbo = 0;

  double get rumbo => _rumbo;

  /// Registra una posición y devuelve el rumbo resultante.
  double mover(LatLng p) {
    final ancla = _ancla;
    if (ancla == null) {
      _ancla = p;
      return _rumbo;
    }
    final r = rumboSiAvanzo(ancla, p, minMetros: minMetros);
    if (r != null) {
      _rumbo = r;
      _ancla = p;
    }
    return _rumbo;
  }

  /// Fija un rumbo que llegó de otra fuente creíble (el GPS en movimiento, el
  /// tramo de la ruta).
  void fijar(double grados, LatLng p) {
    _rumbo = grados % 360;
    _ancla = p;
  }
}

/// El punto de [ruta] más cercano a [p] y el rumbo de ese tramo, o null si
/// [p] está a más de [maxMetros] de la ruta (se desvió: entonces se dibuja
/// donde está, no en una calle por la que no va).
({LatLng punto, double rumbo})? pegarARuta(
  LatLng p,
  List<LatLng> ruta, {
  double maxMetros = 25,
}) {
  if (ruta.length < 2) return null;
  final cosLat = math.cos(_rad(p.latitude));
  // Coordenadas locales en metros alrededor de p.
  double xDe(LatLng q) =>
      (q.longitude - p.longitude) * _metrosPorGradoLngEcuador * cosLat;
  double yDe(LatLng q) => (q.latitude - p.latitude) * _metrosPorGradoLat;

  ({LatLng punto, double rumbo})? mejor;
  var mejorDist = double.infinity;
  for (var i = 0; i < ruta.length - 1; i++) {
    final a = ruta[i];
    final b = ruta[i + 1];
    final ax = xDe(a), ay = yDe(a);
    final dx = xDe(b) - ax, dy = yDe(b) - ay;
    final largo2 = dx * dx + dy * dy;
    if (largo2 < 1e-6) continue; // tramo de longitud cero
    final t = (-(ax * dx + ay * dy) / largo2).clamp(0.0, 1.0);
    final px = ax + t * dx, py = ay + t * dy;
    final d = math.sqrt(px * px + py * py);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = (
        punto: LatLng(
          a.latitude + t * (b.latitude - a.latitude),
          a.longitude + t * (b.longitude - a.longitude),
        ),
        rumbo: rumboEntre(a, b),
      );
    }
  }
  if (mejor == null || mejorDist > maxMetros) return null;
  return mejor;
}
