import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexum_driver/core/network/dio_client.dart';

enum NotificationType { trip, payment, document, promo, system, rating }

class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.timestamp,
    this.isRead = false,
  });

  final String id;
  final NotificationType type;
  final String title;
  final String body;
  final DateTime timestamp;
  final bool isRead;

  AppNotification copyWith({bool? isRead}) => AppNotification(
        id: id,
        type: type,
        title: title,
        body: body,
        timestamp: timestamp,
        isRead: isRead ?? this.isRead,
      );
}

/// Feed de notificaciones del conductor.
///
/// Carga el feed REAL del backend (`GET /driver/notifications`), derivado de los
/// viajes completados, retiros y documentos del conductor. El estado "leído" se
/// gestiona localmente (el backend no lo persiste).
class NotificationNotifier extends StateNotifier<List<AppNotification>> {
  NotificationNotifier(this._client) : super(const []) {
    _load();
  }

  final DioClient _client;

  int get unreadCount => state.where((n) => !n.isRead).length;

  Future<void> _load() async {
    try {
      final res =
          await _client.get<Map<String, dynamic>>('/driver/notifications');
      final list = res.data?['data'] as List<dynamic>?;
      if (list == null || !mounted) return;
      state = list
          .map((e) => _fromDto(e as Map<String, dynamic>))
          .toList(growable: false);
    } catch (_) {
      // Sin conexión: el feed queda vacío (la pantalla muestra su estado vacío).
    }
  }

  /// Recarga el feed desde el backend.
  Future<void> refresh() => _load();

  AppNotification _fromDto(Map<String, dynamic> d) => AppNotification(
        id: d['id'] as String? ?? '',
        type: _typeFromString(d['type'] as String?),
        title: d['title'] as String? ?? '',
        body: d['body'] as String? ?? '',
        timestamp:
            DateTime.tryParse(d['timestamp'] as String? ?? '') ?? DateTime.now(),
      );

  NotificationType _typeFromString(String? raw) => switch (raw) {
        'trip' => NotificationType.trip,
        'payment' => NotificationType.payment,
        'document' => NotificationType.document,
        'promo' => NotificationType.promo,
        'rating' => NotificationType.rating,
        _ => NotificationType.system,
      };

  void markAsRead(String id) {
    state = [
      for (final n in state)
        if (n.id == id) n.copyWith(isRead: true) else n,
    ];
  }

  void markAllAsRead() {
    state = [for (final n in state) n.copyWith(isRead: true)];
  }

  void remove(String id) {
    state = state.where((n) => n.id != id).toList();
  }

  void clearAll() {
    state = [];
  }

  void add(AppNotification notification) {
    state = [notification, ...state];
  }
}

final notificationProvider =
    StateNotifierProvider<NotificationNotifier, List<AppNotification>>(
  (ref) => NotificationNotifier(DioClient()),
);
