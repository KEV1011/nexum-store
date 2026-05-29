/// Configuración de conexión al backend Nexum.
///
/// Sobreescribir en tiempo de compilación:
///   flutter build apk --dart-define=API_BASE_URL=https://api.nexum.co
abstract final class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  static const String wsUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://10.0.2.2:3000',
  );
}
