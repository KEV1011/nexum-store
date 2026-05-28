# Setup de Producción — Nexum Driver

Pasos para poner la app lista para Play Store / producción real.

---

## 1. Google Maps API Key

### Conseguir la key (5 min)
1. Ir a https://console.cloud.google.com/google/maps-apis/start
2. Crear un proyecto nuevo (o seleccionar uno existente)
3. **Habilitar estas APIs:**
   - Maps SDK for Android
   - Maps JavaScript API (para web)
   - Places API (opcional — autocompletado de direcciones)
4. Ir a **Credentials → Create Credentials → API Key**
5. Copiar la key (`AIza...`)
6. **Restringir la key** (importante — evita uso indebido):
   - Application restrictions → Android apps → agregar `com.nexum.driver_app` con el SHA-1 de tu keystore
   - HTTP referrers → agregar `kev1011.github.io/*` para web

### Configurar en el proyecto

**Opción A — Para builds locales (Android):**
Agregar a `AppTransport/android/local.properties`:
```
google.maps.api.key=AIzaXXXXXXXXXXXXXXX
```

**Opción B — Para builds en CI/CD (recomendado):**
En GitHub → Settings → Secrets and variables → Actions → New repository secret:
- Name: `GOOGLE_MAPS_API_KEY`
- Value: `AIzaXXXXXXXXXXXXXXX`

Al hacer push, el workflow inyecta la key automáticamente en:
- APK / AAB (manifestPlaceholders)
- Build web (sed en `build/web/index.html`)

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
