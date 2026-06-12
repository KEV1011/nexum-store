# Setup de Producción — Nexum Driver

Pasos para poner la app lista para Play Store / producción real.

---

## 1. Google Maps API Key

> **Arquitectura actual:** las apps NO usan la key directamente. El mapa
> visual se dibuja con OpenStreetMap (sin key). Lo que usa Google es el
> **backend**, vía el proxy `/geo/*`: autocompletado de direcciones (Places
> API New), dirección desde GPS (Geocoding API) y ruta+ETA real (Routes API).
> Por eso la key se configura **en Render**, no en GitHub ni en la app.

### Conseguir la key (5 min)
1. Ir a https://console.cloud.google.com/google/maps-apis/start
2. Crear un proyecto nuevo (o seleccionar uno existente)
3. **Habilitar billing** en el proyecto (obligatorio — sin billing TODAS las
   llamadas fallan con `REQUEST_DENIED`; el crédito gratuito mensual de
   Google cubre de sobra el uso de un piloto)
4. **Habilitar estas 3 APIs** (Library → buscar → Enable):
   - **Places API (New)** — ojo: la "(New)", no la legacy
   - **Routes API**
   - **Geocoding API**
5. Ir a **Credentials → Create Credentials → API Key** y copiar la key (`AIza...`)
6. **Restringir la key** (importante — pero del modo correcto):
   - **Application restrictions → None** (la key se usa desde el servidor;
     restringirla a Android/HTTP referrers hace que Google RECHACE las
     llamadas del backend)
   - **API restrictions → Restrict key** → marcar solo las 3 APIs de arriba

### Configurar en el proyecto

En https://dashboard.render.com → servicio `nexum-api` → **Environment**:
- Key: `GOOGLE_MAPS_API_KEY` · Value: `AIzaXXXXXXXXXXXXXXX`

Render reinicia el servicio solo. Nada que tocar en las apps ni en GitHub.

### Verificar que quedó bien
Abrir en el navegador: `https://nexum-api.onrender.com/geo/health`
- `keyConfigured: false` → falta la variable en Render.
- `upstreamOk: false` + `upstreamError` → ahí dice la causa exacta
  (API no habilitada, billing apagado, key restringida, etc.).
- `upstreamOk: true` → búsqueda de direcciones, ETA y rutas funcionando.

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
