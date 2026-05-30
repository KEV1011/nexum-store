/// Configuración de conexión al backend Nexum.
///
/// Sobreescribir en tiempo de compilación con --dart-define:
///   Android emulator : API_BASE_URL=http://10.0.2.2:3000
///   Android emulator : API_BASE_URL=http://10.0.2.2:3000  (default)
///   iOS simulator    : API_BASE_URL=http://localhost:3000
///   Dispositivo real : API_BASE_URL=http://<IP-LAN>:3000
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
