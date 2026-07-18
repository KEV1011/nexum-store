/// Excepciones internas de ZIPA Cliente. Se convierten en Failure en repos.
library;

class AppException implements Exception {
  const AppException({required this.message, this.code});

  final String message;
  final String? code;
}

class AuthException extends AppException {
  const AuthException({required super.message, super.code});
}

class InvalidOtpException extends AuthException {
  const InvalidOtpException()
      : super(
          message: 'El código OTP ingresado no es válido',
          code: 'INVALID_OTP',
        );
}

class NetworkException extends AppException {
  const NetworkException({
    super.message = 'Error de conexión. Verifica tu internet.',
    super.code = 'NETWORK_ERROR',
  });
}

class ServerException extends AppException {
  const ServerException({
    super.message = 'Error en el servidor. Intenta de nuevo.',
    super.code = 'SERVER_ERROR',
  });
}

class StorageException extends AppException {
  const StorageException({
    super.message = 'Error al acceder al almacenamiento local.',
    super.code = 'STORAGE_ERROR',
  });
}
