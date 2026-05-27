/// Excepciones base de la aplicación Nexum Driver.
/// Estas son excepciones internas que se convierten en [Failure] en la capa de dominio.

/// Excepción base de la app
class AppException implements Exception {
  const AppException({
    required this.message,
    this.code,
    this.details,
  });

  final String message;
  final String? code;
  final dynamic details;

  @override
  String toString() => 'AppException(code: $code, message: $message)';
}

/// Error en operaciones de autenticación
class AuthException extends AppException {
  const AuthException({
    required super.message,
    super.code,
    super.details,
  });
}

/// Error al intentar autenticar con OTP inválido
class InvalidOtpException extends AuthException {
  const InvalidOtpException()
      : super(
          message: 'El código OTP ingresado no es válido',
          code: 'INVALID_OTP',
        );
}

/// Error de red (sin conexión o timeout)
class NetworkException extends AppException {
  const NetworkException({
    super.message = 'Error de conexión. Verifica tu internet.',
    super.code = 'NETWORK_ERROR',
    super.details,
  });
}

/// Error de servidor
class ServerException extends AppException {
  const ServerException({
    super.message = 'Error en el servidor. Intenta de nuevo.',
    super.code = 'SERVER_ERROR',
    super.details,
  });
}

/// Error de caché o almacenamiento local
class StorageException extends AppException {
  const StorageException({
    super.message = 'Error al acceder al almacenamiento local.',
    super.code = 'STORAGE_ERROR',
    super.details,
  });
}

/// Error de permisos de ubicación
class LocationPermissionException extends AppException {
  const LocationPermissionException()
      : super(
          message: 'Necesitamos permisos de ubicación para asignarte viajes.',
          code: 'LOCATION_PERMISSION_DENIED',
        );
}

/// Error cuando no se encuentra un recurso
class NotFoundException extends AppException {
  const NotFoundException({
    super.message = 'No se encontró el recurso solicitado.',
    super.code = 'NOT_FOUND',
  });
}
