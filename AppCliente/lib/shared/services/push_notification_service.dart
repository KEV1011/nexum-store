import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('[FCM-BG] ${message.messageId} → ${message.notification?.title}');
}

class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService _instance = PushNotificationService._();
  factory PushNotificationService() => _instance;

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  String? _fcmToken;

  String? get fcmToken => _fcmToken;

  Future<void> init() async {
    if (_initialized || kIsWeb) return;

    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[FCM] Permission denied');
        return;
      }

      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
      );

      FirebaseMessaging.onBackgroundMessage(_firebaseBgHandler);
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);
      FirebaseMessaging.instance.onTokenRefresh.listen((_token) {
        _fcmToken = _token;
        debugPrint('[FCM] Token refreshed');
      });

      _fcmToken = await FirebaseMessaging.instance.getToken();
      debugPrint('[FCM] Token obtained: ${_fcmToken != null}');

      _initialized = true;
    } catch (e) {
      debugPrint('[FCM] init failed: $e');
    }
  }

  Future<void> syncTokenToBackend(Dio dio) async {
    if (_fcmToken == null) return;
    try {
      await dio.put('/client/fcm-token', data: {'token': _fcmToken});
    } catch (e) {
      debugPrint('[FCM] syncToken failed: $e');
    }
  }

  void _onForegroundMessage(RemoteMessage msg) {
    final n = msg.notification;
    if (n == null) return;
    _local.show(
      msg.hashCode,
      n.title,
      n.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'nexum_alerts',
          'Alertas Nexum',
          channelDescription: 'Notificaciones de viajes y pedidos',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }
}

final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) {
  return PushNotificationService();
});
