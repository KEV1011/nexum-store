import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/shared/models/location_model.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

class TripHistoryNotifier extends StateNotifier<List<TripModel>> {
  TripHistoryNotifier() : super([]) {
    _load();
  }

  Future<void> _load() async {
    // Historial REAL del backend (viajes COMPLETED del conductor). Alimenta
    // tanto la pantalla de Historial como el desglose de Ganancias.
    try {
      final res =
          await DioClient().get<Map<String, dynamic>>('/earnings/history');
      final list = res.data?['data'] as List<dynamic>?;
      if (list != null && mounted) {
        state = list
            .map((e) => _tripFromApi(e as Map<String, dynamic>))
            .toList();
        unawaited(_persist(state));
        return;
      }
    } catch (_) {
      // Sin conexión: cae al cache local (vacío en el primer arranque).
    }

    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    final raw = prefs.getStringList(AppConstants.tripHistoryKey);
    // Sin backend y sin cache → historial vacío: nada de viajes de demo.
    //
    // VIAJE A VIAJE. Antes era un `map` sobre la lista entera, y FUERA del
    // `try` de arriba —que solo cubre la llamada al backend—: un solo viaje
    // guardado que no se pudiera leer hacía lanzar aquí y el conductor se
    // quedaba sin NINGÚN historial de ganancias. La caché la escribió una
    // versión anterior de la app con su `toJson`, así que basta con que el
    // parser pase a exigir un campo que entonces no se guardaba.
    //
    // La rama del servidor (`_tripFromApi`) ya era tolerante campo a campo;
    // esta era la que no lo era.
    final guardados = <TripModel>[];
    for (final s in raw ?? const <String>[]) {
      try {
        final t = TripModel.fromJson(json.decode(s) as Map<String, dynamic>);
        // Purga los viajes semilla que versiones anteriores dejaron en cache.
        if (t.id.startsWith('seed-')) continue;
        guardados.add(t);
      } catch (_) {
        // Ese viaje no se puede leer; los demás sí.
      }
    }
    // Entre la lectura del disco y aquí el conductor pudo salir de la
    // pantalla: asignar el estado de un notifier ya desechado lanza.
    if (!mounted) return;
    state = guardados;
  }

  /// Mapea el DTO de `/earnings/history` (camelCase) a [TripModel].
  TripModel _tripFromApi(Map<String, dynamic> j) => TripModel(
        id: j['id'] as String? ?? '',
        passengerId: '',
        passengerName: j['passengerName'] as String? ?? 'Pasajero',
        origin: LocationModel(
          latitude: (j['originLat'] as num?)?.toDouble() ?? 0,
          longitude: (j['originLng'] as num?)?.toDouble() ?? 0,
          address: j['originAddress'] as String? ?? '',
        ),
        destination: LocationModel(
          latitude: (j['destLat'] as num?)?.toDouble() ?? 0,
          longitude: (j['destLng'] as num?)?.toDouble() ?? 0,
          address: j['destAddress'] as String? ?? '',
        ),
        distanceKm: (j['distanceKm'] as num?)?.toDouble() ?? 0,
        durationMinutes: (j['durationMinutes'] as num?)?.toInt() ?? 0,
        grossFare: (j['grossFare'] as num?)?.toDouble() ?? 0,
        netEarning: (j['netEarning'] as num?)?.toDouble() ?? 0,
        commission: (j['commission'] as num?)?.toDouble() ?? 0,
        startedAt: fechaDelServidor(j['startedAt']),
        finishedAt: fechaDelServidor(j['finishedAt']),
        rating: (j['rating'] as num?)?.toDouble(),
      );

  /// Recarga el historial desde el backend. Se llama al completar un viaje:
  /// la liquidación (finalFare/netEarning) la calcula el servidor, así que la
  /// verdad se refetchea en lugar de insertar un viaje sintético local.
  Future<void> refresh() => _load();

  Future<void> _persist(List<TripModel> trips) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      AppConstants.tripHistoryKey,
      trips.map((t) => json.encode(t.toJson())).toList(),
    );
  }
}

final tripHistoryProvider =
    StateNotifierProvider<TripHistoryNotifier, List<TripModel>>(
  (ref) => TripHistoryNotifier(),
);
