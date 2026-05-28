/// Common interface for auth datasources (mock and remote).
abstract class AuthDataSource {
  Future<bool> sendOtp(String phoneNumber);

  /// Returns `{ token: String, driver: Map<String, dynamic> }` on success.
  /// Throws [InvalidOtpException] on wrong OTP.
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  });
}
