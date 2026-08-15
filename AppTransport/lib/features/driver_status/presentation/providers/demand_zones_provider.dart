import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';

/// Una zona operativa con su demanda REAL.
///
/// El multiplicador lo calcula el backend comparando viajes buscando conductor
/// contra conductores en línea dentro de la zona (PostGIS), no el reloj.
class DemandZone {
  const DemandZone({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    required this.multiplier,
    required this.demand,
    required this.supply,
    required this.isSurge,
  });

  factory DemandZone.fromJson(Map<String, dynamic> j) => DemandZone(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? '',
        lat: (j['lat'] as num?)?.toDouble() ?? 0,
        lng: (j['lng'] as num?)?.toDouble() ?? 0,
        multiplier: (j['multiplier'] as num?)?.toDouble() ?? 1,
        demand: (j['demand'] as num?)?.toInt() ?? 0,
        supply: (j['supply'] as num?)?.toInt() ?? 0,
        isSurge: j['isSurge'] as bool? ?? false,
      );

  final String id;
  final String name;
  final double lat;
  final double lng;

  /// 1.0 = tarifa normal. Por encima, recargo por demanda.
  final double multiplier;

  /// Viajes buscando conductor en la zona ahora mismo.
  final int demand;

  /// Conductores en línea en la zona ahora mismo.
  final int supply;

  final bool isSurge;

  /// Porcentaje de recargo redondeado, para pintarlo ("+25%").
  int get recargoPct => ((multiplier - 1) * 100).round();
}

/// Estado del mapa de demanda: distingue cargando, falló y vacío.
///
/// Las tres cosas se veían igual antes —no se veía nada— y el conductor no
/// podía saber si es que no hay demanda o es que la petición se cayó.
class DemandZonesState {
  const DemandZonesState({
    this.zones = const [],
    this.isLoading = false,
    this.error,
    this.cargadoAlgunaVez = false,
  });

  final List<DemandZone> zones;
  final bool isLoading;
  final String? error;
  final bool cargadoAlgunaVez;

  /// La zona más caliente con recargo real, o null si no hay ninguna.
  DemandZone? get masCaliente {
    DemandZone? mejor;
    for (final z in zones) {
      if (!z.isSurge) continue;
      if (mejor == null || z.multiplier > mejor.multiplier) mejor = z;
    }
    return mejor;
  }
}

class DemandZonesNotifier extends StateNotifier<DemandZonesState> {
  DemandZonesNotifier(this._client) : super(const DemandZonesState());

  final DioClient _client;

  Future<void> load() async {
    state = DemandZonesState(
      zones: state.zones,
      isLoading: true,
      cargadoAlgunaVez: state.cargadoAlgunaVez,
    );
    try {
      final res =
          await _client.get<Map<String, dynamic>>('/driver/demand-zones');
      final lista = (res.data?['data'] as List?) ?? const [];
      state = DemandZonesState(
        zones: lista
            .whereType<Map<String, dynamic>>()
            .map(DemandZone.fromJson)
            .toList(),
        cargadoAlgunaVez: true,
      );
    } catch (_) {
      state = DemandZonesState(
        zones: state.zones,
        error: 'No se pudo consultar la demanda.',
        cargadoAlgunaVez: state.cargadoAlgunaVez,
      );
    }
  }
}

final demandZonesProvider =
    StateNotifierProvider<DemandZonesNotifier, DemandZonesState>((ref) {
  return DemandZonesNotifier(DioClient());
});
