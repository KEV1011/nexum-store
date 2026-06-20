/// Constantes globales de la aplicación Nexum Cliente.
abstract final class AppConstants {
  // Nombre de la app
  static const String appName = 'Nexum Cliente';
  static const String appVersion = '1.0.0';

  // Storage keys
  static const String authTokenKey = 'auth_token';
  static const String ordersStorageKey = 'nexum_orders_v1';
  static const String onboardingCompleteKey = 'onboarding_complete';
  static const String addressesStorageKey = 'nexum_addresses_v1';
  static const String favoritesStorageKey = 'nexum_favorites_v1';

  // OTP mock (hardcoded para fase MVP)
  static const String mockOtpCode = '123456';
  static const int otpLength = 6;
  static const int otpTimeoutSeconds = 60;

  // Solicitud de viaje
  static const int tripRequestTimeoutSeconds = 15;
  static const int minTripRequestIntervalSeconds = 25;
  static const int maxTripRequestIntervalSeconds = 40;

  // Tarifas (en COP)
  static const double baseFareCop = 3500;
  static const double perKmRateCop = 800;
  static const double perMinRateCop = 150;
  static const double minimumFareCop = 5000;

  // Comisión de plataforma
  static const double platformCommissionRate = 0.15; // 15%

  // Tracking de ubicación
  static const int locationBatchIntervalSeconds = 4;
  static const double locationAccuracyMeters = 20;

  // Velocidad promedio urbana Pamplona (km/h)
  static const double averageUrbanSpeedKmh = 25;

  // Timeouts de red. Holgados para tolerar el cold-start del backend (el plan
  // free de Render tarda ~50s en despertar el primer request).
  static const int connectTimeoutMs = 30000;
  static const int receiveTimeoutMs = 60000;

  // Animaciones
  static const Duration shortAnimation = Duration(milliseconds: 200);
  static const Duration mediumAnimation = Duration(milliseconds: 350);
  static const Duration longAnimation = Duration(milliseconds: 500);

  // Border radius
  static const double radiusSmall = 8;
  static const double radiusMedium = 12;
  static const double radiusLarge = 16;
  static const double radiusXLarge = 20;
  static const double radiusCircular = 100;

  // Espaciado
  static const double spacingXS = 4;
  static const double spacingS = 8;
  static const double spacingM = 16;
  static const double spacingL = 24;
  static const double spacingXL = 32;
  static const double spacingXXL = 48;

  // Tamaños mínimos accesibles
  static const double minTouchTarget = 48;

  // Celular mock del conductor
  static const String mockDriverPhone = '+57 312 456 7890';
}
