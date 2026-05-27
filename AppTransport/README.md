# Nexum Driver - App del Conductor

App móvil para conductores de la plataforma MaaS (Mobility as a Service) **Nexum**, diseñada para la ciudad piloto de **Pamplona, Norte de Santander, Colombia**. Permite a los conductores registrados recibir y gestionar solicitudes de viaje, monitorear sus ganancias y administrar su perfil.

---

## Requisitos

| Herramienta | Versión mínima |
|-------------|----------------|
| Flutter | 3.24.0+ |
| Dart | 3.4.0+ |
| Android SDK | API 21+ (Android 5.0) |
| Xcode | 15+ (solo macOS, para iOS) |
| Google Maps API Key | Con Maps SDK for Android y Maps SDK for iOS habilitados |

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/nexum-co/nexum-store.git
cd nexum-store/driver_app
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y reemplaza `your_google_maps_api_key_here` con tu API key de Google Maps:

```
GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

> Para obtener una API Key: [Google Cloud Console](https://console.cloud.google.com/)
> Habilitar: **Maps SDK for Android** y **Maps SDK for iOS**

### 3. Instalar dependencias

```bash
flutter pub get
```

### 4. Ejecutar la aplicación

```bash
flutter run --dart-define=GOOGLE_MAPS_API_KEY=TU_API_KEY_AQUI
```

---

## Comandos disponibles

```bash
# Ejecutar en modo debug
flutter run --dart-define=GOOGLE_MAPS_API_KEY=TU_KEY

# Ejecutar pruebas
flutter test

# Compilar APK release
flutter build apk --dart-define=GOOGLE_MAPS_API_KEY=TU_KEY

# Compilar App Bundle (Google Play)
flutter build appbundle --dart-define=GOOGLE_MAPS_API_KEY=TU_KEY

# Analizar el código
flutter analyze

# Formatear el código
dart format lib/
```

---

## Estructura del proyecto

```
driver_app/
├── lib/
│   ├── app/
│   │   ├── router/
│   │   │   └── app_router.dart          # Configuración go_router
│   │   ├── theme/
│   │   │   ├── app_colors.dart          # Paleta de colores corporativos
│   │   │   └── app_theme.dart           # ThemeData claro y oscuro (Material 3)
│   │   └── app.dart                     # Widget raíz NexumDriverApp
│   ├── core/
│   │   ├── constants/
│   │   │   ├── app_constants.dart       # Constantes globales (tarifas, timeouts, etc.)
│   │   │   └── map_constants.dart       # Coordenadas de Pamplona
│   │   ├── errors/
│   │   │   ├── exceptions.dart          # Excepciones de la capa de datos
│   │   │   └── failures.dart            # Fallos de la capa de dominio (sealed class)
│   │   ├── utils/
│   │   │   ├── currency_formatter.dart  # Formateo COP ($15.750)
│   │   │   ├── date_formatter.dart      # Fechas en español Colombia
│   │   │   └── fare_calculator.dart     # Cálculo de tarifas + Haversine
│   │   └── widgets/
│   │       ├── app_snackbar.dart        # SnackBars estilizados
│   │       ├── error_screen.dart        # Pantalla de error reutilizable
│   │       └── loading_overlay.dart     # Overlay de carga semitransparente
│   ├── features/
│   │   ├── auth/                        # Autenticación (teléfono + OTP)
│   │   ├── driver_status/               # Pantalla principal y toggle online/offline
│   │   ├── active_trip/                 # Flujo de viaje activo y resumen
│   │   ├── earnings/                    # Ganancias diarias e historial 7 días
│   │   └── profile/                     # Perfil del conductor y vehículo
│   └── main.dart                        # Punto de entrada
├── android/                             # Configuración Android
├── ios/                                 # Configuración iOS
├── .env.example                         # Plantilla de variables de entorno
├── analysis_options.yaml               # Reglas de lint estrictas
├── pubspec.yaml                         # Dependencias Flutter
└── README.md
```

---

## Credenciales mock (MVP)

La versión MVP no requiere backend real. Usa las siguientes credenciales:

| Campo | Valor |
|-------|-------|
| Teléfono | `+57 312 456 7890` |
| Código OTP | `123456` |

El conductor mock es **Juan Carlos Villamizar Contreras**, con vehículo **Chevrolet Spark GT 2020** (placa **KGB-742**) y calificación de **4.87 ⭐**.

---

## Fórmula de tarifas

```
Tarifa = max(TARIFA_MÍNIMA, BASE + (distancia_km × TASA_KM) + (duración_min × TASA_MIN))
```

| Componente | Valor |
|-----------|-------|
| Base | $3.500 COP |
| Por kilómetro | $800 COP/km |
| Por minuto | $150 COP/min |
| Tarifa mínima | $5.000 COP |
| Comisión plataforma | 15% |

**Ejemplo:** Viaje de 3 km, 8 minutos → $3.500 + $2.400 + $1.200 = **$7.100 COP** (conductor recibe $6.035 COP)

---

## Notas técnicas

- **Rastreo en segundo plano:** La dependencia `geolocator` está configurada con permisos `ACCESS_BACKGROUND_LOCATION` (Android) y `Always` (iOS), pero el envío periódico de ubicación al servidor está preparado en la arquitectura sin activarse en el MVP (sin backend real).
- **Mapas offline:** No disponibles en MVP. Se requiere conexión para cargar los tiles de Google Maps.
- **Idioma:** Español Colombia (`es_CO`) como locale principal. La estructura de internacionalización soporta inglés (`en_US`) como segundo idioma.
- **Estado de viajes:** Simulado mediante timers y datos mock locales. No hay WebSocket ni polling real en el MVP.
