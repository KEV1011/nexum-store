import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;

/// Backend connection constants.
///
/// - En **debug** (flutter run / Android Studio) apunta por defecto al backend
///   LOCAL del emulador Android (`10.0.2.2` = localhost del host). Es el flujo
///   de desarrollo normal: levantas el backend en tu máquina y corres la app.
/// - En **release** (APK publicado) apunta por defecto a PRODUCCIÓN, para que
///   el APK instalado en un dispositivo real funcione sin configuración.
///
/// Cualquiera se puede sobreescribir en tiempo de compilación:
///   --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=WS_BASE_URL=ws://10.0.2.2:3000
abstract final class ApiConfig {
  static const String _prodBase = 'https://nexum-api-trxr.onrender.com';
  static const String _prodWs = 'wss://nexum-api-trxr.onrender.com';
  // En debug local: web/escritorio usan localhost; el emulador Android usa
  // 10.0.2.2 (su alias para el localhost del host).
  static const String _devBase =
      kIsWeb ? 'http://localhost:3000' : 'http://10.0.2.2:3000';
  static const String _devWs =
      kIsWeb ? 'ws://localhost:3000' : 'ws://10.0.2.2:3000';

  /// Base URL for REST API calls.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: kDebugMode ? _devBase : _prodBase,
  );

  /// WebSocket URL.
  static const String wsUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: kDebugMode ? _devWs : _prodWs,
  );

  /// Resuelve URLs que el backend devuelve relativas (p. ej. `/uploads/...`
  /// cuando guarda en disco) a absolutas contra [baseUrl]. Las de S3/R2 ya
  /// vienen absolutas y pasan intactas.
  static String resolveUrl(String url) =>
      url.startsWith('http') ? url : '$baseUrl$url';
}
