# Activar «Continuar con Google» y «Continuar con Apple»

Los botones existen en la app cliente (Android y web) pero **solo aparecen si el
backend los anuncia**. Sin las variables de abajo, la pantalla de ingreso queda
como estaba (solo teléfono). Comprobación: `GET /health` → `accesoSocial`
(`apagado` · `google` · `apple` · `google+apple`).

## Por qué importa

Sin SMS, el login por teléfono usa un código fijo (`OTP_FALLBACK_CODE`) que
conoce todo el que prueba la app: con él se entra a la cuenta de **cualquier**
número. Google y Apple verifican a la persona y firman un token que el servidor
comprueba (`backend/src/lib/id-token.ts`). Se entra por el identificador de la
cuenta de Google/Apple, **nunca por el correo** (ver `acceso-social.service.ts`).

---

## Google (gratis, ~20 minutos)

Se hace en el **mismo proyecto de Google Cloud que usa Firebase** (el de las
notificaciones), en https://console.cloud.google.com → *APIs y servicios*.

1. **Pantalla de consentimiento de OAuth** → tipo *Externo* → nombre «ZIPA»,
   correo de soporte `zipalegalcolombia@gmail.com`, logo, y los enlaces a
   `…/legal/privacidad` y `…/legal/terminos`. Ámbitos: solo `email`,
   `profile`, `openid` (no piden verificación de Google). Publícala
   («En producción»); en «Prueba» solo entran los correos que agregues.
2. **Credenciales → Crear ID de cliente OAuth → Aplicación web.**
   *Orígenes de JavaScript autorizados*:
   - `https://kev1011.github.io` (la app web)
   - el dominio propio cuando exista.
   Copia el **ID de cliente** (`xxxx.apps.googleusercontent.com`). Ese es EL id:
   la app lo usa en la web y en Android.
3. **Credenciales → Crear ID de cliente OAuth → Android.**
   - Paquete: `com.zipa.cliente`
   - SHA-1: la huella de la llave con la que se firma el APK/AAB. Sale de
     `keytool -list -v -keystore nexum.jks -alias nexum` (la llave de los
     secrets `ANDROID_KEYSTORE_*`). **Si se publica en Play con «Firma de
     apps de Google Play», agrega TAMBIÉN la SHA-1 que muestra Play Console**
     (Configuración → Integridad de la app): es la que firma lo que instala la
     gente.
   No hay que copiar nada de este cliente: basta con que exista.
4. En **Render → nexum-api → Environment**:
   ```
   GOOGLE_OAUTH_CLIENT_IDS=xxxx.apps.googleusercontent.com
   ```
   (el id del cliente **web** del paso 2). Redesplegar.
5. Probar: `/health` debe decir `accesoSocial: google`; en la app aparece
   «Continuar con Google» bajo la casilla de términos.

## Apple (requiere cuenta Apple Developer, US$99/año)

Sin esa cuenta no se puede activar. Cuando exista (https://developer.apple.com):

1. *Identifiers → App IDs*: el de la app (cuando haya app iOS), con la
   capacidad **Sign In with Apple**.
2. *Identifiers → Services IDs*: crear `com.zipa.cliente.web`, activar
   **Sign In with Apple** → *Configure*:
   - Domains: `kev1011.github.io` y el dominio del backend
     (p. ej. `nexum-api-trxr.onrender.com`).
   - Return URLs: `https://<backend>/client/auth/apple/callback` (Android) y
     la URL exacta de la app web (`https://kev1011.github.io/<ruta>/`).
3. En Render:
   ```
   APPLE_CLIENT_IDS=com.zipa.cliente.web
   APPLE_SERVICES_ID=com.zipa.cliente.web
   APPLE_REDIRECT_URI=https://<backend>/client/auth/apple/callback
   ```
   (Cuando haya app iOS, agrega su bundle id a `APPLE_CLIENT_IDS`, separado por
   coma.) **App Store exige Apple si la app iOS ofrece Google** (regla 4.8).

## Lo que NO cambia

- El login por teléfono sigue. Mientras no haya SMS, **sigue siendo la puerta
  débil**: cuando Google esté activo, se puede cerrar quitando
  `OTP_FALLBACK_CODE` (las cuentas que entraron solo por teléfono quedarían
  fuera hasta tener SMS — decídelo antes).
- Las cuentas de Google/Apple nacen **sin teléfono**: no se pide uno que no
  podemos comprobar.

## Panel admin: código propio (hacer YA)

El panel aceptaba la misma llave que la app. Define en Render:
```
ADMIN_OTP_CODE=<8+ dígitos, distinto de OTP_FALLBACK_CODE>
```
Mientras no esté, `/health` muestra `otpAdmin: llave-maestra-COMPARTIDA-con-la-app`.
