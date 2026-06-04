# nexum_client

App cliente de Nexum (movilidad + domicilios) para Pamplona, Nariño.

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

## Permisos de ubicación

La app pide permiso de ubicación en tiempo de ejecución (`geolocator`). Si el
usuario lo niega o no hay GPS, el mapa cae al centro de Pamplona como respaldo.

## Comandos

```bash
flutter pub get
flutter run
flutter analyze
```
