/// Configuración de conexión al backend Nexum.
///
/// Por defecto apunta al backend de PRODUCCIÓN, para que un APK/web instalado
/// en un dispositivo real funcione sin configuración. Para desarrollo local
/// contra un backend en tu máquina, sobreescribe en tiempo de compilación:
///   Android emulator : --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=WS_BASE_URL=ws://10.0.2.2:3000
///   iOS simulator    : --dart-define=API_BASE_URL=http://localhost:3000  --dart-define=WS_BASE_URL=ws://localhost:3000
///   Dispositivo real : --dart-define=API_BASE_URL=http://<IP-LAN>:3000    --dart-define=WS_BASE_URL=ws://<IP-LAN>:3000
abstract final class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://nexum-api.onrender.com',
  );

  static const String wsUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'wss://nexum-api.onrender.com',
  );
}
