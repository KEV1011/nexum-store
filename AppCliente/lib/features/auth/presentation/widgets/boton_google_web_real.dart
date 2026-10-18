import 'package:flutter/widgets.dart';
import 'package:google_sign_in_web/web_only.dart' as web;

/// El botón oficial de Google, dibujado por Google.
Widget botonGoogleWeb() => web.renderButton(
      configuration: web.GSIButtonConfiguration(
        type: web.GSIButtonType.standard,
        theme: web.GSIButtonTheme.outline,
        size: web.GSIButtonSize.large,
        text: web.GSIButtonText.continueWith,
        shape: web.GSIButtonShape.pill,
        logoAlignment: web.GSIButtonLogoAlignment.left,
        minimumWidth: 300,
        locale: 'es',
      ),
    );
