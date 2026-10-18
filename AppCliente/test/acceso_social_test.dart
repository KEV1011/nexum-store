import 'package:flutter_test/flutter_test.dart';
import 'package:nexum_client/features/auth/presentation/widgets/acceso_social.dart';

/// Qué botones de acceso se pintan. Se lee en la pantalla por la que se ENTRA
/// a la app: un JSON raro no puede tumbarla, y un botón que el servidor no
/// anunció no puede aparecer (siempre fallaría).
void main() {
  test('sin nada anunciado, ningún botón', () {
    expect(ProveedoresAcceso.fromJson(const {}).alguno, isFalse);
    expect(
      ProveedoresAcceso.fromJson(const {'google': null, 'apple': null}).alguno,
      isFalse,
    );
  });

  test('un JSON con otra forma no revienta', () {
    final p = ProveedoresAcceso.fromJson(const {
      'google': 'texto',
      'apple': [1, 2],
    });
    expect(p.alguno, isFalse);
    expect(
      ProveedoresAcceso.fromJson(const {'google': {'clientId': 42}}).google,
      isFalse,
    );
    expect(
      ProveedoresAcceso.fromJson(const {'google': {'clientId': '  '}}).google,
      isFalse,
    );
  });

  test('Google con su id de cliente', () {
    final p = ProveedoresAcceso.fromJson(const {
      'google': {'clientId': 'web.apps.googleusercontent.com'},
    });
    expect(p.google, isTrue);
    expect(p.googleClientId, 'web.apps.googleusercontent.com');
  });

  test('Apple en Android solo con Services ID Y redirección', () {
    // Las pruebas corren como Android: ahí Apple va por la página de Apple.
    expect(
      ProveedoresAcceso.fromJson(const {'apple': {'web': null}}).apple,
      isFalse,
    );
    expect(
      ProveedoresAcceso.fromJson(const {
        'apple': {'web': {'servicesId': 'com.zipa.cliente.web'}},
      }).apple,
      isFalse,
    );
    expect(
      ProveedoresAcceso.fromJson(const {
        'apple': {
          'web': {
            'servicesId': 'com.zipa.cliente.web',
            'redirectUri': 'https://api.zipa.co/client/auth/apple/callback',
          },
        },
      }).apple,
      isTrue,
    );
  });
}
