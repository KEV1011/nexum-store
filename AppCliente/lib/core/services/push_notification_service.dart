import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Background handler — debe ser top-level o static para FCM.
@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('[FCM-BG] ${message.messageId} → ${message.notification?.title}');
}

/// Firebase Cloud Messaging + notificaciones locales (app cliente).
///
/// Orden de inicialización (desde main.dart, antes de runApp):
///   await Firebase.initializeApp();
///   await PushNotificationService().init();
class PushNotificationService {
  factory PushNotificationService() => _instance;
  PushNotificationService._();
  static final PushNotificationService _instance =
      PushNotificationService._();

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  String? _fcmToken;

  /// Último token FCM conocido (null hasta que init termina).
  String? get fcmToken => _fcmToken;

  /// Dio autenticado para re-registrar el token cuando FCM lo rota.
  /// Lo fija AuthNotifier al iniciar sesión.
  Dio? _dio;

  // ── init ────────────────────────────────────────────────────────────────────

  Future<void> init() async {
    if (_initialized || kIsWeb) return;

    try {
      // Android 13+ exige permiso de notificaciones en runtime.
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

      _fcmToken = await FirebaseMessaging.instance.getToken();
      debugPrint('[FCM] Token obtained: ${_fcmToken != null}');

      // Si FCM rota el token, re-registrarlo en el backend.
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        _fcmToken = token;
        final dio = _dio;
        if (dio != null) syncTokenToBackend(dio);
      });

      _initialized = true;
    } catch (e) {
      debugPrint('[FCM] init failed: $e');
    }
  }

  /// Registra el token del dispositivo en el backend
  /// (PUT /client/fcm-token, requiere sesión activa).
  ///
  /// Llamar tras autenticarse. Falla en silencio: sin token FCM o sin red
  /// simplemente no registra y se reintenta en el próximo login/arranque.
  Future<void> syncTokenToBackend(Dio dio) async {
    _dio = dio;
    final token = _fcmToken;
    if (token == null || token.isEmpty) return;
    try {
      await dio.put<Map<String, dynamic>>(
        '/client/fcm-token',
        data: {'token': token},
      );
      debugPrint('[FCM] Token registered with backend');
    } on DioException {
      // Sin sesión o sin red: se reintentará en el próximo arranque.
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
          'nexum_client',
          'Notificaciones ZIPA',
          channelDescription:
              'Estado de tus viajes, pedidos, pagos y promociones',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }
}
