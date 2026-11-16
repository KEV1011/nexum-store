# Publicar en TestFlight y App Store

Guía paso a paso para llevar **ZIPA** (`com.zipa.cliente`) y **ZIPA Conductor**
(`com.zipa.conductor`) a iPhone. El código ya está preparado (ver «Qué dejó
listo el código», al final); lo que sigue es lo que solo se puede hacer desde
tu cuenta.

El orden importa: cada paso depende del anterior.

---

## 1. Cuenta Apple Developer

- https://developer.apple.com/programs → **US$99 al año**.
- **Como persona**: sale en uno o dos días. En la tienda aparece tu nombre como
  vendedor.
- **Como empresa**: Apple pide el número **D-U-N-S** de la empresa (gratis, pero
  tarda de días a semanas). En la tienda aparece la razón social. Para una app
  de transporte con empresas afiliadas, es lo recomendable.

Apunta tu **Team ID** (10 letras y números): *Membership details* en
developer.apple.com.

## 2. Los dos App ID con sus capacidades

developer.apple.com → *Certificates, Identifiers & Profiles* → *Identifiers* → **+**
→ *App IDs* → *App*.

| App ID | Capacidades que hay que marcar |
|---|---|
| `com.zipa.cliente` | Push Notifications · Sign in with Apple · Associated Domains |
| `com.zipa.conductor` | Push Notifications |

La firma automática suele activarlas sola, pero si la subida falla con
*«Provisioning profile doesn't include the … entitlement»*, es aquí.

## 3. Las dos apps en App Store Connect

https://appstoreconnect.apple.com → *Apps* → **+** → *Nueva app*:

- Plataforma **iOS**, nombre (`ZIPA` y `ZIPA Conductor`), idioma principal
  **Español (México)** o el que prefieras, el **Bundle ID** del paso 2 y un SKU
  cualquiera (`zipa-cliente`, `zipa-conductor`).

**El build no sube si la app no existe aquí primero.**

## 4. La llave de App Store Connect (para que GitHub suba los builds)

App Store Connect → *Usuarios y acceso* → *Integraciones* → *App Store Connect
API* → **Generar llave**:

- Nombre: `GitHub`. **Acceso: Admin** (es el rol que puede usar los
  certificados de distribución gestionados por Apple; con «Developer» la firma
  falla).
- Descarga el `.p8` — **solo se puede descargar una vez**.
- Apunta el **Key ID** y el **Issuer ID** (arriba de la lista).

## 5. Avisos push en iPhone (Firebase)

1. Firebase → tu proyecto → *Configuración* → **Agregar app** → **iOS**, una por
   cada Bundle ID. Descarga los dos `GoogleService-Info.plist`.
2. Apple → *Keys* → **+** → marca **Apple Push Notifications service (APNs)** →
   descarga el `.p8`.
3. Firebase → *Configuración* → *Cloud Messaging* → en **cada** app iOS sube esa
   llave APNs con su Key ID y tu Team ID.

Sin el paso 3 el build funciona, pero ningún aviso llega a un iPhone.

## 6. Los secrets en GitHub

Repositorio → *Settings* → *Secrets and variables* → *Actions* → **New
repository secret**.

En PowerShell, para pasar un archivo a base64 y copiarlo:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

(una vez por archivo; pega en el secret con Ctrl+V)

| Secret | Qué es | ¿Obligatorio? |
|---|---|---|
| `APPLE_TEAM_ID` | El Team ID del paso 1 | Para TestFlight |
| `ASC_KEY_ID` | Key ID de la llave del paso 4 | Para TestFlight |
| `ASC_ISSUER_ID` | Issuer ID del paso 4 | Para TestFlight |
| `ASC_KEY_P8_BASE64` | El `.p8` del paso 4, en base64 | Para TestFlight |
| `GOOGLE_SERVICE_INFO_CLIENTE_BASE64` | El plist de Firebase de `com.zipa.cliente`, en base64 | Para avisos |
| `GOOGLE_SERVICE_INFO_CONDUCTOR_BASE64` | El plist de Firebase de `com.zipa.conductor`, en base64 | Para avisos |
| `GOOGLE_IOS_CLIENT_ID` | Cliente OAuth **iOS** de Google (`XXX.apps.googleusercontent.com`) | Solo si quieres «Continuar con Google» en iPhone |

El workflow comprueba que cada plist sea de su app: si los cruzas, falla
diciéndolo en vez de compilar una app que no recibe avisos.

## 7. Variables del servidor (Render → `nexum-api`)

- `REVIEW_DEMO_PHONE` y `REVIEW_DEMO_CODE`: la cuenta con la que entra el
  revisor (no tiene un número colombiano, no le llega el SMS). Abre solo ese
  número y no pide clave personal.
- `APPLE_CLIENT_IDS`: añade `com.zipa.cliente` (separado por coma de lo que ya
  haya). Sin él, «Continuar con Apple» en iPhone falla al volver.
- Si configuraste Google en iPhone: añade su id iOS a `GOOGLE_OAUTH_CLIENT_IDS`.

Y en el **portal** (Vercel/Render del portal): `APPLE_TEAM_ID` con tu Team ID,
para que el QR de la mesa abra la app en iPhone (si no, abre la web, como hoy).

## 8. Compilar y subir

GitHub → *Actions* → **Build iOS** → *Run workflow* → marca **testflight** →
*Run*. Son dos trabajos (cliente y conductor) de ~15 minutos cada uno en Mac.

Cuando termina en verde, el build aparece en App Store Connect → la app →
**TestFlight** tras 10-30 minutos de procesamiento.

Sin marcar «testflight», el workflow solo comprueba que compila (no pide
ningún secret de Apple).

## 9. TestFlight: probadores

- **Internos** (hasta 100, miembros de tu equipo en App Store Connect): prueban
  **en cuanto termina el procesamiento**, sin revisión de Apple.
- **Externos** (hasta 10.000, cualquiera con su correo o un enlace público):
  el **primer** build pasa por una revisión beta de Apple (uno o dos días).
  Ahí aplican casi todas las reglas de abajo.

Los probadores instalan la app **TestFlight** desde la App Store y aceptan la
invitación.

## 10. Lo que va a mirar la revisión

Pega esto en *App Review Information → Notes* (y en *Test Information* de
TestFlight para la revisión beta), cambiando lo que va entre ángulos:

> ZIPA es una plataforma colombiana de transporte y domicilios. El ingreso es
> con número de celular y código por SMS. Para la revisión, use:
> Teléfono: <+57 300 000 0000> — Código: <123456>
>
> ZIPA Conductor usa la misma cuenta de demostración, ya aprobada como
> conductor. La ubicación en segundo plano se usa solo mientras el conductor
> está «En línea», para asignarle servicios cercanos y compartir su posición
> con el pasajero; iOS muestra el indicador azul todo ese tiempo.
>
> Los pagos son por servicios físicos (transporte y entregas), por eso se
> cobran por fuera de la compra dentro de la app (guía 3.1.3(e)).

Antes de enviarla:

- **La cuenta demo del conductor tiene que estar aprobada** en `/admin`:
  identidad (KYC) verificada y documentos vigentes. En producción hoy
  `KYC_ENFORCE` está activo y el kill-switch documental también: un conductor
  sin aprobar no puede conectarse, y el revisor lo leería como «la app no
  funciona» (guía 2.1).
- **SOS sin Twilio**: el botón avisa «no pudimos avisar a tu contacto, llama
  al 123». Es honesto, pero un revisor puede marcarlo como función incompleta.
  Con Twilio configurado desaparece.
- **Particular y Moto** como transporte de pasajeros: Apple (guía 5.0) exige
  cumplir la ley local y puede pedir acreditar habilitaciones. Taxi e
  Intermunicipal con empresa habilitada están del lado seguro. Es una decisión
  tuya; ver `docs/CUMPLIMIENTO_TIENDAS.md`.
- **Etiquetas de privacidad** de la ficha: salen de
  `docs/PRIVACIDAD_DATOS.md`, y tienen que decir lo mismo que los
  `PrivacyInfo.xcprivacy` de las dos apps.
- **Correo de soporte y URL de privacidad**: los de `/legal/privacidad` y el
  buzón público.

---

## Qué dejó listo el código

Verificado en el repo, no supuesto. Lo vigila `backend/src/lib/ios-tienda.test.ts`.

- **Íconos de marca** en las dos apps, sin canal alfa (App Store rechaza el de
  1024 con alfa). Antes el repo tenía el logo de Flutter y el workflow lo
  pisaba con un pin dibujado en Python. Se regeneran con
  `python3 -I tools/generar-iconos-ios.py` si cambia el logo.
- **Avisos en iPhone**: antes no podían llegar nunca. `init()` del servicio de
  push lanzaba en iOS (las notificaciones locales se configuraban solo para
  Android) y además pedía el token antes de que existiera el de APNs.
- **Firebase por `--dart-define`** (`opciones_firebase.dart`): el plist no
  hace falta dentro del proyecto de Xcode.
- **Entitlements** (`Runner.entitlements`) enlazados en las tres
  configuraciones: avisos en las dos; «Continuar con Apple» y el QR de la mesa
  en el cliente, con los mismos dominios que Android.
- **«Continuar con Google» en iPhone** solo aparece con su id de iOS y con
  Apple al lado. Sin el esquema de URL, la librería nativa cerraba la app al
  tocar el botón; sin Apple, la App Store lo rechaza (guía 4.8).
- **Solo iPhone**: con iPad, Apple pide capturas de iPad y revisa la app en
  iPad, donde el diseño de teléfono se vería estirado.
- **Ya estaban**: manifiestos de privacidad, eliminar la cuenta, reportar y
  bloquear, textos de permisos, clave de cifrado de exportación, ubicación de
  fondo sin pedir «Siempre».

**Lo que no se ha probado nunca**: la ruta firmada del workflow (sin cuenta de
Apple no se puede ejecutar) ni la app en un iPhone real. El primer build de
TestFlight es la prueba de las dos cosas; si la firma falla, el error del paso
«Archivar» dice qué falta.
