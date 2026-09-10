import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/shared/services/push_routing.dart';

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

      // App en segundo plano y el conductor toca la notificación.
      FirebaseMessaging.onMessageOpenedApp.listen(_abrirDesdeNotificacion);

      // App CERRADA: la notificación que la lanzó. Se consulta una sola vez y
      // se navega en cuanto el árbol esté montado — aquí todavía no lo está,
      // porque init() corre antes de runApp().
      final inicial = await FirebaseMessaging.instance.getInitialMessage();
      if (inicial != null) _abrirDesdeNotificacion(inicial);

      _fcmToken = await FirebaseMessaging.instance.getToken();
      debugPrint('[FCM] Token obtained: ${_fcmToken != null}');

      // Si FCM rota el token, re-registrarlo en el backend.
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        _fcmToken = token;
        syncTokenToBackend();
      });

      _initialized = true;
    } catch (e) {
      debugPrint('[FCM] init failed: $e');
    }
  }

  /// Registra el token del dispositivo en el backend (PUT /driver/fcm-token).
  ///
  /// Llamar cuando hay sesión activa (p. ej. al entrar al home). Falla en
  /// silencio: sin token FCM o sin sesión simplemente no registra.
  Future<void> syncTokenToBackend() async {
    final token = _fcmToken;
    if (token == null || token.isEmpty) return;
    try {
      await DioClient().put<Map<String, dynamic>>(
        '/driver/fcm-token',
        data: {'token': token},
      );
      debugPrint('[FCM] Token registered with backend');
    } catch (_) {
      // Sin sesión o sin red: se reintentará en el próximo arranque del home.
    }
  }

  // ── Al tocar la notificación ────────────────────────────────────────────────

  /// Lleva al conductor a donde la notificación promete llevarlo.
  ///
  /// Antes esto no existía: la notificación abría la app donde se hubiera
  /// quedado y el conductor tenía que buscarse la vida, con la mano en el
  /// volante.
  void _abrirDesdeNotificacion(RemoteMessage msg) {
    final ruta = rutaDeNotificacion(msg.data);
    if (ruta == null) return;
    unawaited(_navegarCuandoSePueda(ruta));
  }

  /// Navega en cuanto haya árbol de widgets.
  ///
  /// Con la app cerrada, `getInitialMessage()` responde antes de `runApp()`, así
  /// que no hay `context` todavía. Se reintenta un rato corto y se abandona en
  /// silencio: quedarse esperando para siempre a un árbol que no llega (login
  /// pendiente, arranque fallido) sería peor que no navegar.
  Future<void> _navegarCuandoSePueda(String ruta) async {
    for (var i = 0; i < 20; i++) {
      final ctx = rootNavigatorKey.currentContext;
      if (ctx != null && ctx.mounted) {
        ctx.go(ruta);
        return;
      }
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    debugPrint('[FCM] No se pudo abrir $ruta: la app no llegó a montarse');
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
