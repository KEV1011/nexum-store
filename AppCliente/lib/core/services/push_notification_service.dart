import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/core/services/push_routing.dart';

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

      // App en segundo plano y el pasajero toca la notificación.
      FirebaseMessaging.onMessageOpenedApp.listen(_abrirDesdeNotificacion);

      // App CERRADA: la notificación que la lanzó. Aquí todavía no hay árbol de
      // widgets (init() corre antes de runApp()), por eso se navega en diferido.
      final inicial = await FirebaseMessaging.instance.getInitialMessage();
      if (inicial != null) _abrirDesdeNotificacion(inicial);

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

  /// Lleva al pasajero a donde la notificación promete llevarlo.
  ///
  /// Antes esto no existía: tocar «Tu conductor llegó» abría la app en la
  /// pantalla en la que se hubiera quedado, y el usuario tenía que ir a buscar
  /// su viaje con el taxi esperando en la puerta.
  void _abrirDesdeNotificacion(RemoteMessage msg) {
    final ruta = rutaDeNotificacion(msg.data);
    if (ruta == null) return;
    unawaited(_navegarCuandoSePueda(ruta));
  }

  /// Navega en cuanto haya árbol de widgets, y se rinde en silencio si no llega.
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
