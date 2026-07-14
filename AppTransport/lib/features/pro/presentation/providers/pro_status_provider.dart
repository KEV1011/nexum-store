import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';

/// Nivel Nexum Pro del conductor, calculado por el backend con datos 100 %
/// reales (`GET /driver/pro-status`): servicios liquidados + calificación.
class ProLevelDef {
  const ProLevelDef({
    required this.level,
    required this.label,
    required this.minServices,
    required this.minRating,
    required this.perks,
  });

  factory ProLevelDef.fromJson(Map<String, dynamic> json) => ProLevelDef(
        level: json['level'] as String? ?? 'BRONCE',
        label: json['label'] as String? ?? 'Bronce',
        minServices: (json['minServices'] as num?)?.toInt() ?? 0,
        minRating: (json['minRating'] as num?)?.toDouble() ?? 0,
        perks: (json['perks'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList(),
      );

  final String level;
  final String label;
  final int minServices;
  final double minRating;
  final List<String> perks;
}

class ProNextLevel {
  const ProNextLevel({
    required this.label,
    required this.servicesNeeded,
    required this.minRating,
    required this.progress,
  });

  factory ProNextLevel.fromJson(Map<String, dynamic> json) => ProNextLevel(
        label: json['label'] as String? ?? '',
        servicesNeeded: (json['servicesNeeded'] as num?)?.toInt() ?? 0,
        minRating: (json['minRating'] as num?)?.toDouble() ?? 0,
        progress: (json['progress'] as num?)?.toDouble() ?? 0,
      );

  final String label;
  final int servicesNeeded;
  final double minRating;
  final double progress;
}

class ProStatus {
  const ProStatus({
    required this.level,
    required this.levelLabel,
    required this.rating,
    required this.totalServices,
    required this.monthServices,
    required this.levels,
    this.next,
  });

  factory ProStatus.fromJson(Map<String, dynamic> json) => ProStatus(
        level: json['level'] as String? ?? 'BRONCE',
        levelLabel: json['levelLabel'] as String? ?? 'Bronce',
        rating: (json['rating'] as num?)?.toDouble() ?? 5.0,
        totalServices: (json['totalServices'] as num?)?.toInt() ?? 0,
        monthServices: (json['monthServices'] as num?)?.toInt() ?? 0,
        next: json['next'] is Map<String, dynamic>
            ? ProNextLevel.fromJson(json['next'] as Map<String, dynamic>)
            : null,
        levels: (json['levels'] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(ProLevelDef.fromJson)
            .toList(),
      );

  final String level;
  final String levelLabel;
  final double rating;
  final int totalServices;
  final int monthServices;
  final ProNextLevel? next;
  final List<ProLevelDef> levels;
}

class ProStatusState {
  const ProStatusState({this.status, this.isLoading = false, this.error});

  final ProStatus? status;
  final bool isLoading;
  final String? error;

  ProStatusState copyWith({
    ProStatus? status,
    bool? isLoading,
    String? error,
  }) =>
      ProStatusState(
        status: status ?? this.status,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

class ProStatusNotifier extends StateNotifier<ProStatusState> {
  ProStatusNotifier(this._client) : super(const ProStatusState());

  final DioClient _client;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final res =
          await _client.get<Map<String, dynamic>>('/driver/pro-status');
      final data = res.data?['data'] as Map<String, dynamic>?;
      if (!mounted) return;
      if (data == null) {
        state = state.copyWith(
          isLoading: false,
          error: 'No se pudo cargar tu nivel. Intenta de nuevo.',
        );
        return;
      }
      state = state.copyWith(status: ProStatus.fromJson(data), isLoading: false);
    } catch (_) {
      if (!mounted) return;
      state = state.copyWith(
        isLoading: false,
        error: 'Sin conexión. Desliza para reintentar.',
      );
    }
  }
}

final proStatusProvider =
    StateNotifierProvider<ProStatusNotifier, ProStatusState>((ref) {
  return ProStatusNotifier(DioClient());
});
