import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/core/errors/exceptions.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import 'package:nexum_driver/features/auth/data/datasources/auth_datasource.dart';
import 'package:nexum_driver/features/auth/domain/entities/driver_entity.dart';
import 'package:nexum_driver/features/auth/domain/repositories/auth_repository.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required AuthDataSource dataSource,
    required FlutterSecureStorage secureStorage,
  })  : _dataSource = dataSource,
        _secureStorage = secureStorage;

  final AuthDataSource _dataSource;
  final FlutterSecureStorage _secureStorage;

  // ── sendOtp ────────────────────────────────────────────────────────────────

  @override
  Future<({bool success, Failure? failure})> sendOtp(
    String phoneNumber,
  ) async {
    try {
      final ok = await _dataSource.sendOtp(phoneNumber);
      return (success: ok, failure: null);
    } on NetworkException catch (e) {
      return (success: false, failure: NetworkFailure(message: e.message));
    } on AppException catch (e) {
      return (success: false, failure: UnexpectedFailure(message: e.message));
    } catch (e) {
      return (success: false, failure: UnexpectedFailure(message: e.toString()));
    }
  }

  // ── verifyOtp ──────────────────────────────────────────────────────────────

  @override
  Future<({DriverEntity? driver, Failure? failure})> verifyOtp({
    required String phoneNumber,
    required String otpCode,
  }) async {
    try {
      final data = await _dataSource.verifyOtp(
        phoneNumber: phoneNumber,
        otpCode: otpCode,
      );

      final token = data['token'] as String;
      await _secureStorage.write(key: AppConstants.authTokenKey, value: token);

      final d = data['driver'] as Map<String, dynamic>;
      final vehicle = d['vehicle'] as Map<String, dynamic>;

      final driver = DriverEntity(
        id: d['id'] as String,
        name: d['name'] as String,
        phone: d['phone'] as String,
        rating: (d['rating'] as num).toDouble(),
        totalTrips: (d['totalTrips'] as num).toInt(),
        vehiclePlate: vehicle['plate'] as String,
        vehicleDescription:
            '${vehicle['brand']} ${vehicle['model']} ${vehicle['year']} · ${vehicle['color']}',
        isVerified: true,
      );
      return (driver: driver, failure: null);
    } on InvalidOtpException {
      return (driver: null, failure: const InvalidOtpFailure());
    } on NetworkException catch (e) {
      return (driver: null, failure: NetworkFailure(message: e.message));
    } on StorageException catch (e) {
      return (driver: null, failure: StorageFailure(message: e.message));
    } on AppException catch (e) {
      return (driver: null, failure: UnexpectedFailure(message: e.message));
    } catch (e) {
      return (driver: null, failure: UnexpectedFailure(message: e.toString()));
    }
  }

  // ── logout ─────────────────────────────────────────────────────────────────

  @override
  Future<void> logout() async {
    await _secureStorage.delete(key: AppConstants.authTokenKey);
  }

  // ── isAuthenticated ────────────────────────────────────────────────────────

  @override
  Future<bool> isAuthenticated() async {
    try {
      final token = await _secureStorage.read(key: AppConstants.authTokenKey);
      return token != null && token.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  // ── getCurrentDriver ───────────────────────────────────────────────────────

  @override
  Future<DriverEntity?> getCurrentDriver() async {
    final authenticated = await isAuthenticated();
    if (!authenticated) return null;
    return null; // Driver data loaded on login; no local cache needed yet.
  }
}
