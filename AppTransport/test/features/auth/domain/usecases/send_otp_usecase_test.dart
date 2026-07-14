import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_driver/core/errors/failures.dart';
import '../../../../support/auth_mock_datasource.dart';
import 'package:nexum_driver/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:nexum_driver/features/auth/domain/usecases/send_otp_usecase.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  group('SendOtpUseCase', () {
    late SendOtpUseCase useCase;

    setUp(() {
      const storage = FlutterSecureStorage();
      final dataSource = AuthMockDataSource();
      final repository = AuthRepositoryImpl(
        dataSource: dataSource,
        secureStorage: storage,
      );
      useCase = SendOtpUseCase(repository);
    });

    test('Número colombiano válido "+573124567890" retorna éxito', () async {
      final result = await useCase.call('+573124567890');
      expect(result.success, isTrue);
      expect(result.failure, isNull);
    });

    test('Número con formato "+57 312 456 7890" retorna éxito', () async {
      final result = await useCase.call('+57 312 456 7890');
      expect(result.success, isTrue);
    });

    test('Número sin prefijo +57 retorna AuthFailure', () async {
      final result = await useCase.call('3124567890');
      expect(result.success, isFalse);
      expect(result.failure, isA<AuthFailure>());
    });

    test('Número con prefijo incorrecto retorna AuthFailure', () async {
      final result = await useCase.call('+13124567890');
      expect(result.success, isFalse);
      expect(result.failure, isA<AuthFailure>());
    });

    test('Número vacío retorna AuthFailure', () async {
      final result = await useCase.call('');
      expect(result.success, isFalse);
      expect(result.failure, isA<AuthFailure>());
    });

    test('Número fijo (no celular) retorna AuthFailure', () async {
      // Los celulares colombianos empiezan con 3XX, no 2XX o 7XX
      final result = await useCase.call('+577654321');
      expect(result.success, isFalse);
      expect(result.failure, isA<AuthFailure>());
    });
  });
}
