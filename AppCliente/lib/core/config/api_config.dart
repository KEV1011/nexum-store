/// Configuración de conexión al backend Nexum.
///
/// Sobreescribir en tiempo de compilación con --dart-define:
///   Android emulator : API_BASE_URL=http://10.0.2.2:3000
///   iOS simulator    : API_BASE_URL=http://localhost:3000  (default)
///   Dispositivo real : API_BASE_URL=http://<IP-LAN-de-tu-Mac>:3000
///
/// Ejemplo:
///   flutter run \
///     --dart-define=API_BASE_URL=http://192.168.1.42:3000 \
///     --dart-define=WS_BASE_URL=ws://192.168.1.42:3000
abstract final class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static const String wsUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:3000',
  );
}
