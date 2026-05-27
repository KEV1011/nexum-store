/// Backend connection constants.
///
/// Override at build time with --dart-define:
///   flutter build apk --dart-define=API_BASE_URL=https://api.nexum.co
abstract final class ApiConfig {
  /// Base URL for REST API calls.
  /// Default: Android emulator loopback (maps to host machine's localhost).
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// WebSocket URL.
  static const String wsUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://10.0.2.2:3000',
  );
}
