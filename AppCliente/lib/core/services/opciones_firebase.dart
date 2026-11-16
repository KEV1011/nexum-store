/// Con qué datos arranca Firebase en iPhone.
///
/// En Android, Firebase se configura con el `google-services.json` que el
/// workflow escribe antes de compilar, y `Firebase.initializeApp()` sin
/// argumentos lo encuentra solo. En iOS el equivalente es un
/// `GoogleService-Info.plist`, pero ese archivo solo se empaqueta si está
/// registrado en el proyecto de Xcode — dejarlo en la carpeta no basta, y
/// registrarlo obliga a que exista en CADA build (sin él, Xcode no compila).
///
/// Por eso en iOS los cuatro datos llegan como `--dart-define`: el workflow
/// los saca del plist que se guarda como secreto y no hace falta tocar el
/// proyecto. Sin ellos se devuelve `null` y la app arranca exactamente como
/// antes: `initializeApp()` falla, se atrapa, y la app funciona sin avisos.
///
/// Este archivo es IDÉNTICO en las dos apps (lo vigila una prueba): el
/// identificador de cada una sale del propio plist, no de aquí.
library;

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Las opciones para `Firebase.initializeApp`, o `null` para usar las del
/// sistema (Android, o un iPhone compilado sin los datos de Firebase).
FirebaseOptions? opcionesFirebase() {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return null;
  return opcionesFirebaseIos(
    apiKey: const String.fromEnvironment('FIREBASE_IOS_API_KEY'),
    appId: const String.fromEnvironment('FIREBASE_IOS_APP_ID'),
    senderId: const String.fromEnvironment('FIREBASE_IOS_SENDER_ID'),
    projectId: const String.fromEnvironment('FIREBASE_IOS_PROJECT_ID'),
    bundleId: const String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID'),
  );
}

/// La regla, sin plataforma, para poder probarla.
///
/// Los cuatro datos o ninguno: con uno de menos Firebase arranca a medias y
/// el error sale al pedir el token, lejos de su causa.
@visibleForTesting
FirebaseOptions? opcionesFirebaseIos({
  required String apiKey,
  required String appId,
  required String senderId,
  required String projectId,
  String bundleId = '',
}) {
  final datos = [apiKey, appId, senderId, projectId].map((v) => v.trim());
  if (datos.any((v) => v.isEmpty)) return null;
  return FirebaseOptions(
    apiKey: apiKey.trim(),
    appId: appId.trim(),
    messagingSenderId: senderId.trim(),
    projectId: projectId.trim(),
    iosBundleId: bundleId.trim().isEmpty ? null : bundleId.trim(),
  );
}
