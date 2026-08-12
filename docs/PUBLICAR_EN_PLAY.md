# Publicar en Google Play — primera subida

Guía para las **pruebas internas** de las dos apps. Todo lo que aparece aquí
está verificado contra el repo; lo que no pude comprobar desde el entorno de
desarrollo va marcado como **[comprobar tú]**.

Dos apps distintas, dos fichas distintas en Play Console:

| App | `applicationId` | Carpeta |
|---|---|---|
| ZIPA (pasajero) | `com.nexum.nexum_client` | `AppCliente/` |
| ZIPA Conductor | `com.nexum.driver_app` | `AppTransport/` |

---

## 1. De dónde sale el archivo que se sube

Play pide un **AAB** (`.aab`), no un APK. Los workflows ya lo generan:

- `Build Nexum Driver APK` → artefacto `nexum-driver-aab-build<N>`
- `Build Nexum Cliente APK` → artefacto `nexum-cliente-aab-build<N>`

Ve a la pestaña **Actions** de GitHub, abre el run verde más reciente de `main`
y descarga el artefacto que termina en `-aab-build<N>`. Dentro está
`app-release.aab`, que es el que se sube.

El APK del mismo run sirve para instalar a mano y probar; a Play va el AAB.

### Versiones

`versionName` = `1.0.0` (de `pubspec.yaml`) y `versionCode` = **número del run**
de GitHub Actions. Cada build nuevo tiene un número mayor, que es justo lo que
Play exige. Si subes el run 372 no podrás volver a subir el 369.

### Firma

Los workflows firman con la llave estable (alias `nexum`) cuando existen los
secretos `ANDROID_KEYSTORE_BASE64` y `ANDROID_KEYSTORE_PASSWORD`, y **verifican
la huella real del APK** dejando la evidencia en el log:

```
SHA-1 BE:43:56:0E:CB:21:B4:2D:99:A7:5A:3C:B5:6F:B0:FA:05:B5:21:76
```

El paso *Verify APK signature* imprime dos líneas que hay que mirar:

```
Huella SHA-1 del APK: ...
Huella SHA-1 del AAB (lo que se sube a Play): ...
```

Si la del **AAB** coincide con la de arriba, se puede subir. Si no, el bundle
quedó firmado en debug y **Play lo rechaza**; el paso deja además un aviso
amarillo en el run. No falla el build a propósito (sin secretos, la firma debug
es legítima para instalar a mano), así que hay que mirarlo.

> Hasta el 12/08/2026 esta comprobación **no comprobaba nada**: usaba
> `keytool -printcert -jarfile`, que solo lee la firma v1, y un APK de release
> lleva v2/v3 — el log decía `Obtenida: <no se pudo leer>` pasara lo que
> pasara. Ahora el APK se verifica con `apksigner` y el bundle con `keytool`
> (un AAB sí va firmado como JAR).

---

## 2. Lo que Play pide en la ficha

### Política de privacidad (obligatoria)

```
https://<tu-dominio>/legal/privacidad
```

Es una página real, renderizada, que lee el texto versionado del backend. Antes
solo existía `GET /legal/privacy`, que devuelve JSON — eso no vale.

También hay `/legal/terminos` y `/legal/eliminar-cuenta`.

**[comprobar tú]** Ábrelas en el navegador después de desplegar el portal y
confirma que cargan el texto. Si el backend está dormido (plan free de Render),
la primera carga puede tardar; recárgala.

### Eliminación de cuenta (obligatoria si hay cuentas)

Play pide **dos** cosas y las dos existen:

1. **Dentro de la app** — pasajero: Cuenta → *Eliminar mi cuenta*; conductor:
   Ajustes → *Eliminar mi cuenta*.
2. **Una URL pública** alcanzable sin instalar la app:
   `https://<tu-dominio>/legal/eliminar-cuenta`

Esa página dice la verdad de lo que hace el backend: la cuenta se **anonimiza**.
Se van nombre, teléfono, correo, foto, documentos y conversaciones; quedan los
importes y fechas de los servicios completados, ya sin identidad, porque
sostienen la liquidación de las empresas, las cuentas de cobro y los remitos
firmados. **No digas en la ficha que se borra todo** — la página y el
formulario tienen que coincidir.

### Correo de soporte

**[hacer tú]** Define `NEXT_PUBLIC_SUPPORT_EMAIL` en el hosting del portal. Sin
esa variable, `/legal/eliminar-cuenta` no muestra ningún correo — a propósito:
poner uno inventado en la página que lee el revisor garantiza un rebote.

Play además pide un correo de contacto en la ficha, que es un campo aparte.

### Formulario de seguridad de los datos (*Data safety*)

El inventario de qué recoge cada app está en **`docs/PRIVACIDAD_DATOS.md`**.
Úsalo para rellenar el formulario. Los dos puntos que Play mira con lupa:

- **Ubicación precisa** — sí, en las dos apps. Uso: funcionalidad de la app.
  No se comparte con terceros ni se usa para publicidad.
- **Fotos** — sí (documentos del conductor, prueba de entrega, foto de perfil,
  fotos del chat).

---

## 3. Permisos: lo que cambió para esta subida

### La app del conductor ya NO pide ubicación en segundo plano

Se quitó `ACCESS_BACKGROUND_LOCATION`. No hacía falta: el rastreo corre dentro
de un *foreground service* con notificación persistente
(`foregroundServiceType="location"`), y desde Android 10 eso basta con el
permiso «mientras se usa».

Esto te ahorra el **formulario de declaración de permisos** y el **video
demostrativo**, que es de lo que más demora y rechaza una primera publicación.

> Si algún día hiciera falta leer la ubicación **sin** servicio en primer plano,
> hay que volver a declarar el permiso **y** añadir la pantalla de divulgación
> previa que Play exige antes de pedirlo — hoy no existe.

### Se retiraron dos componentes fantasma

El manifiesto del conductor declaraba `.BootReceiver` y
`.LocationForegroundService`, y **ninguna de las dos clases existe**. El
receiver escuchaba `BOOT_COMPLETED` y `MY_PACKAGE_REPLACED`: Android intentaba
instanciarlo al encender el teléfono y justo después de cada actualización desde
Play, con `ClassNotFoundException`. Lo primero que habría visto un tester al
actualizar es «ZIPA Conductor se detuvo».

### Permisos que quedan

**Conductor:** `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`,
`POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`.

**Pasajero:** `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE_LOCATION`,
`ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`.

**[comprobar tú]** Play te dirá el `targetSdk` con el que quedó el bundle y si
cumple el mínimo del momento. Ese número lo pone la versión de Flutter
(3.44.0 en el workflow), no el repo, así que no puedo verificarlo desde aquí. Si
Play lo rechaza por bajo, se sube en `android/app/build.gradle.kts` poniendo un
número explícito en vez de `flutter.targetSdkVersion`.

---

## 4. Antes de subir: que el backend esté al día

Las apps apuntan a `https://nexum-api-trxr.onrender.com`. Abre `/health` y
comprueba:

| Campo | Qué quieres ver | Si no |
|---|---|---|
| `commit` | el de `main` | Render no ha desplegado |
| `intercity` | `conductores-reales` | está el simulador — quita `INTERCITY_SIMULATE` |
| `pagos` | `wompi` o `apagado` | con `apagado` la app solo ofrece efectivo, que es correcto |
| `uploads` | `s3-r2` | con `disco-efimero` las fotos se pierden en cada redeploy |
| `push` | `firebase` | con `apagado` no llegan avisos con la app cerrada |
| `sos` | `sms` | con `sin-canal` el botón de pánico solo deja constancia |
| `otpRiesgo` | `false` | hay un código fijo que sirve para cualquier teléfono |

Los dos que de verdad conviene resolver antes de que haya usuarios reales son
**`uploads`** y **`push`**: la guía está en `docs/ACTIVAR_S3_FCM.md`.

### La cuenta de demostración para el revisor

El revisor de Play **no puede entrar**: el acceso es por SMS a un número
colombiano. Hay una cuenta de demostración prevista (`demoRevision` en
`/health`).

**[hacer tú]** Define en Render `REVIEW_DEMO_PHONE` (un número que no use nadie)
y `REVIEW_DEMO_CODE` (su código fijo). Cuando las dos estén puestas, `/health`
muestra `demoRevision: true`. Luego pon ese número y ese código en Play Console
→ *Acceso a la app* → «Se requieren credenciales», con una nota explicando que
el ingreso es por teléfono + código. Sin esto el rechazo es seguro.

---

## 5. Orden recomendado

1. Render despliega `main`; confirmas `/health`.
2. Portal desplegado; abres `/legal/privacidad` y `/legal/eliminar-cuenta`.
3. Descargas los dos AAB del run verde más reciente.
4. Creas las dos fichas en Play Console.
5. **Pruebas internas** primero (hasta 100 testers, sin revisión completa y
   disponible en minutos). Ahí se prueba de verdad.
6. Cuando el piloto vaya bien, pasas a prueba cerrada o a producción.

No vayas directo a producción para las primeras pruebas: la revisión completa
tarda días y cualquier corrección reinicia la espera.

---

## 6. Lo que fallará en las pruebas si no lo miras

- **Las fotos desaparecen** al redesplegar Render mientras `uploads` sea
  `disco-efimero`. Documentos del conductor, pruebas de entrega, fotos del chat.
- **Los avisos no llegan** con la app cerrada mientras `push` sea `apagado`.
  El conductor no se entera de una solicitud si no tiene la app abierta.
- **Sin `GOOGLE_MAPS_API_KEY`** en Render, los mapas caen a OpenStreetMap y el
  autocompletado de direcciones devuelve vacío. Degrada limpio, no rompe, pero
  se nota.
- **Las reservas intermunicipales creadas con el simulador encendido** siguen
  mostrando un conductor que no existe. Hay que cancelarlas: el arreglo impide
  crear nuevas, no reescribe las viejas.
