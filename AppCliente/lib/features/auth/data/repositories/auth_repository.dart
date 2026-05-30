import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/core/errors/exceptions.dart';
import 'package:nexum_client/core/errors/failures.dart';
import 'package:nexum_client/features/auth/data/datasources/auth_datasource.dart';
import 'package:nexum_client/features/auth/domain/entities/client_entity.dart';

/// Repositorio de autenticación — traduce excepciones en [Failure].
class AuthRepository {
  AuthRepository({
    required this._dataSource,
    required FlutterSecureStorage secureStorage,
  })  : _storage = secureStorage;

  final AuthDataSource _dataSource;
  final FlutterSecureStorage _storage;

  static const _clientJsonKey = 'client_profile_json';

  Future<({bool success, Failure? failure})> sendOtp(String phone) async {
    try {
      final ok = await _dataSource.sendOtp(phone);
      return (success: ok, failure: null);
    } on NetworkException catch (e) {
      return (success: false, failure: NetworkFailure(message: e.message));
    } on AppException catch (e) {
      return (
        success: false,
        failure: UnexpectedFailure(message: e.message),
      );
    } catch (e) {
      return (
        success: false,
        failure: UnexpectedFailure(message: e.toString()),
      );
    }
  }

  Future<({ClientEntity? client, Failure? failure})> verifyOtp({
    required String phone,
    required String otpCode,
  }) async {
    try {
      final data = await _dataSource.verifyOtp(
        phoneNumber: phone,
        otpCode: otpCode,
      );

      final token = data['token'] as String;
      await _storage.write(key: AppConstants.authTokenKey, value: token);

      final c = data['client'] as Map<String, dynamic>;
      final client = ClientEntity(
        id: c['id'] as String,
        phone: c['phone'] as String,
        name: c['name'] as String? ?? 'Usuario Nexum',
      );

      // Persist profile so checkAuth() can restore it without an API call.
      await _storage.write(
        key: _clientJsonKey,
        value: jsonEncode({'id': client.id, 'phone': client.phone, 'name': client.name}),
      );

      return (client: client, failure: null);
    } on InvalidOtpException {
      return (client: null, failure: const InvalidOtpFailure());
    } on NetworkException catch (e) {
      return (client: null, failure: NetworkFailure(message: e.message));
    } on StorageException catch (e) {
      return (client: null, failure: StorageFailure(message: e.message));
    } on AppException catch (e) {
      return (
        client: null,
        failure: UnexpectedFailure(message: e.message),
      );
    } catch (e) {
      return (
        client: null,
        failure: UnexpectedFailure(message: e.toString()),
      );
    }
  }

  Future<void> logout() async {
    await _storage.delete(key: AppConstants.authTokenKey);
    await _storage.delete(key: _clientJsonKey);
  }

  Future<ClientEntity?> getStoredClient() async {
    try {
      final json = await _storage.read(key: _clientJsonKey);
      if (json == null) return null;
      final map = jsonDecode(json) as Map<String, dynamic>;
      return ClientEntity(
        id: map['id'] as String,
        phone: map['phone'] as String,
        name: map['name'] as String? ?? 'Usuario Nexum',
      );
    } catch (_) {
      return null;
    }
  }

  Future<bool> isAuthenticated() async {
    try {
      final token = await _storage.read(key: AppConstants.authTokenKey);
      return token != null && token.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<String?> readToken() async {
    try {
      return _storage.read(key: AppConstants.authTokenKey);
    } catch (_) {
      return null;
    }
  }
}
