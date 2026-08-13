import 'dart:math' as math;

/// Cómo se encuadra el mapa mientras el vehículo se acerca.
///
/// Hasta ahora el mapa de seguimiento se encuadraba UNA vez al abrirlo —todo el
/// trayecto dentro de la pantalla— y ahí se quedaba. A 14,5 de zoom un carro a
/// dos cuadras y un carro en la puerta se ven igual, y justo el último minuto,
/// que es cuando el pasajero mira el mapa cada diez segundos, es el que menos
/// información daba.
///
/// La regla es la de cualquier app de viajes: lejos se enseña el conjunto, y a
/// medida que el vehículo se acerca la cámara lo sigue y aprieta el zoom. Se
/// separa del widget porque así se puede probar: es aritmética, y la aritmética
/// no necesita un teléfono para comprobarse.
class EncuadreSeguimiento {
  const EncuadreSeguimiento({required this.zoom, required this.seguirVehiculo});

  /// Nivel de zoom sugerido. Solo se usa cuando [seguirVehiculo] es verdadero.
  final double zoom;

  /// `true` = la cámara persigue al vehículo. `false` = se enmarca el trayecto
  /// completo, que es lo útil cuando todavía queda lejos.
  final bool seguirVehiculo;
}

/// Umbrales en metros. Escalonados, no continuos: una cámara que reajusta el
/// zoom con cada fix GPS marea, y el mapa nunca se queda quieto el tiempo
/// suficiente para leerlo.
const double kSeguirDesdeM = 1500;

/// Encuadre para una distancia dada entre el vehículo y el punto al que va
/// (la recogida mientras viene, el destino durante el viaje).
///
/// [metros] negativo o no finito se trata como "lejos": ante un dato roto se
/// enseña el trayecto completo, que nunca engaña.
EncuadreSeguimiento encuadrePara(double metros) {
  if (!metros.isFinite || metros < 0 || metros > kSeguirDesdeM) {
    return const EncuadreSeguimiento(zoom: 14.5, seguirVehiculo: false);
  }
  if (metros > 600) return const EncuadreSeguimiento(zoom: 15.5, seguirVehiculo: true);
  if (metros > 250) return const EncuadreSeguimiento(zoom: 16.5, seguirVehiculo: true);
  if (metros > 80) return const EncuadreSeguimiento(zoom: 17.5, seguirVehiculo: true);
  return const EncuadreSeguimiento(zoom: 18.5, seguirVehiculo: true);
}

/// Distancia en metros entre dos coordenadas (haversine).
///
/// Se calcula aquí y no con el paquete de mapas para que [encuadrePara] pueda
/// probarse sin arrancar Flutter.
double metrosEntre(double aLat, double aLng, double bLat, double bLng) {
  const r = 6371000.0;
  final dLat = (bLat - aLat) * math.pi / 180;
  final dLng = (bLng - aLng) * math.pi / 180;
  final la1 = aLat * math.pi / 180;
  final la2 = bLat * math.pi / 180;
  final h = math.pow(math.sin(dLat / 2), 2) +
      math.pow(math.sin(dLng / 2), 2) * math.cos(la1) * math.cos(la2);
  return 2 * r * math.asin(math.min(1, math.sqrt(h)));
}
