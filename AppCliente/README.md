# nexum_client

App cliente de Nexum (movilidad + domicilios) para Pamplona, Norte de
Santander.

## Mapas (Google Maps nativo)

La pantalla de movilidad usa `google_maps_flutter`. La clave del SDK **no se
versiona**: se inyecta por plataforma.

### Android

Agrega tu clave a `android/local.properties` (este archivo está en
`.gitignore`):

```properties
MAPS_API_KEY=tu_clave_de_google_maps
```

El `build.gradle.kts` la lee y la inyecta en el `AndroidManifest.xml` mediante
`manifestPlaceholders` (`${MAPS_API_KEY}`).

### iOS

Define una entrada `MapsApiKey` en `ios/Runner/Info.plist` (idealmente vía un
`.xcconfig` no versionado). `AppDelegate.swift` la pasa a
`GMSServices.provideAPIKey(...)`.

### Recomendaciones de seguridad

- Restringe la clave en Google Cloud Console por **package name + SHA-1**
  (Android) y **bundle id** (iOS), y habilita solo *Maps SDK*.
- Usa claves distintas para Android, iOS y el backend.

## Notificaciones push (Firebase Cloud Messaging)

El push está integrado de forma **tolerante a fallos**: la app compila y corre
sin Firebase; el push se activa al agregar las credenciales.

### Para activarlo

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/)
   y agrega las apps Android (`com.nexum.nexum_client`) e iOS.
2. Descarga y coloca (ambos están en `.gitignore`, **no se versionan**):
   - Android: `android/app/google-services.json` — al existir, Gradle aplica
     automáticamente el plugin `com.google.gms.google-services`.
   - iOS: `ios/Runner/GoogleService-Info.plist`.
3. En el **backend**, define la variable de entorno con el JSON del *service
   account* de Firebase:
   ```
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```
   Sin esta variable, el backend registra el push en consola (no-op).

La app registra el token FCM en `POST /client/devices/register` tras el login
y envía notificaciones en los cambios de estado del viaje (conductor asignado,
en camino, llegó, completado, cancelado).

## Permisos de ubicación

La app pide permiso de ubicación en tiempo de ejecución (`geolocator`). Si el
usuario lo niega o no hay GPS, el mapa cae al centro de Pamplona como respaldo.

## Comandos

```bash
flutter pub get
flutter run
flutter analyze
```
