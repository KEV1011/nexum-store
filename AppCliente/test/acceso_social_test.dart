import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
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

  group('Google en iPhone', () {
    // La regla, sin plataforma.
    test('sin id de cliente de iOS, no (la app se cerraría al tocarlo)', () {
      expect(googleEnIos(clienteIos: '', apple: true), isFalse);
      expect(googleEnIos(clienteIos: '   ', apple: true), isFalse);
    });

    test('sin Apple al lado, no (regla 4.8 de la App Store)', () {
      expect(googleEnIos(clienteIos: 'ios.apps.googleusercontent.com', apple: false), isFalse);
    });

    test('con los dos, sí', () {
      expect(googleEnIos(clienteIos: 'ios.apps.googleusercontent.com', apple: true), isTrue);
    });

    // Y que el getter la aplique de verdad en iPhone. Estas pruebas se
    // compilan sin GOOGLE_IOS_CLIENT_ID, así que en iOS Google NO puede salir
    // aunque el servidor lo anuncie y Apple esté activo.
    test('en iPhone, anunciado por el servidor no basta', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      final p = ProveedoresAcceso.fromJson(const {
        'google': {'clientId': 'web.apps.googleusercontent.com'},
        'apple': {'web': null},
      });
      expect(p.apple, isTrue, reason: 'en iPhone Apple es nativo');
      expect(p.google, isFalse);
    });

    test('en Android no cambia nada', () {
      final p = ProveedoresAcceso.fromJson(const {
        'google': {'clientId': 'web.apps.googleusercontent.com'},
      });
      expect(p.google, isTrue);
    });
  });

  group('qué se dice cuando Google no deja entrar', () {
    test('cerrar la ventana no dice nada', () {
      expect(motivoDeFalloGoogle(GoogleSignInExceptionCode.canceled, null), isNull);
      expect(
        motivoDeFalloGoogle(
          GoogleSignInExceptionCode.canceled,
          'activity is cancelled by the user.',
        ),
        isNull,
      );
      expect(motivoDeFalloGoogle(GoogleSignInExceptionCode.interrupted, null), isNull);
    });

    // El caso del reporte: Android lo manda como CANCELADO y antes se callaba.
    test('la app que Google no reconoce SÍ se dice, aunque venga como cancelado', () {
      final m = motivoDeFalloGoogle(
        GoogleSignInExceptionCode.canceled,
        '[16] Account reauth failed.',
      );
      expect(m, isNotNull);
      expect(m, contains('tu número'));
      expect(
        motivoDeFalloGoogle(
          GoogleSignInExceptionCode.unknownError,
          '[28444] Developer console is not set up correctly.',
        ),
        m,
      );
      expect(
        motivoDeFalloGoogle(GoogleSignInExceptionCode.providerConfigurationError, null),
        m,
      );
    });

    test('sin cuenta de Google en el teléfono se dice qué hacer', () {
      expect(
        motivoDeFalloGoogle(
          GoogleSignInExceptionCode.unknownError,
          'No credential available: no credentials',
        ),
        contains('Ajustes'),
      );
    });

    test('lo demás cae al mensaje genérico', () {
      expect(
        motivoDeFalloGoogle(GoogleSignInExceptionCode.unknownError, 'algo raro'),
        kGoogleFalloGenerico,
      );
    });
  });
}
