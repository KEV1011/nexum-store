/// Clase base sellada para representar fallos en la capa de dominio.
/// Convierte las excepciones técnicas en tipos semánticos de negocio.
sealed class Failure {
  const Failure({required this.message, this.code});

  final String message;
  final String? code;

  @override
  String toString() => '$runtimeType(code: $code, message: $message)';
}

/// Fallo de autenticación (OTP inválido, sesión expirada, etc.)
class AuthFailure extends Failure {
  const AuthFailure({required super.message, super.code});
}

/// Fallo de OTP inválido
class InvalidOtpFailure extends AuthFailure {
  const InvalidOtpFailure()
      : super(
          message: 'El código OTP ingresado no es válido',
          code: 'INVALID_OTP',
        );
}

/// Fallo de red
class NetworkFailure extends Failure {
  const NetworkFailure({
    super.message = 'Error de conexión. Verifica tu internet.',
    super.code = 'NETWORK_ERROR',
  });
}

/// Fallo de servidor
class ServerFailure extends Failure {
  const ServerFailure({
    super.message = 'Error en el servidor. Intenta de nuevo.',
    super.code = 'SERVER_ERROR',
  });
}

/// Fallo de almacenamiento local
class StorageFailure extends Failure {
  const StorageFailure({
    super.message = 'Error al acceder al almacenamiento local.',
    super.code = 'STORAGE_ERROR',
  });
}

/// Fallo de permisos de ubicación
class LocationPermissionFailure extends Failure {
  const LocationPermissionFailure()
      : super(
          message: 'Se requieren permisos de ubicación para recibir viajes.',
          code: 'LOCATION_PERMISSION_DENIED',
        );
}

/// Fallo genérico / inesperado
class UnexpectedFailure extends Failure {
  const UnexpectedFailure({
    super.message = 'Ocurrió un error inesperado. Intenta de nuevo.',
    super.code = 'UNEXPECTED_ERROR',
  });
}
