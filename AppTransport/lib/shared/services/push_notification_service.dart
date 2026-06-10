import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Background handler — debe ser top-level o static para FCM.
@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('[FCM-BG] ${message.messageId} → ${message.notification?.title}');
}

/// Firebase Cloud Messaging + local notifications service.
///
/// Initialization order (call from main.dart before runApp):
///   await Firebase.initializeApp();
///   await PushNotificationService().init();
class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService _instance = PushNotificationService._();
  factory PushNotificationService() => _instance;

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  String? _fcmToken;

  /// Last known FCM token (null until init completes).
  String? get fcmToken => _fcmToken;

  // ── init ────────────────────────────────────────────────────────────────────

  Future<void> init() async {
    if (_initialized || kIsWeb) return;

    try {
      // Request permission (Android 13+ requires runtime permission)
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[FCM] Permission denied');
        return;
      }

      // Local notifications channel
      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
      );

      // Background handler
      FirebaseMessaging.onBackgroundMessage(_firebaseBgHandler);

      // Foreground handler — show local notification
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);

      _fcmToken = await FirebaseMessaging.instance.getToken();
      debugPrint('[FCM] Token obtained: ${_fcmToken != null}');

      // Keep backend in sync when FCM rotates the token.
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        _fcmToken = newToken;
        syncTokenToBackend();
      });

      _initialized = true;
    } catch (e) {
      debugPrint('[FCM] init failed: $e');
    }
  }

  // ── syncTokenToBackend ──────────────────────────────────────────────────────

  Future<void> syncTokenToBackend() async {
    if (kIsWeb || _fcmToken == null) return;
    try {
      await DioClient().put<Map<String, dynamic>>(
        '/driver/fcm-token',
        data: {'token': _fcmToken},
      );
      debugPrint('[FCM] Token synced to backend');
    } catch (e) {
      debugPrint('[FCM] Token sync failed: $e');
    }
  }

  // ── Foreground handler ──────────────────────────────────────────────────────

  void _onForegroundMessage(RemoteMessage msg) {
    final n = msg.notification;
    if (n == null) return;

    _local.show(
      msg.hashCode,
      n.title,
      n.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'nexum_trips',
          'Solicitudes de viaje',
          channelDescription: 'Alertas de nuevas solicitudes de viaje',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }
}
