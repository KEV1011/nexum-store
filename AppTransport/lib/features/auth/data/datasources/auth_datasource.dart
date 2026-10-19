/// Common interface for auth datasources (mock and remote).
abstract class AuthDataSource {
  Future<bool> sendOtp(String phoneNumber);

  /// Returns `{ token: String, driver: Map<String, dynamic> }` on success.
  /// Throws [InvalidOtpException] on wrong OTP.
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  });

  /// Termina un ingreso que pidió la clave personal (`needsPin`).
  /// Devuelve lo mismo que [verifyOtp].
  Future<Map<String, dynamic>> verifyPin({
    required String pinTicket,
    required String pin,
  });

  /// Registers a new driver.
  /// Returns `{ token: String, driver: Map<String, dynamic>, isRegistered: bool }` on success.
  /// Throws [ServerException] on failure.
  Future<Map<String, dynamic>> registerDriver(Map<String, dynamic> data);
}
