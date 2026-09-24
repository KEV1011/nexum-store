# Los secretos: cuáles son, dónde van y de dónde salen

Lista sacada del código —de lo que los workflows y el backend LEEN de verdad—,
no de memoria. Verificada el 2026-09-14 sobre `main` en `4915216`.

> **Ninguno de estos valores está aquí, ni debe estarlo.** Se pegan en la
> consola de GitHub o de Render y no se escriben en el repositorio, en un chat
> ni en un ticket. Si alguno se expone, se rota: no se tapa.

---

## 1. GitHub → Settings → Secrets and variables → Actions

Los leen los workflows al construir los APK.

| Secreto | Para qué | De dónde sale |
|---|---|---|
| `GOOGLE_SERVICES_BASE64` | **Notificaciones del conductor.** Sin él el APK se construye sin Firebase y no recibe ni una oferta | Firebase Console → tu proyecto → app Android `com.nexum.driver_app` → descargar `google-services.json` → pasarlo a base64 |
| `GOOGLE_SERVICES_CLIENTE_BASE64` | Lo mismo para el pasajero | Igual, pero con la app `com.nexum.nexum_client` |
| `ANDROID_KEYSTORE_BASE64` | Firma estable del APK. Sin él se firma con llave de depuración y **las actualizaciones no instalan encima** | El `.jks` generado en julio (alias `nexum`), en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Su contraseña | Lo mismo |
| `GOOGLE_MAPS_API_KEY` | Mapas dentro del APK del conductor | Google Cloud Console |
| `SENTRY_DSN_CLIENTE` · `SENTRY_DSN_DRIVER` | Opcional: ver los errores de las apps en producción | Sentry |
| `FIREBASE_SERVICE_ACCOUNT_JSON` · `FIREBASE_APP_ID_CLIENTE` · `FIREBASE_APP_ID_DRIVER` | Opcional: repartir los APK por App Distribution | Firebase |

> **En la casilla del valor va el CONTENIDO, no el nombre.** Pasó con los dos
> secretos de Firebase a la vez: en *Value* quedó escrito `GOOGLE_SERVICES_BASE64`
> y `GOOGLE_SERVICES_CLIENTE_BASE64`. El nombre son letras, dígitos y guiones
> bajos —todo del alfabeto base64—, así que no lo caza ningún control de «parece
> base64»: el build moría con `base64: invalid input` y el valor enmascarado como
> `***`. Hoy el paso lo dice con esas palabras y se corta en dos segundos.

**Pasar un archivo a base64 en PowerShell** (una línea, sin `&&`):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\google-services.json")) | Set-Clipboard
```

Queda en el portapapeles listo para pegar. Después hay que **relanzar los dos
builds de APK**: los secretos no reconstruyen nada por sí solos.

**Cómo comprobar que quedó bien:** en la ejecución del workflow, el resumen ya
no muestra el aviso «⚠️ Este APK NO recibe notificaciones».

---

## 2. Render → `nexum-api` → Environment

En orden de lo que más duele hoy.

### 2.1 Twilio — apaga la llave maestra y enciende el SOS

**Son dos juegos distintos, y hace falta LOS DOS.** Es el detalle que se pasa
por alto: poner solo el primero deja el botón de emergencia mudo.

| Variable | Enciende |
|---|---|
| `TWILIO_ACCOUNT_SID` | (común a los dos) |
| `TWILIO_AUTH_TOKEN` | (común a los dos) |
| `TWILIO_VERIFY_SID` | **El OTP por SMS.** Con esto `/health` pasa de `llave-maestra-piloto` a `twilio-sms` y `otpRiesgo` a `false` |
| `TWILIO_MESSAGING_SERVICE_SID` **o** `TWILIO_FROM_NUMBER` | **El SOS.** Con esto `sos` pasa de `sin-canal` a `sms` |

Mientras no esté `TWILIO_VERIFY_SID`, un único código fijo (`OTP_FALLBACK_CODE`)
vale como OTP para cualquier teléfono. **Trátalo como una contraseña maestra**,
porque eso es. Cuando Twilio quede puesto, borra `OTP_FALLBACK_CODE`.

### 2.2 La cuenta del revisor — bloqueante para publicar

| Variable | Qué poner |
|---|---|
| `REVIEW_DEMO_PHONE` | Un número tuyo en E.164, p. ej. `+573000000000` |
| `REVIEW_DEMO_CODE` | Seis dígitos que elijas tú |

Quien revisa la app está en California o Dublín y **no va a recibir un SMS
colombiano**. Sin esto, la ficha se rechaza sin que lleguen a ver el producto.
A diferencia del código piloto, esto abre **una** cuenta y solo una.

Comprobar: `/health` → `"demoRevision": true`.

### 2.3 La tarifa del taxi — hay que poner el juego COMPLETO

| Variable |
|---|
| `TAXI_BANDERAZO_COP` |
| `TAXI_POR_KM_COP` |
| `TAXI_CARRERA_MINIMA_COP` |
| `TAXI_POR_MIN_COP` (opcional) |

Salen del **decreto municipal**, no de nosotros. Si falta alguna de las tres
primeras se usa la tarifa genérica: media tarifa daría un número que no es ni
el oficial ni el nuestro. Comprobar: `/health` → `"tarifaTaxi": "decreto-municipal"`.

### 2.4 Cobrar en línea

`WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`,
`WOMPI_EVENTS_SECRET`. Sin ellas la app oculta sola el pago en línea, que es lo
correcto. Comprobar: `/health` → `"pagos": "wompi"`.

### 2.5 Mapas de verdad

`GOOGLE_MAPS_API_KEY`, con **Places API (New) + Geocoding + Routes + Map Tiles**
habilitadas sobre la misma llave. Sin ella el autocompletado vuelve vacío, la
ruta cae a línea recta y las teselas a OpenStreetMap. Comprobar: `/geo/health`.

### 2.6 Quitar, no poner

`INTERCITY_SIMULATE` está puesta A MANO en el panel (el blueprint dice
`false`). Bórrala.

---

## 3. El portal (Vercel y Render `nexum-store`)

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPPORT_EMAIL` | El correo de contacto de las páginas legales. **Opcional**: sin ella se publica `zipalegalcolombia@gmail.com` |
| `NEXT_PUBLIC_BACKEND_URL` | A qué backend apunta el portal (ya debería estar) |

---

## Después de tocar cualquier cosa

1. Render redespliega solo al guardar variables; `nexum-store` **no tiene
   auto-deploy** y hay que lanzarlo a mano con *Clear build cache*.
2. Mira `/health` y compara con lo que dice cada sección de arriba.
3. Para lo que `/health` no cubre —que el bucket escriba de verdad, que Twilio
   conteste—, usa `/admin` → Métricas → **Estado de las integraciones** →
   *Probar ahora*: no mira si la variable existe, la ejercita.
