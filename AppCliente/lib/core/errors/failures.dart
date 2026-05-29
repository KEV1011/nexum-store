/// Fallos semánticos de negocio (resultado de convertir excepciones).
sealed class Failure {
  const Failure({required this.message, this.code});

  final String message;
  final String? code;
}

class AuthFailure extends Failure {
  const AuthFailure({required super.message, super.code});
}

class InvalidOtpFailure extends AuthFailure {
  const InvalidOtpFailure()
      : super(
          message: 'El código OTP ingresado no es válido',
          code: 'INVALID_OTP',
        );
}

class NetworkFailure extends Failure {
  const NetworkFailure({
    super.message = 'Error de conexión. Verifica tu internet.',
    super.code = 'NETWORK_ERROR',
  });
}

class StorageFailure extends Failure {
  const StorageFailure({
    super.message = 'Error al acceder al almacenamiento local.',
    super.code = 'STORAGE_ERROR',
  });
}

class UnexpectedFailure extends Failure {
  const UnexpectedFailure({
    super.message = 'Ocurrió un error inesperado. Intenta de nuevo.',
    super.code = 'UNEXPECTED_ERROR',
  });
}
