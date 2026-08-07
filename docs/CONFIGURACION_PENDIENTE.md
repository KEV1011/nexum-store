# Configuración pendiente para producción — ZIPA

Guía paso a paso de lo que falta configurar. **Todo el código ya está hecho y
verificado**; esto son ajustes en paneles externos (Render, Cloudflare, Twilio,
Firebase, Google, GitHub).

Cada paso indica **cómo comprobar que quedó bien**. No des nada por hecho hasta
ver la comprobación: en esta plataforma varias variables "parecen" configuradas
y fallan al usarse de verdad.

> **Herramienta clave:** el panel `/admin` → pestaña **Métricas** → sección
> **Estado de las integraciones** → botón **Probar ahora**. No mira si las
> variables existen: las **ejercita** (escribe en el bucket, consulta Twilio) y
> te dice exactamente qué falla y dónde arreglarlo.

---

## 0. Desplegar el backend (HAZLO PRIMERO)

Lo demás no se puede comprobar sobre un build viejo, y el último cambio incluye
**migración de base de datos** (los PIN de custodia).

1. Render → servicio **`nexum-api`** → **Manual Deploy → Deploy latest commit**.
2. Espera a que diga **Live**. El Dockerfile corre `prisma migrate deploy` solo:
   no tienes que ejecutar nada a mano.
3. Comprueba: abre `https://nexum-api-trxr.onrender.com/health` y confirma que
   `commit` coincide con el último de `main`.

> Si Render tiene **Auto-Deploy** activo, se actualiza solo al fusionar a `main`.
> Merece la pena activarlo (Settings → Build & Deploy → Auto-Deploy: Yes).

---

## 1. Fotos permanentes — Cloudflare R2 (casi listo)

**Estado:** la escritura ya funciona. Falta que las fotos se **vean**.

**Qué pasa:** `S3_PUBLIC_URL` apunta a un bucket distinto de `S3_BUCKET`, así que
las fotos se guardan pero dan 404 al abrirlas.

1. Cloudflare → **R2** → entra al bucket **`nexum-uploads`** (el nombre exacto
   que tiene `S3_BUCKET`).
2. Pestaña **Settings** → sección **Public Development URL**:
   - Si está **Disabled** → pulsa **Enable**.
   - Copia la URL que aparece ahí: `https://pub-XXXXXXXX.r2.dev`.
3. Render → `nexum-api` → **`S3_PUBLIC_URL`** = esa URL. Guardar (Render
   reinicia solo).

**Comprobar:** `/admin` → Métricas → **Probar ahora** → debe decir
`escritura: ok · lectura pública: ok`.

> ⚠️ La URL pública es **por bucket**. Si tienes varios buckets, es fácil copiar
> la del equivocado — que es justo lo que pasó.

> ℹ️ Las fotos subidas antes de R2 estaban en disco efímero y **no se migran**:
> los conductores tendrán que volver a subir documentos. Mejor hacerlo ya, con
> pocos usuarios.

---

## 2. SMS reales — Twilio Verify

**Estado:** las credenciales son válidas (Twilio respondía), pero **no puede
enviarte SMS**. Ahora mismo está desactivado y el login usa tu código fijo.

**Por qué falló:** la cuenta de Twilio está en modo **prueba (trial)** y solo
envía a números verificados previamente. (La otra causa posible es que Colombia
no esté habilitada.)

### 2a. Preparar Twilio
1. Consola de Twilio → **Phone Numbers → Manage → Verified Caller IDs** →
   **Add a new number** → tu `+57...` → te llega un código → confírmalo.
2. **Verify → Settings → Geo Permissions** → asegúrate de que **Colombia** esté
   permitida.

### 2b. Activar

Son **dos cosas distintas** y mucha gente configura solo la primera:

**Los códigos de acceso (OTP)** — Twilio *Verify*:

| Variable | Dónde sale |
|---|---|
| `TWILIO_ACCOUNT_SID` | Home de la consola (`AC...`) |
| `TWILIO_AUTH_TOKEN` | Home de la consola (botón *Show*) |
| `TWILIO_VERIFY_SID` | Verify → Services → tu servicio (`VA...`) |

**Las alertas de pánico (SOS)** — SMS normales, que Verify **no** sabe mandar.
Añade **una** de estas dos:

| Variable | Dónde sale |
|---|---|
| `TWILIO_FROM_NUMBER` | un número tuyo de Twilio (`+1...` o `+57...`) |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging → Services (`MG...`) — preferible si tienes varios números |

> ⚠️ Sin una de esas dos, el botón de pánico **no avisa a nadie** aunque el
> login por SMS funcione perfectamente. Verify es solo para códigos.

**Comprobar en `/health`:** `"otp":"twilio-sms"` (códigos) **y** `"sos":"sms"`
(pánico). Si ves `"sos":"sin-canal"`, te falta el número emisor.

> 🚨 **El interruptor es de todo o nada, y puede dejarte fuera de tu panel.**
> En cuanto existan las tres variables de Verify, **`OTP_FALLBACK_CODE` deja de
> funcionar en todas las superficies, `/admin` incluido**: no hay mezcla. Si tu
> cuenta sigue en *trial* y tu número de admin no está en *Verified Caller IDs*,
> no podrás entrar. **Verifica tu número ANTES de poner las variables.**

> 🔙 **Cómo salir si algo falla:** borra esas variables en Render. Vuelves al
> instante a tu `OTP_FALLBACK_CODE` y además se reinicia el proceso, lo que
> limpia el contador que provoca el error *429 Too Many Requests*.

> ⚠️ **Para usuarios reales tienes que salir de trial** (cargar saldo). En trial
> solo funcionan números verificados uno a uno: inviable para clientes. La
> cuenta de demostración (`REVIEW_DEMO_PHONE`) es la única excepción — nunca
> pasa por Twilio, así que sigue entrando con su código en cualquier caso.

---

## 3. Firma estable de los APK (GitHub)

**Para qué:** que las actualizaciones se instalen **encima** de la app existente
(hoy hay que desinstalar cada vez) y poder subir a Google Play.

El keystore ya está generado y te lo entregué (`nexum-release.jks` +
`nexum-release.jks.base64.txt`).

1. GitHub → `https://github.com/KEV1011/nexum-store/settings/secrets/actions`
   → **New repository secret** (dos veces):

| Name | Secret |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | todo el contenido de `nexum-release.jks.base64.txt` (una línea larga) |
| `ANDROID_KEYSTORE_PASSWORD` | `RRxDxwlAB1yiTEqVwORbpKfh` |

2. Actions → vuelve a lanzar **Build Nexum Driver APK** y **Build Nexum Cliente APK**.

**Comprobar:** en el log del build, el paso **`Verify APK signature`** debe decir
`✅ Firmado con la llave estable de ZIPA`.

> ⚠️ **Guarda el keystore y la contraseña.** Si los pierdes no podrás volver a
> actualizar la app en Play con la misma identidad.
> ⚠️ Solo esta vez hay que **desinstalar** la app vieja (firma distinta). Desde
> ahí en adelante, las actualizaciones entran encima.

Huellas de tu llave (por si Firebase o Google las piden):
- **SHA-1:** `BE:43:56:0E:CB:21:B4:2D:99:A7:5A:3C:B5:6F:B0:FA:05:B5:21:76`
- **SHA-256:** `72:76:A3:28:38:59:42:AF:D9:5A:6F:F5:6F:87:3B:F3:B6:A4:3E:7D:2A:1C:F7:DD:1E:31:17:5B:2B:19:EC:AD`

---

## 4. Notificaciones push — Firebase (FCM)

**Estado:** `push: apagado`. Sin esto, el conductor no se entera de una oferta
con la app cerrada, ni el cliente de que su pedido va en camino.

Guía detallada: **`docs/ACTIVAR_S3_FCM.md`** (parte 2). Resumen:

1. Consola de Firebase → crea el proyecto (una vez).
2. Añade **dos apps Android** con estos IDs exactos:
   - `com.nexum.driver_app` (conductor)
   - `com.nexum.nexum_client` (cliente)
   Descarga el `google-services.json` de cada una.
3. Conviértelos a base64 (**PowerShell**, líneas separadas):
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\driver\google-services.json")) | Set-Clipboard
   ```
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\cliente\google-services.json")) | Set-Clipboard
   ```
4. GitHub → secrets: `GOOGLE_SERVICES_BASE64` (conductor) y
   `GOOGLE_SERVICES_CLIENTE_BASE64` (cliente).
5. Firebase → Configuración → **Cuentas de servicio** → *Generar nueva clave
   privada* → el JSON completo va a Render como **`FIREBASE_SERVICE_ACCOUNT`**.

**Comprobar:** `/health` debe decir `"push":"firebase"`, y una oferta real debe
sonar con la app cerrada.

---

## 5. Mapas de Google

**Comprobar primero si ya está:** abre `https://nexum-api-trxr.onrender.com/geo/health`.
Debe responder `ok` en **las cuatro** APIs (`geocoding`, `places`, `routes`,
`mapTiles`). Si dice `sin llave`, falta configurarlo.

1. Google Cloud Console → habilita en el proyecto: **Places API (New)**,
   **Geocoding API**, **Routes API** y **Map Tiles API**.
2. Crea una clave y ponla en Render como **`GOOGLE_MAPS_API_KEY`**.
3. **Restricción correcta:** por **API** (solo esas cuatro) y, si quieres
   endurecer, por **IP**.

> ⚠️ **No la restrinjas por huella SHA-1.** Esa restricción es para claves
> embebidas en un APK; aquí la clave vive **solo en el servidor** y las apps
> piden todo por `/geo/*`. Restringirla por SHA-1 bloquearía todas las peticiones.

> Sin la clave, los mapas caen a OpenStreetMap y **siguen funcionando** (solo
> pierdes las teselas de Google y el autocompletado).

---

## 6. Cobros reales — Wompi

Confirma que las variables de Render son las de **producción** y no las de
pruebas: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET`,
`WOMPI_INTEGRITY_SECRET`.

**Comprobar:** haz **una transacción real de bajo monto** y verifica que:
1. La app muestra el resultado (aprobado/rechazado) — sondea sola hasta cerrar.
2. El pago aparece conciliado en el panel.

---

## 7. Antes de abrir al público (IMPORTANTE)

### 7a. Apagar el modo piloto
Render → **`PILOT_SKIP_VERIFICATION=false`**.

Mientras esté en `true`, **cualquiera que se registre como conductor recibe
viajes sin que le revises cédula, licencia, SOAT ni tarjeta** — se salta incluso
el KYC. Es útil para arrancar con conductores que conoces; es un riesgo legal y
de seguridad con público abierto.

**Este permiso caduca solo.** Encenderlo obliga a decir hasta cuándo:

```
PILOT_SKIP_VERIFICATION=true
PILOT_SKIP_VERIFICATION_UNTIL=2026-09-05      # YYYY-MM-DD, hasta el final de ese día
```

Sin la fecha, **el servicio no arranca** (un permiso así no puede quedarse
encendido por olvido). Llegada la fecha, la verificación vuelve a exigirse sola
y el servicio sigue corriendo — falla del lado seguro, no se cae.

**Antes de que caduque**, aprueba desde `/admin` los documentos de tus
conductores reales, o se quedarán sin recibir servicios. El panel te lo
recuerda: la pestaña Métricas muestra en rojo cuántos conductores están en
línea o en viaje **sin documentos revisados** y cuántos días quedan.

**Comprobar:** `/health` → `"pilotSkipVerification":false`
(mientras esté activo trae también `pilotSkipVerificationUntil` y
`pilotSkipVerificationDaysLeft`).

### 7b. Otros interruptores a considerar

| Variable | Qué hace | Cuándo activarla |
|---|---|---|
| `DOC_KILL_SWITCH_ENFORCE=true` | Un documento vencido saca al conductor del despacho | Cuando tengas documentos con fecha cargados |
| `LEGAL_CONSENT_ENFORCE=true` | Exige aceptar términos al registrarse | Cuando todos usen una app reciente |
| `INTERCITY_DUAL_MODEL=true` | Rutas troncales solo para empresas habilitadas | Cuando haya empresas verificadas con rutas autorizadas |
| `KYC_ENFORCE=true` | Exige identidad verificada para conectarse | Cuando tengas proveedor de KYC o revisión manual al día |

---

## 8. Distribución

### Google Play
- Cuenta de Play Console (**US$25**, pago único).
- Sube el **`.aab`** firmado (artefacto `-aab` del build).
- Ficha: descripción, capturas, política de privacidad.
- **Privacy labels**: usa el inventario de `docs/PRIVACIDAD_DATOS.md`.
- El `versionCode` ya crece solo en cada build.

### iOS
- Cuenta Apple Developer (**US$99/año**).
- La base ya compila: workflow **Build iOS (sin firma)**.
- Para instalar en iPhone real hace falta firma + TestFlight.

---

## 9. Legal (tu representante)

- **Agente DMCA**: registrarlo (`docs/DMCA_AGENTE.md`), renovable cada 3 años.
- **Privacy labels** de ambas tiendas con `docs/PRIVACIDAD_DATOS.md`.

---

## Orden recomendado

1. **Deploy** (paso 0) — desbloquea comprobar todo lo demás.
2. **R2** (paso 1) — es un cambio de una variable y cierra las fotos.
3. **Firma APK** (paso 3) — dejas de desinstalar en cada actualización.
4. **Twilio** (paso 2) — cuando salgas de trial.
5. **Push + Maps** (pasos 4 y 5).
6. **Wompi** (paso 6) y **apagar el piloto** (paso 7) — justo antes de abrir.

Con los pasos 0–3 tienes un **piloto sólido**. Con 4–7, **lanzamiento público**.
