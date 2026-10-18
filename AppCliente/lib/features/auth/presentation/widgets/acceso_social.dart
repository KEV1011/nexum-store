/// «Continuar con Google» y «Continuar con Apple».
///
/// POR QUÉ. Sin SMS, el login por teléfono se apoya en un código fijo que
/// conoce todo el que prueba la app: con él se entra a la cuenta de cualquier
/// número. Google y Apple sí verifican a la persona y firman un token que el
/// servidor comprueba (`backend/src/lib/id-token.ts`).
///
/// LOS BOTONES SOLO APARECEN SI EL SERVIDOR LOS ANUNCIA
/// (`GET /client/auth/providers`). Sin las llaves configuradas en el backend no
/// se pinta nada: un botón que siempre falla es peor que no tenerlo.
///
/// Y piden lo mismo que el teléfono: haber marcado los términos. Entrar con
/// Google también CREA la cuenta.
library;

import 'dart:async';

import 'package:flutter/foundation.dart' show defaultTargetPlatform, kIsWeb, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/widgets/app_snackbar.dart';
import 'package:nexum_client/features/auth/presentation/providers/auth_provider.dart';
import 'package:nexum_client/features/auth/presentation/widgets/boton_google_web.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Lo que el servidor dice que se puede usar.
class ProveedoresAcceso {
  const ProveedoresAcceso({
    this.googleClientId,
    this.appleActivo = false,
    this.appleServicesId,
    this.appleRedirectUri,
  });

  /// Sin casteos directos: esto se lee en la pantalla por la que se ENTRA a la
  /// app. Si lanzara, no fallaría un botón: fallaría el ingreso entero.
  factory ProveedoresAcceso.fromJson(Map<String, dynamic> j) {
    final g = j['google'];
    final a = j['apple'];
    final web = a is Map ? a['web'] : null;
    String? texto(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;
    return ProveedoresAcceso(
      googleClientId: g is Map ? texto(g['clientId']) : null,
      appleActivo: a is Map,
      appleServicesId: web is Map ? texto(web['servicesId']) : null,
      appleRedirectUri: web is Map ? texto(web['redirectUri']) : null,
    );
  }

  final String? googleClientId;
  final bool appleActivo;
  final String? appleServicesId;
  final String? appleRedirectUri;

  bool get google => googleClientId != null;

  /// Apple es nativo solo en iOS. En Android y en la web va por la página de
  /// Apple, que necesita el Services ID; sin él, ahí no se ofrece.
  bool get apple {
    if (!appleActivo) return false;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) return true;
    return appleServicesId != null && (kIsWeb || appleRedirectUri != null);
  }

  bool get alguno => google || apple;
}

final proveedoresAccesoProvider = FutureProvider<ProveedoresAcceso>((ref) async {
  final json = await ref.read(authRepositoryProvider).proveedoresAcceso();
  return ProveedoresAcceso.fromJson(json);
});

/// `GoogleSignIn.instance.initialize` se llama UNA vez en la vida de la app.
/// Si falla, se permite reintentar (sin esto, un fallo de red al primer
/// intento dejaría el botón muerto hasta reiniciar).
Future<void>? _googleListo;
Future<void> _iniciarGoogle(String clientId) {
  return _googleListo ??= GoogleSignIn.instance
      .initialize(
        // En la web, el id del cliente web; en Android, ese mismo id como
        // «servidor»: así el token sale con la audiencia que el backend acepta.
        clientId: kIsWeb ? clientId : null,
        serverClientId: kIsWeb ? null : clientId,
      )
      .catchError((Object e) {
    _googleListo = null;
    throw e;
  });
}

class BotonesAccesoSocial extends ConsumerStatefulWidget {
  const BotonesAccesoSocial({
    required this.terminosAceptados,
    required this.onFaltanTerminos,
    super.key,
  });

  final bool terminosAceptados;
  final VoidCallback onFaltanTerminos;

  @override
  ConsumerState<BotonesAccesoSocial> createState() => _BotonesAccesoSocialState();
}

class _BotonesAccesoSocialState extends ConsumerState<BotonesAccesoSocial> {
  StreamSubscription<GoogleSignInAuthenticationEvent>? _eventosWeb;
  bool _googleWebListo = false;
  String? _ultimoToken;

  @override
  void dispose() {
    _eventosWeb?.cancel();
    super.dispose();
  }

  /// En la web el inicio de sesión llega por eventos (el botón es de Google).
  Future<void> _prepararGoogleWeb(String clientId) async {
    if (_googleWebListo) return;
    try {
      await _iniciarGoogle(clientId);
      _eventosWeb ??= GoogleSignIn.instance.authenticationEvents.listen(
        (evento) {
          if (evento is GoogleSignInAuthenticationEventSignIn) {
            final t = evento.user.authentication.idToken;
            if (t != null) unawaited(_entrar('google', {'idToken': t}));
          }
        },
        onError: (Object e) => _errorGoogle(e),
      );
      if (mounted) setState(() => _googleWebListo = true);
    } catch (e) {
      _errorGoogle(e);
    }
  }

  Future<void> _google(String clientId) async {
    if (!widget.terminosAceptados) {
      widget.onFaltanTerminos();
      return;
    }
    try {
      await _iniciarGoogle(clientId);
      final g = GoogleSignIn.instance;
      if (!g.supportsAuthenticate()) return;
      final cuenta = await g.authenticate();
      final t = cuenta.authentication.idToken;
      if (t == null) {
        _mostrar('Google no entregó la cuenta. Intenta de nuevo.');
        return;
      }
      await _entrar('google', {'idToken': t});
    } catch (e) {
      _errorGoogle(e);
    }
  }

  void _errorGoogle(Object e) {
    // Cerrar la ventana de Google no es un error: no se dice nada.
    if (e is GoogleSignInException &&
        (e.code == GoogleSignInExceptionCode.canceled ||
            e.code == GoogleSignInExceptionCode.interrupted)) {
      return;
    }
    debugPrint('[AccesoSocial] Google: $e');
    _mostrar('No pudimos entrar con Google. Intenta de nuevo o usa tu número.');
  }

  Future<void> _apple(ProveedoresAcceso p) async {
    if (!widget.terminosAceptados) {
      widget.onFaltanTerminos();
      return;
    }
    try {
      final nativo = !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
      final cred = await SignInWithApple.getAppleIDCredential(
        scopes: const [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
        webAuthenticationOptions: nativo
            ? null
            : WebAuthenticationOptions(
                clientId: p.appleServicesId!,
                // En la web, Apple devuelve el resultado a la propia página
                // (ventana emergente); en Android, al backend, que lo
                // reenvía a la app.
                redirectUri: kIsWeb
                    ? Uri.parse('${Uri.base.origin}${Uri.base.path}')
                    : Uri.parse(p.appleRedirectUri!),
              ),
      );
      final t = cred.identityToken;
      if (t == null) {
        _mostrar('Apple no entregó la cuenta. Intenta de nuevo.');
        return;
      }
      await _entrar('apple', {
        'identityToken': t,
        // Apple da el nombre SOLO la primera vez, y fuera del token.
        if (cred.givenName != null) 'givenName': cred.givenName,
        if (cred.familyName != null) 'familyName': cred.familyName,
      });
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return;
      debugPrint('[AccesoSocial] Apple: $e');
      _mostrar('No pudimos entrar con Apple. Intenta de nuevo o usa tu número.');
    } catch (e) {
      debugPrint('[AccesoSocial] Apple: $e');
      _mostrar('No pudimos entrar con Apple. Intenta de nuevo o usa tu número.');
    }
  }

  /// La sesión la abre el servidor; la pantalla de ingreso navega al ver
  /// `AuthAuthenticated`, igual que con el código.
  Future<void> _entrar(String proveedor, Map<String, dynamic> cuerpo) async {
    final t = cuerpo['idToken'] ?? cuerpo['identityToken'];
    if (t is String && t == _ultimoToken) return; // el evento llegó dos veces
    if (t is String) _ultimoToken = t;
    final motivo = await ref.read(authProvider.notifier).entrarConProveedor(proveedor, cuerpo);
    if (motivo != null) _mostrar(motivo);
  }

  void _mostrar(String texto) {
    if (mounted) AppSnackbar.showError(context, texto);
  }

  @override
  Widget build(BuildContext context) {
    final p = ref.watch(proveedoresAccesoProvider).valueOrNull;
    if (p == null || !p.alguno) return const SizedBox.shrink();

    // En la web el botón de Google es de Google y no se puede apagar: se
    // dibuja solo DESPUÉS de aceptar los términos. Antes va uno nuestro que
    // recuerda marcarlos.
    if (kIsWeb && p.google && widget.terminosAceptados && !_googleWebListo) {
      unawaited(_prepararGoogleWeb(p.googleClientId!));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(child: Divider(color: context.outlineColor)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                'o continúa con',
                style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
              ),
            ),
            Expanded(child: Divider(color: context.outlineColor)),
          ],
        ),
        const SizedBox(height: 16),
        if (p.google)
          if (kIsWeb && widget.terminosAceptados && _googleWebListo)
            Center(child: botonGoogleWeb())
          else
            _BotonProveedor(
              texto: 'Continuar con Google',
              marca: const _LetraGoogle(),
              // En la web, mientras Google prepara su botón, tocar el nuestro
              // solo sirve para recordar los términos.
              onTap: () {
                if (!kIsWeb) {
                  unawaited(_google(p.googleClientId!));
                } else if (!widget.terminosAceptados) {
                  widget.onFaltanTerminos();
                }
              },
            ),
        if (p.google && p.apple) const SizedBox(height: 12),
        if (p.apple)
          SignInWithAppleButton(
            text: 'Continuar con Apple',
            height: 52,
            style: Theme.of(context).brightness == Brightness.dark
                ? SignInWithAppleButtonStyle.white
                : SignInWithAppleButtonStyle.black,
            borderRadius: const BorderRadius.all(Radius.circular(26)),
            onPressed: () => unawaited(_apple(p)),
          ),
      ],
    );
  }
}

class _BotonProveedor extends StatelessWidget {
  const _BotonProveedor({required this.texto, required this.marca, required this.onTap});

  final String texto;
  final Widget marca;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          foregroundColor: context.textPrimaryColor,
          side: BorderSide(color: context.outlineColor),
          shape: const StadiumBorder(),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            marca,
            const SizedBox(width: 10),
            Text(texto, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

/// La «G» de Google en sus cuatro colores, dibujada (sin assets).
class _LetraGoogle extends StatelessWidget {
  const _LetraGoogle();

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (r) => const SweepGradient(
        colors: [
          Color(0xFFEA4335), Color(0xFFFBBC05), Color(0xFF34A853),
          Color(0xFF4285F4), Color(0xFFEA4335),
        ],
        stops: [0.0, 0.3, 0.55, 0.8, 1.0],
      ).createShader(r),
      child: const Text(
        'G',
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, height: 1),
      ),
    );
  }
}
