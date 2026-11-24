import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:nexum_driver/core/voces/canales_voz.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/core/network/dio_client.dart';
import 'package:nexum_driver/shared/services/opciones_firebase.dart';
import 'package:nexum_driver/shared/services/push_routing.dart';

/// Background handler — debe ser top-level o static para FCM.
@pragma('vm:entry-point')
Future<void> _firebaseBgHandler(RemoteMessage message) async {
  // Las MISMAS opciones que en main(): este manejador corre en otro isolate y
  // en iPhone, sin ellas, Firebase no tiene con qué arrancar.
  await Firebase.initializeApp(options: opcionesFirebase());
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
      // Solo Android pinta notificaciones locales. En iPhone las muestra el
      // sistema, y además `initialize` sin ajustes de iOS LANZA (el plugin
      // hace `iOS!`): `init()` se cortaba aquí, antes de pedir el token, y
      // ningún aviso llegaba nunca. Tampoco se configura para iOS a propósito:
      // al inicializarse se registra como delegado de las notificaciones y
      // puede quitarle a FCM el «tocar el aviso».
      if (!_esIos) {
        await _local.initialize(
          const InitializationSettings(
            android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          ),
        );
        // Un canal por frase hablada: el servidor manda cada aviso con voz
        // al suyo. Crearlo de nuevo no hace nada si ya existe.
        final android = _local.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        for (final canal in canalesDeVoz()) {
          await android?.createNotificationChannel(canal);
        }
      }

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

      if (_esIos) {
        // En iPhone el aviso entra por APNs, y FCM no da token hasta tener el
        // de APNs: pedirlo antes LANZA (`apns-token-not-set`) y cortaba
        // `init()`. Se espera aparte para no retrasar el arranque de la app.
        await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
        unawaited(_tokenCuandoLlegueApns());
      } else {
        _fcmToken = await FirebaseMessaging.instance.getToken();
        debugPrint('[FCM] Token obtained: ${_fcmToken != null}');
      }

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

  static bool get _esIos =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  /// En iPhone: espera el token de APNs (unos segundos tras el arranque) y
  /// entonces pide el de FCM. Si no llega en 30 s se rinde en silencio:
  /// cuando por fin llegue, FCM lo anuncia por `onTokenRefresh`, que ya está
  /// escuchando.
  Future<void> _tokenCuandoLlegueApns() async {
    try {
      for (var i = 0; i < 30; i++) {
        if (await FirebaseMessaging.instance.getAPNSToken() != null) {
          _fcmToken = await FirebaseMessaging.instance.getToken();
          debugPrint('[FCM] Token obtained: ${_fcmToken != null}');
          // Sin sesión no registra nada; el home lo vuelve a intentar.
          await syncTokenToBackend();
          return;
        }
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      debugPrint('[FCM] APNs no entregó token todavía');
    } catch (e) {
      debugPrint('[FCM] token iOS: $e');
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
    // En iPhone la muestra el sistema (ver
    // `setForegroundNotificationPresentationOptions` en `init`): pintarla
    // también aquí la duplicaría.
    if (_esIos) return;
    final n = msg.notification;
    if (n == null) return;

    // Con la app abierta la pinta la app: si el aviso trae voz, en SU canal,
    // que es el que la hace sonar.
    final voz = canalDeVozDe(n.android?.channelId);
    if (voz != null) {
      _local.show(
        msg.hashCode,
        n.title,
        n.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            voz,
            'Voz',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
      );
      return;
    }

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
