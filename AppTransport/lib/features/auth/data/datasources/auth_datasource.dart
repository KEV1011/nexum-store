/// Common interface for auth datasources (mock and remote).
abstract class AuthDataSource {
  Future<bool> sendOtp(String phoneNumber);

  /// Returns `{ token, driver, isRegistered }` on success.
  /// Throws [InvalidOtpException] on wrong OTP.
  Future<Map<String, dynamic>> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  });

  /// Registers a new driver (legacy OTP flow).
  /// Returns `{ token, driver, isRegistered }` on success.
  Future<Map<String, dynamic>> registerDriver(Map<String, dynamic> data);

  // ── Identifier-based auth (new progressive flow) ─────────────────────────

  /// Checks whether an identifier (email or phone) already has an account.
  /// Returns `{ exists, role?, status? }`.
  Future<({bool exists, String? role, String? status})> checkIdentifier(
    String identifier,
  );

  /// Authenticates with identifier + password.
  /// Returns `{ token, driver }` on success.
  /// Throws [AuthException] on wrong credentials.
  Future<Map<String, dynamic>> loginWithPassword({
    required String identifier,
    required String password,
  });

  /// Registers a new account for the given role.
  /// Returns `{ token, driver }` on success.
  Future<Map<String, dynamic>> registerWithRole({
    required String identifier,
    required String password,
    required String role,
    required Map<String, dynamic> profileData,
  });
}
