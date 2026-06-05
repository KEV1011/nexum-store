# Setup de Producción — Nexum Driver

Pasos para poner la app lista para Play Store / producción real.

---

## 1. Google Maps API Key

> **Esta es la causa #1 del "mapa en blanco/gris".** El código está cableado
> correctamente; el mapa solo renderiza si la key es válida, tiene **billing**
> activo y las **APIs habilitadas**. Si ves el mapa gris, el problema casi
> siempre está aquí, no en el código.

### 1.1 Conseguir la key (5 min)
1. Ir a https://console.cloud.google.com/google/maps-apis/start
2. Crear un proyecto nuevo (o seleccionar uno existente)
3. **Activar Billing** en el proyecto (Maps lo exige aunque uses la capa
   gratuita): Console → Billing → vincular una cuenta de facturación.
4. **Habilitar estas 5 APIs** (Console → APIs & Services → Enable APIs):
   - **Maps SDK for Android** — mapa nativo en los APK
   - **Maps JavaScript API** — mapa en las versiones web
   - **Geocoding API** — el backend convierte direcciones ↔ coordenadas
   - **Directions API** — el backend calcula rutas siguiendo calles
   - **Places API** — autocompletado de direcciones en el buscador
5. Ir a **Credentials → Create Credentials → API Key** y copiar la key (`AIza...`).

### 1.2 Restringir la key (seguridad)

> ⚠️ **Importante:** una key de Google Maps solo admite **un tipo** de
> "Application restriction" (Android **o** referrers HTTP **o** IP, no varios).
> Como esta misma key se usa en Android + Web + Backend, hay dos caminos:

**Opción simple (recomendada para la demo a inversionistas) — una sola key:**
- Application restrictions → **None**
- API restrictions → **Restrict key** → seleccionar solo las 5 APIs de arriba.
- Funciona en todas las plataformas de inmediato. Menos estricta, pero las
  API restrictions limitan el daño si se filtra.

**Opción segura (producción) — keys separadas por plataforma:**
- Key Android: Application restrictions → Android apps → agregar
  `com.nexum.nexum_client` (AppCliente) y `com.nexum.driver_app` (AppTransport)
  con el SHA-1 de cada keystore.
- Key Web: Application restrictions → HTTP referrers → `kev1011.github.io/*`.
- Key Backend: Application restrictions → IP del servidor (o None).
- Requiere 3 secrets distintos; hoy el repo usa **uno solo**, así que para
  esto habría que ajustar los workflows.

### 1.3 Configurar el secret (un único secret alimenta todo)

En GitHub → **Settings → Secrets and variables → Actions → New repository secret**:
- **Name:** `GOOGLE_MAPS_API_KEY`
- **Value:** `AIzaXXXXXXXXXXXXXXX`

O por CLI (si tienes `gh` autenticado localmente):
```bash
gh secret set GOOGLE_MAPS_API_KEY --repo KEV1011/nexum-store
# pega la key cuando lo pida (no queda en el historial del shell)
```

Ese único secret se inyecta automáticamente al hacer push en **5 lugares**:

| Consumidor | Workflow | Mecanismo |
|------------|----------|-----------|
| AppCliente Android | `build-apk-cliente.yml` | `local.properties` → `MAPS_API_KEY` → manifest |
| AppCliente Web | `deploy-web-cliente.yml` | reemplaza `__MAPS_API_KEY__` en `web/index.html` |
| AppTransport Android | `build-apk.yml` | `-PGOOGLE_MAPS_API_KEY` → manifest |
| AppTransport Web | `deploy-web.yml` | reemplaza `__GOOGLE_MAPS_API_KEY__` |
| Backend | env del servidor | `process.env.GOOGLE_MAPS_API_KEY` |

> **Backend:** además del secret de Actions, el servidor donde corre el backend
> (Render/Railway/VPS) necesita la variable de entorno `GOOGLE_MAPS_API_KEY`.
> Si falta, geocoding/rutas/búsqueda degradan sin romper (retornan vacío).

**Para builds locales (sin CI):** crear `AppCliente/android/local.properties`
(ya está en `.gitignore`, nunca se commitea):
```
MAPS_API_KEY=AIzaXXXXXXXXXXXXXXX
```

### 1.4 Verificar que el mapa renderiza
1. Hacer push (o re-ejecutar el workflow) tras guardar el secret.
2. Abrir el APK / la web: el mapa debe mostrar las calles de Pamplona.
3. Si sigue **gris**: revisar en GCP → APIs & Services → **Metrics** si hay
   errores `REQUEST_DENIED` (API no habilitada) o `ApiNotActivatedMapError`
   (billing apagado). Esos dos son las causas más comunes.

> 🔒 La key expuesta antes (`AIzaSy…fiBiME`) debe **revocarse** en GCP si aún
> existe; genera una nueva y guárdala solo en el secret.

---

## 2. Firebase Push Notifications

### Crear proyecto Firebase (10 min)
1. Ir a https://console.firebase.google.com
2. Add project → "Nexum Driver" → continuar (puedes desactivar Analytics)
3. Una vez creado: click en el ícono Android
4. **Android package name:** `com.nexum.driver_app`
5. **App nickname:** `Nexum Driver`
6. **Debug signing certificate SHA-1:** ejecutar:
   ```
   cd AppTransport/android
   ./gradlew signingReport
   ```
   Copiar el `SHA-1` del config `debug`.
7. Click "Register app" → **Descargar `google-services.json`**
8. Click "Next" en los pasos siguientes (la integración del SDK ya está en el código).

### Configurar en el proyecto

**Para builds locales:**
Colocar el archivo descargado en:
```
AppTransport/android/app/google-services.json
```

**Para CI/CD:**
```bash
# En tu máquina local:
base64 -w 0 AppTransport/android/app/google-services.json
```
Copiar el output y agregarlo a GitHub Secrets:
- Name: `GOOGLE_SERVICES_BASE64`
- Value: `<el base64 completo>`

### Enviar push notifications desde el backend
El servicio `PushNotificationService` ya está conectado. Para enviar una push desde el backend Node.js, agregar:
```bash
npm install firebase-admin
```
Y usar el SDK admin con la `serviceAccountKey.json` (descargable desde Firebase → Project Settings → Service accounts).

---

## 3. CI/CD — GitHub Actions

### Workflows ya configurados:

| Workflow | Trigger | Output |
|---|---|---|
| `build-apk.yml` | push a `AppTransport/**` | APK + AAB descargable en Actions |
| `deploy-web.yml` | push a `AppTransport/**` | Deploy a `kev1011.github.io/nexum-store/` |

### Para activar/probar:
1. **GitHub → Actions → Build Nexum Driver APK** → **Run workflow** (botón verde)
2. Esperar ~8 min
3. **Artifacts** al final del workflow → descargar `nexum-driver-apk`

### Secrets necesarios en GitHub:
| Secret | Para qué | Obligatorio |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Mapa real sin watermark | Sí (recomendado) |
| `GOOGLE_SERVICES_BASE64` | Firebase push notifications | Opcional |
| `KEYSTORE_BASE64` | Firmar APK para Play Store | Opcional (debug funciona sin él) |
| `STORE_PASSWORD` | Password del keystore | Solo si KEYSTORE_BASE64 está |
| `KEY_PASSWORD` | Password de la key | Solo si KEYSTORE_BASE64 está |
| `API_BASE_URL` | URL del backend en producción | Cuando tengas servidor en cloud |
| `WS_BASE_URL` | URL WebSocket en producción | Cuando tengas servidor en cloud |

---

## Estado actual

- [x] Backend Node.js + WebSocket funcionando localmente
- [x] App Flutter conectada al backend
- [x] Audio de notificación en solicitudes
- [x] Web demo en GitHub Pages (mock data)
- [x] CI/CD configurado (APK + web deploy automáticos)
- [ ] Google Maps API Key real → **necesito que la consigas**
- [ ] Firebase google-services.json → **necesito que lo descargues**
- [ ] Backend hosteado en cloud (Render, Railway, Fly.io…) → próximo paso
