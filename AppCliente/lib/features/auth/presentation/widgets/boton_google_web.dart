/// El botón de Google en la versión WEB.
///
/// En la web Google no deja abrir su ventana desde un botón nuestro: el botón
/// lo dibuja Google (`renderButton`) y el inicio de sesión llega por
/// `GoogleSignIn.instance.authenticationEvents`. Ese widget vive en
/// `google_sign_in_web`, que solo compila para la web, así que se importa
/// condicionalmente: en Android/iOS esta función no se llama nunca.
library;

export 'boton_google_web_stub.dart'
    if (dart.library.js_interop) 'boton_google_web_real.dart';
