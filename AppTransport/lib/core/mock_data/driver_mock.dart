/// Datos mock del conductor para la fase MVP.
///
/// Conductor: Juan Carlos Villamizar Contreras
/// Ciudad: Pamplona, Norte de Santander, Colombia
///
/// NOTA: Estos datos se reemplazarán con datos reales del API
/// cuando exista backend en la siguiente fase.
abstract final class DriverMock {
  // ── Identity ──────────────────────────────────────────────────────────────
  static const String id = 'drv_001';
  static const String name = 'Juan Carlos Villamizar Contreras';
  static const String firstName = 'Juan Carlos';
  static const String lastName = 'Villamizar Contreras';
  static const double rating = 4.87;
  static const int totalTrips = 342;
  static const int totalRatings = 287;

  // ── Contact ───────────────────────────────────────────────────────────────
  static const String phone = '+57 312 456 7890';
  static const String email = 'jcvillamizar@ejemplo.co';

  // ── Document ──────────────────────────────────────────────────────────────
  static const String documentType = 'CC';
  static const String documentNumber = '1.094.847.221';

  // ── Vehicle ───────────────────────────────────────────────────────────────
  static const String vehicleBrand = 'Chevrolet';
  static const String vehicleModel = 'Spark GT';
  static const int vehicleYear = 2020;
  static const String vehiclePlate = 'KGB-742';
  static const String vehicleColor = 'Blanco Perla';
  static const String vehicleType = 'Sedan';

  /// Descripción completa del vehículo para mostrar en la UI.
  static String get vehicleFullName =>
      '$vehicleBrand $vehicleModel $vehicleYear - $vehiclePlate';

  // ── Bank account ──────────────────────────────────────────────────────────
  static const String bankName = 'Bancolombia';
  static const String bankAccountType = 'Ahorros';
  static const String bankAccountNumber = '****4521';

  // ── Media ─────────────────────────────────────────────────────────────────
  /// Placeholder avatar URL (no real storage in mock mode).
  static const String photoUrl =
      'https://ui-avatars.com/api/?name=Juan+Carlos+Villamizar&background=00C853&color=fff&size=200';

  // ── Auth ──────────────────────────────────────────────────────────────────
  /// Fake JWT-style token returned on successful mock OTP verification.
  static const String mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
      'eyJzdWIiOiJkcnZfMDAxIiwibmFtZSI6Ikp1YW4gQ2FybG9zIFZpbGxhbWl6YXIiLCJpYXQiOjE3NDgzMDAwMDB9.'
      'mock_signature_nexum_driver_pamplona';

  // ── Status ────────────────────────────────────────────────────────────────
  static const bool isVerified = true;
  static const bool isActive = true;
  static const String city = 'Pamplona';
  static const String department = 'Norte de Santander';
  static const String country = 'Colombia';
}
