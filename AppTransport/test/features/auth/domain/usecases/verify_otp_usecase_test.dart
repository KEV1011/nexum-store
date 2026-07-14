import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import '../../../../support/auth_mock_datasource.dart';
import 'package:nexum_driver/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:nexum_driver/features/auth/domain/usecases/verify_otp_usecase.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('VerifyOtpUseCase', () {
    late VerifyOtpUseCase useCase;
    late AuthRepositoryImpl repository;

    setUp(() {
      // Sin plataforma nativa en tests: usa el almacén en memoria del plugin.
      FlutterSecureStorage.setMockInitialValues({});
      const storage = FlutterSecureStorage();
      final dataSource = AuthMockDataSource();
      repository = AuthRepositoryImpl(
        dataSource: dataSource,
        secureStorage: storage,
      );
      useCase = VerifyOtpUseCase(repository);
    });

    test('OTP válido "123456" retorna DriverEntity', () async {
      final result = await useCase.call(
        phoneNumber: '+573124567890',
        otpCode: '123456',
      );

      expect(result.driver, isNotNull);
      expect(result.failure, isNull);
      expect(result.driver!.name, contains('Juan Carlos'));
    });

    test('OTP inválido "000000" retorna InvalidOtpFailure', () async {
      final result = await useCase.call(
        phoneNumber: '+573124567890',
        otpCode: '000000',
      );

      expect(result.driver, isNull);
      expect(result.failure, isNotNull);
      expect(result.failure, isA<InvalidOtpFailure>());
    });

    test('OTP incompleto (< 6 dígitos) retorna AuthFailure', () async {
      final result = await useCase.call(
        phoneNumber: '+573124567890',
        otpCode: '123',
      );

      expect(result.driver, isNull);
      expect(result.failure, isNotNull);
      expect(result.failure, isA<AuthFailure>());
    });

    test('OTP vacío retorna AuthFailure', () async {
      final result = await useCase.call(
        phoneNumber: '+573124567890',
        otpCode: '',
      );

      expect(result.driver, isNull);
      expect(result.failure, isA<AuthFailure>());
    });

    test('OTP de 7 dígitos retorna AuthFailure', () async {
      final result = await useCase.call(
        phoneNumber: '+573124567890',
        otpCode: '1234567',
      );

      expect(result.driver, isNull);
      expect(result.failure, isA<AuthFailure>());
    });
  });
}
