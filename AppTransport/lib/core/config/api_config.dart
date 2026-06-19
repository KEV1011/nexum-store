/// Backend connection constants.
///
/// Por defecto apunta a PRODUCCIÓN para que el APK instalado funcione sin
/// configuración. Para desarrollo local, sobreescribe en tiempo de compilación:
///   --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=WS_BASE_URL=ws://10.0.2.2:3000
abstract final class ApiConfig {
  /// Base URL for REST API calls.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://nexum-api.onrender.com',
  );

  /// WebSocket URL.
  static const String wsUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'wss://nexum-api.onrender.com',
  );
}
