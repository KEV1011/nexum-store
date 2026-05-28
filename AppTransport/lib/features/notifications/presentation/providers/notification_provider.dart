import 'package:flutter_riverpod/flutter_riverpod.dart';

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

class NotificationNotifier extends StateNotifier<List<AppNotification>> {
  NotificationNotifier() : super(_initial());

  int get unreadCount => state.where((n) => !n.isRead).length;

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
  (ref) => NotificationNotifier(),
);

List<AppNotification> _initial() {
  final now = DateTime.now();
  return [
    AppNotification(
      id: 'n1',
      type: NotificationType.trip,
      title: 'Viaje completado',
      body: 'Ganaste \$18.500 por el viaje a Barrio Obrero',
      timestamp: now.subtract(const Duration(hours: 2)),
      isRead: true,
    ),
    AppNotification(
      id: 'n2',
      type: NotificationType.payment,
      title: 'Pago acreditado',
      body: '\$18.500 han sido acreditados en tu billetera Nexum',
      timestamp: now.subtract(const Duration(hours: 2, minutes: 1)),
      isRead: true,
    ),
    AppNotification(
      id: 'n3',
      type: NotificationType.document,
      title: 'Documento por vencer',
      body: 'Tu SOAT vence en 30 días. Renuévalo para seguir activo.',
      timestamp: now.subtract(const Duration(hours: 5)),
      isRead: false,
    ),
    AppNotification(
      id: 'n4',
      type: NotificationType.promo,
      title: 'Bono desbloqueado 🎉',
      body: 'Completaste 10 viajes esta semana. +\$15.000 en tu billetera.',
      timestamp: now.subtract(const Duration(days: 1, hours: 3)),
      isRead: false,
    ),
    AppNotification(
      id: 'n5',
      type: NotificationType.trip,
      title: 'Viaje completado',
      body: 'Ganaste \$12.000 por el viaje al Centro de Pamplona',
      timestamp: now.subtract(const Duration(days: 1, hours: 6)),
      isRead: true,
    ),
    AppNotification(
      id: 'n6',
      type: NotificationType.rating,
      title: 'Nueva calificación ⭐',
      body: 'Jorge Martínez te calificó con 5 estrellas. ¡Excelente servicio!',
      timestamp: now.subtract(const Duration(days: 3, hours: 2)),
      isRead: true,
    ),
    AppNotification(
      id: 'n7',
      type: NotificationType.system,
      title: 'Actualización disponible',
      body: 'Nexum Driver 1.1.0 ya está disponible con nuevas funciones.',
      timestamp: now.subtract(const Duration(days: 3, hours: 4)),
      isRead: true,
    ),
    AppNotification(
      id: 'n8',
      type: NotificationType.promo,
      title: 'Meta semanal',
      body: 'Llevas 8 de 15 viajes para el bono de turno completo (\$25.000).',
      timestamp: now.subtract(const Duration(days: 4)),
      isRead: false,
    ),
  ];
}
