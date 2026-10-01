/// ETA en vivo: cuánto falta AHORA, no cuánto faltaba al reservar.
///
/// El ETA del servidor se calcula una vez, al pedir el viaje, y se queda ahí:
/// el pasajero veía «9 min» cuando el conductor ya estaba doblando su calle, y
/// también cuando aún no había arrancado. Un número que no se mueve deja de
/// leerse a los dos minutos.
///
/// **No trae una fórmula de tarifas ni de velocidad propia.** Con el pasajero a
/// bordo, escala el ETA que dio el servidor por la fracción de trayecto que
/// queda, así que hereda su medición —incluido el factor de calle y, si hay
/// llave de Google, la ruta real— sin duplicar ninguna constante:
///
///     etaVivo = etaServidor × (distancia_hasta_el_destino / distancia_total)
///
/// De camino a recoger es otra cosa: ese tramo no está en la distancia del
/// viaje (que va del origen al destino), así que ahí sí hace falta una
/// velocidad. Es la única constante y está anotada de dónde sale.
library;

import 'package:latlong2/latlong.dart';

/// Velocidad urbana de referencia, en km/h.
///
/// Espeja `VELOCIDAD_URBANA_KMH` de `backend/src/services/trip-options.service.ts`.
/// Si allí cambia, cambia aquí: son dos lenguajes, no hay forma de compartirla.
const double kVelocidadUrbanaKmh = 22;

/// Factor de calle: la vía real siempre es más larga que la línea recta.
///
/// Espeja `FACTOR_CALLE` del mismo archivo del backend.
const double kFactorCalle = 1.3;

const Distance _distancia = Distance();

/// Minutos que faltan, o null si no se puede saber (sin posición del conductor).
///
/// [destino] es a dónde va el conductor AHORA: el punto de recogida mientras va
/// por el pasajero, y el destino del viaje cuando ya lo lleva.
///
/// [etaTotalMin] y [distanciaTotalKm] son los del servidor. Cuando los dos
/// están y el viaje ya arrancó, se usa la proporción; si no, la velocidad.
int? etaEnVivoMin({
  required LatLng? conductor,
  required LatLng? destino,
  required bool aBordo,
  int? etaTotalMin,
  double? distanciaTotalKm,
}) {
  if (conductor == null || destino == null) return null;

  final restanteKm = _distancia.as(LengthUnit.Kilometer, conductor, destino);
  if (!restanteKm.isFinite || restanteKm < 0) return null;

  // Con el pasajero a bordo: la proporción del ETA del servidor.
  if (aBordo &&
      etaTotalMin != null &&
      etaTotalMin > 0 &&
      distanciaTotalKm != null &&
      distanciaTotalKm > 0.1) {
    // La distancia del servidor ya lleva el factor de calle; la recta que
    // acabamos de medir, no. Se le aplica para comparar peras con peras.
    final restantePorCalle = restanteKm * kFactorCalle;
    final fraccion = (restantePorCalle / distanciaTotalKm).clamp(0.0, 1.0);
    return _almenosUno(etaTotalMin * fraccion);
  }

  // De camino a recoger (o sin datos del servidor): velocidad de referencia.
  final km = restanteKm * kFactorCalle;
  return _almenosUno(km / kVelocidadUrbanaKmh * 60);
}

/// Nunca «0 min»: mientras no haya llegado, queda al menos un minuto. Un cero
/// en pantalla se lee como «ya está aquí» y hace salir a la calle a nadie.
int _almenosUno(double minutos) {
  if (!minutos.isFinite) return 1;
  final r = minutos.round();
  return r < 1 ? 1 : r;
}
