import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

/// Reporte de fallos de la app.
///
/// Hasta ahora, cuando la app reventaba en el teléfono de alguien, nadie se
/// enteraba: el usuario veía la pantalla cerrarse y, si tenía ganas, lo
/// contaba. El backend sí reportaba a Sentry desde hacía tiempo — la mitad de
/// los fallos que importan pasan en el teléfono, no en el servidor.
///
/// Se activa por compilación, igual que el resto de integraciones del proyecto:
///
/// ```
/// flutter build apk --dart-define=SENTRY_DSN=https://…
/// ```
///
/// **Sin DSN no hace absolutamente nada** y la app arranca exactamente como
/// hoy. Eso no es una comodidad: significa que una compilación local o de un
/// colaborador nunca manda datos a ninguna parte por descuido.
const String kSentryDsn = String.fromEnvironment('SENTRY_DSN');

const String _kBuildTag = String.fromEnvironment(
  'BUILD_TAG',
  defaultValue: 'dev',
);

bool get crashReportingEnabled => kSentryDsn.isNotEmpty;

/// Arranca [app] con reporte de fallos si hay DSN; si no, la corre tal cual.
///
/// Envuelve la app entera —no solo `runApp`— para capturar también los errores
/// asíncronos, que son justo los que nunca llegan por otro camino.
Future<void> runWithCrashReporting(FutureOr<void> Function() app) async {
  if (!crashReportingEnabled) {
    await app();
    return;
  }

  await SentryFlutter.init(
    (options) {
      options.dsn = kSentryDsn;
      options.release = 'nexum-cliente@$_kBuildTag';
      options.environment = kReleaseMode ? 'production' : 'development';
      // Solo fallos: sin trazas de rendimiento, que multiplican el volumen y
      // no responden ninguna pregunta que hoy nos estemos haciendo.
      options.tracesSampleRate = 0;
      // Nada de capturas de pantalla ni del árbol de widgets: en esta app la
      // pantalla lleva direcciones de casa, teléfonos y nombres. Un informe de
      // fallo no es sitio para eso.
      options.attachScreenshot = false;
      options.attachViewHierarchy = false;
      // Sentry adjunta IP y datos del dispositivo si se le deja. No se le deja.
      options.sendDefaultPii = false;
    },
    appRunner: () async => app(),
  );
}
