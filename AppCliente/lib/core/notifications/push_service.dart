import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';

/// Handler de mensajes en segundo plano. Debe ser una función de nivel superior.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  // El sistema muestra la notificación automáticamente cuando viene con bloque
  // `notification`. Aquí solo se podría hacer trabajo extra si hiciera falta.
}

/// Integración de push (Firebase Cloud Messaging).
///
/// Es *tolerante a fallos*: si Firebase no está configurado (faltan
/// `google-services.json` / `GoogleService-Info.plist`), la inicialización no
/// lanza y la app sigue funcionando sin push.
class PushService {
  PushService(this._dio);

  final Dio _dio;
  bool _initialized = false;
  String? _token;

  /// Inicializa Firebase + FCM y registra el token en el backend.
  /// Llamar tras el login del cliente. Seguro de llamar varias veces.
  Future<void> init() async {
    if (_initialized) {
      // Ya inicializado: reasegura el registro del token.
      if (_token != null) await _registerToken(_token!);
      return;
    }

    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('[push] Firebase no configurado, push desactivado: $e');
      return;
    }
    _initialized = true;

    try {
      final messaging = FirebaseMessaging.instance;

      await messaging.requestPermission();
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

      _token = await messaging.getToken();
      if (_token != null) await _registerToken(_token!);

      messaging.onTokenRefresh.listen((t) {
        _token = t;
        _registerToken(t);
      });
    } catch (e) {
      debugPrint('[push] Error configurando FCM: $e');
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/client/devices/register',
        data: {'token': token},
      );
    } catch (_) {
      // Best-effort: si el backend no responde, se reintenta en el próximo init.
    }
  }

  /// Da de baja el token (al cerrar sesión).
  Future<void> unregister() async {
    final token = _token;
    if (token == null) return;
    try {
      await _dio.post<Map<String, dynamic>>(
        '/client/devices/unregister',
        data: {'token': token},
      );
    } catch (_) {
      // no-op
    }
  }
}

final pushServiceProvider = Provider<PushService>(
  (ref) => PushService(ref.read(apiClientProvider)),
);
