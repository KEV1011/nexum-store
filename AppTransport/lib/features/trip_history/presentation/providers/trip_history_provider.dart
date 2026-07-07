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
      // Sin conexión: cae al cache local (o semilla en el primer arranque).
    }

    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    final raw = prefs.getStringList(AppConstants.tripHistoryKey);
    if (raw == null) {
      final seed = _buildSeedTrips();
      state = seed;
      unawaited(_persist(seed));
    } else {
      state = raw
          .map(
            (s) => TripModel.fromJson(
              json.decode(s) as Map<String, dynamic>,
            ),
          )
          .toList();
    }
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
        startedAt:
            DateTime.tryParse(j['startedAt'] as String? ?? '') ?? DateTime.now(),
        finishedAt: DateTime.tryParse(j['finishedAt'] as String? ?? '') ??
            DateTime.now(),
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

// ── Seed data (first-launch demo history) ─────────────────────────────────────

List<TripModel> _buildSeedTrips() {
  final now = DateTime.now();

  DateTime ago({int days = 0, int hours = 0}) =>
      now.subtract(Duration(days: days, hours: hours));

  LocationModel loc(String address, double lat, double lng) =>
      LocationModel(latitude: lat, longitude: lng, address: address);

  return [
    TripModel(
      id: 'seed-1042',
      passengerId: 'p-001',
      passengerName: 'Valentina R.',
      origin: loc('Parque Agueda Gallardo', 7.3771, -72.6497),
      destination: loc('Terminal de Transportes', 7.3698, -72.6412),
      distanceKm: 2.3,
      durationMinutes: 8,
      grossFare: 8500,
      netEarning: 7200,
      commission: 1300,
      startedAt: ago(hours: 3),
      finishedAt: ago(hours: 3).add(const Duration(minutes: 8)),
      rating: 5.0,
    ),
    TripModel(
      id: 'seed-1041',
      passengerId: 'p-002',
      passengerName: 'Luis M.',
      origin: loc('Mercado Central', 7.3783, -72.6521),
      destination: loc('Colegio Nacional', 7.3821, -72.6498),
      distanceKm: 1.8,
      durationMinutes: 6,
      grossFare: 6400,
      netEarning: 5800,
      commission: 600,
      startedAt: ago(hours: 6),
      finishedAt: ago(hours: 6).add(const Duration(minutes: 6)),
      rating: 4.8,
    ),
    TripModel(
      id: 'seed-1040',
      passengerId: 'p-003',
      passengerName: 'Carolina P.',
      origin: loc('Droguería La Economía', 7.3762, -72.6512),
      destination: loc('Barrio El Centro', 7.3758, -72.6544),
      distanceKm: 1.2,
      durationMinutes: 5,
      grossFare: 5800,
      netEarning: 5200,
      commission: 600,
      startedAt: ago(days: 1, hours: 7),
      finishedAt: ago(days: 1, hours: 7).add(const Duration(minutes: 5)),
      rating: 5.0,
      isDeliveryTrip: true,
      pickupOrderRef: '#4521',
    ),
    TripModel(
      id: 'seed-1039',
      passengerId: 'p-004',
      passengerName: 'Jorge H.',
      origin: loc('Plaza de Mercado', 7.3779, -72.6505),
      destination: loc('Barrio La Esperanza', 7.3835, -72.6465),
      distanceKm: 3.1,
      durationMinutes: 12,
      grossFare: 10300,
      netEarning: 9300,
      commission: 1000,
      startedAt: ago(days: 1, hours: 14),
      finishedAt: ago(days: 1, hours: 14).add(const Duration(minutes: 12)),
      rating: 4.5,
    ),
    TripModel(
      id: 'seed-1038',
      passengerId: 'p-005',
      passengerName: 'Marcela T.',
      origin: loc('Hospital San Juan de Dios', 7.3742, -72.6476),
      destination: loc('Urbanización El Pinar', 7.3812, -72.6538),
      distanceKm: 2.7,
      durationMinutes: 10,
      grossFare: 9000,
      netEarning: 8100,
      commission: 900,
      startedAt: ago(days: 3, hours: 9),
      finishedAt: ago(days: 3, hours: 9).add(const Duration(minutes: 10)),
      rating: 4.9,
    ),
    TripModel(
      id: 'seed-1037',
      passengerId: 'p-006',
      passengerName: 'Andrés F.',
      origin: loc('Hotel Orquídea', 7.3765, -72.6522),
      destination: loc('Alcaldía Municipal', 7.3773, -72.6508),
      distanceKm: 1.5,
      durationMinutes: 7,
      grossFare: 7100,
      netEarning: 6400,
      commission: 700,
      startedAt: ago(days: 4, hours: 15),
      finishedAt: ago(days: 4, hours: 15).add(const Duration(minutes: 7)),
      rating: 5.0,
    ),
    TripModel(
      id: 'seed-1036',
      passengerId: 'p-007',
      passengerName: 'Claudia V.',
      origin: loc('Centro Comercial Bolívar', 7.3791, -72.6495),
      destination: loc('Barrio Los Pinos', 7.3718, -72.6558),
      distanceKm: 8.4,
      durationMinutes: 22,
      grossFare: 25300,
      netEarning: 22800,
      commission: 2500,
      startedAt: ago(days: 10, hours: 5),
      finishedAt: ago(days: 10, hours: 5).add(const Duration(minutes: 22)),
      rating: 5.0,
    ),
    TripModel(
      id: 'seed-1035',
      passengerId: 'p-008',
      passengerName: 'Sebastián C.',
      origin: loc('Parroquia Jesús de Nazaret', 7.3755, -72.6489),
      destination: loc('Supertiendas Olímpica', 7.3739, -72.6471),
      distanceKm: 1.9,
      durationMinutes: 7,
      grossFare: 6600,
      netEarning: 6000,
      commission: 600,
      startedAt: ago(days: 10, hours: 11),
      finishedAt: ago(days: 10, hours: 11).add(const Duration(minutes: 7)),
      rating: 4.7,
    ),
  ];
}
