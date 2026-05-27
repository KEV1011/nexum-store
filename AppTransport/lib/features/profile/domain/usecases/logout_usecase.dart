import 'package:nexum_driver/features/auth/domain/repositories/auth_repository.dart';

/// Caso de uso: cerrar sesión del conductor.
/// Delega en el repositorio de autenticación para limpiar el token.
class LogoutUseCase {
  const LogoutUseCase(this._authRepository);
  final AuthRepository _authRepository;

  Future<void> call() => _authRepository.logout();
}
