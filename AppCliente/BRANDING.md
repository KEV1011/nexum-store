# Identidad de marca — Nexum Cliente

## Tipografía

- **Display / titulares:** Sora (vía `google_fonts`, se descarga en tiempo de
  ejecución).
- **Cuerpo / etiquetas:** Inter (empaquetada en `assets/fonts/`).

Definida en `lib/app/theme/app_theme.dart` (`_buildTextTheme`). No uses
`fontFamily` suelto en pantallas: hereda del `TextTheme`.

## Color de marca

- Primario (verde Nexum): `#00C853`
- Secundario (azul noche): `#1A237E`

Tokens completos (claro + oscuro) en `lib/app/theme/app_colors.dart`.

## Ícono y splash — TODO (faltan assets)

La configuración de `flutter_launcher_icons` y `flutter_native_splash` ya está
lista en `pubspec.yaml`, pero **faltan los archivos de imagen**. Coloca estos
assets y luego genera:

| Archivo | Tamaño recomendado | Uso |
|---|---|---|
| `assets/icons/app_icon.png` | 1024×1024 px | Ícono de la app (Android + web) |
| `assets/icons/app_icon_foreground.png` | 1024×1024 px, con padding seguro | Capa frontal del ícono adaptativo |
| `assets/icons/splash_logo.png` | ~512×512 px, fondo transparente | Logo del splash |

Cuando los tengas:

```bash
cd AppCliente
flutter pub get
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

> Nota: la app del conductor (`AppTransport/`) ya tiene estos assets en
> `assets/icons/` y su configuración generada; úsalos como referencia de estilo
> para mantener la familia de marca (mismo verde, mismo símbolo) diferenciando
> Cliente vs. Conductor.

## Favicon / íconos web (PWA)

Los `web/icons/Icon-*.png` y `web/favicon.png` siguen siendo los placeholders
por defecto de Flutter. Reemplázalos por el ícono de Nexum (el comando
`flutter_launcher_icons` con `web.generate: true` regenera los de `web/icons/`).
