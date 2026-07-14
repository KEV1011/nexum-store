# Activar fotos permanentes (R2/S3) y notificaciones push (FCM)

Todo el código ya está en la plataforma y **se enciende solo con configuración**
(variables de entorno y secrets). Sin configurar, cada pieza opera en modo
degradado seguro: fotos al disco efímero de Render (se pierden al redeploy) y
push en modo simulado (solo logs).

**Cómo saber qué está activo:** abre `https://nexum-api.onrender.com/health` —
el campo `uploads` debe decir `s3-r2` (si dice `disco-efimero`, falta config) y
`push` debe decir `firebase` (si dice `apagado`, falta config). El pie del login
de `/admin` muestra lo mismo.

---

## Parte 1 — Fotos permanentes con Cloudflare R2 (gratis hasta 10 GB)

R2 es compatible con S3 y no cobra por descarga. Pasos (una sola vez):

1. Crea una cuenta en https://dash.cloudflare.com (o entra a la tuya).
2. Menú lateral → **R2 Object Storage** → **Create bucket**.
   - Nombre: `nexum-uploads` (o el que prefieras).
   - Location: automático.
3. Dentro del bucket → pestaña **Settings** → **Public access** →
   **R2.dev subdomain** → **Allow Access**. Copia la URL pública que aparece
   (algo como `https://pub-xxxxxxxxxxxx.r2.dev`).
4. Vuelve a R2 → **API** → **Manage API tokens** → **Create API token**:
   - Permissions: **Object Read & Write**, limitado a tu bucket.
   - Copia el **Access Key ID** y el **Secret Access Key** (solo se muestran
     una vez), y el **endpoint** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
5. En Render → servicio **nexum-api** → **Environment** → agrega:

   | Variable | Valor |
   |---|---|
   | `S3_BUCKET` | `nexum-uploads` |
   | `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_ACCESS_KEY_ID` | el Access Key ID del token |
   | `S3_SECRET_ACCESS_KEY` | el Secret del token |
   | `S3_PUBLIC_URL` | la URL `https://pub-....r2.dev` del paso 3 |

6. Guarda (Render redespliega solo). Verifica en `/health`: `"uploads":"s3-r2"`.

Desde ese momento avatares, fotos de productos, portadas de negocios y
documentos del conductor quedan en R2 y **sobreviven a cualquier redeploy**.
Las fotos viejas del disco de Render no se migran (se vuelven a subir).

> Con AWS S3 clásico es igual pero sin `S3_ENDPOINT` y con `S3_REGION` real
> (p. ej. `us-east-1`); `S3_PUBLIC_URL` = la URL pública del bucket o CDN.

---

## Parte 2 — Push FCM (la oferta suena con la app cerrada)

### 2a. Crear el proyecto Firebase (una sola vez)

1. https://console.firebase.google.com → **Agregar proyecto** → nombre `nexum`
   (Analytics: opcional, puedes desactivarlo).
2. Dentro del proyecto → ícono **Android** (Agregar app):
   - **App conductor**: package `com.nexum.driver_app` → Registrar →
     descarga `google-services.json` → guárdalo como `google-services-driver.json`.
   - Repite **Agregar app** → **App cliente**: package `com.nexum.nexum_client` →
     descarga su `google-services.json` → guárdalo como `google-services-cliente.json`.
   (No hace falta seguir los pasos de "agregar SDK" que sugiere la consola —
   ya están en el código.)

### 2b. Backend (Render) — la llave que ENVÍA los push

1. Consola Firebase → ⚙️ **Configuración del proyecto** → **Cuentas de servicio**
   → **Generar nueva clave privada** → descarga el JSON (p. ej. `firebase-admin.json`).
2. Conviértelo a base64. En PowerShell (líneas separadas):

   ```powershell
   $bytes = [IO.File]::ReadAllBytes("C:\ruta\firebase-admin.json")
   [Convert]::ToBase64String($bytes) | Set-Clipboard
   ```

   (Queda copiado al portapapeles.)
3. Render → **nexum-api** → **Environment** → `FIREBASE_SERVICE_ACCOUNT` =
   pega el base64. Guarda.
4. Verifica en `/health`: `"push":"firebase"`.

### 2c. Apps (GitHub) — los APK que RECIBEN los push

1. Convierte cada `google-services.json` a base64 (PowerShell):

   ```powershell
   $b = [IO.File]::ReadAllBytes("C:\ruta\google-services-driver.json")
   [Convert]::ToBase64String($b) | Set-Clipboard
   ```

2. GitHub → repo → **Settings** → **Secrets and variables** → **Actions**:
   - `GOOGLE_SERVICES_BASE64` = base64 del JSON **del conductor**.
   - `GOOGLE_SERVICES_CLIENTE_BASE64` = base64 del JSON **del cliente**
     (repite el comando con `google-services-cliente.json`).
3. Relanza los workflows **Build Nexum Driver APK** y **Build Nexum Cliente APK**
   (pestaña Actions → Run workflow) e instala los APK nuevos en los teléfonos.
   Sin el secret, el APK compila igual pero con push apagado.

### 2d. Probar

1. Instala el APK nuevo del conductor, inicia sesión y acepta el permiso de
   notificaciones. Deja la app **cerrada o en segundo plano**.
2. Desde la app cliente pide un viaje (a menos de 5 km del conductor, que debe
   estar En línea) — al conductor le debe sonar la notificación
   "Nueva solicitud de viaje".
3. En los logs de Render debe aparecer `[Push] Sent driver=...` (si dice
   `[Push:mock]`, el backend no tiene la llave; si dice `Send failed`, el
   token del teléfono aún no se registró: abre la app una vez con sesión).

---

## Qué push envía la plataforma (ya cableados)

| Evento | Recibe |
|---|---|
| Oferta de viaje / mandado / pedido / intermunicipal | Conductor |
| Nuevo flete del tipo de su camión · flete asignado por su flota · flete cancelado por el cliente | Conductor |
| Documento por vencer / vencido | Conductor |
| Conductor asignado (viaje) · contraoferta o confirmación intermunicipal | Cliente |
| Repartidor asignado · pedido en camino · pedido entregado | Cliente |
| Mandadero asignado · mandado entregado | Cliente |
| Flete tomado · carga en camino · flete entregado · flete vuelto a publicar | Cliente |
| Resultado del pago | Cliente |
