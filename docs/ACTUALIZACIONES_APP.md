# Cómo llegan las actualizaciones a los teléfonos

Hasta ahora, cada versión nueva significaba mandarle el enlace del APK a cada
conductor y a cada negocio por WhatsApp, y rogar que lo instalaran. Con esto,
al probador **le llega una notificación y actualiza con un toque**.

Es Firebase App Distribution: gratis, sin revisión de tienda, sin esperas. Ya
está cableado en los dos workflows de CI; solo falta configurarlo una vez.

---

## Lo que hay que hacer (una sola vez, ~20 minutos)

### 1. Habilitar App Distribution

En [console.firebase.google.com](https://console.firebase.google.com) → tu
proyecto (`nexum-…`) → menú **Ejecutar** → **App Distribution** → *Comenzar*.

Hazlo para las dos apps (`com.nexum.driver_app` y `com.nexum.nexum_client`).

### 2. Crear el grupo de probadores

Dentro de App Distribution → pestaña **Probadores y grupos** → *Añadir grupo*.

Llámalo exactamente **`pilotos`** (así está puesto en el CI). Si prefieres otro
nombre, créalo y define la variable `FIREBASE_TESTER_GROUPS` en GitHub →
Settings → Secrets and variables → **Variables**.

Añade los correos de tus conductores y dueños de negocio. Cada uno recibe una
invitación por correo; al aceptarla instala una app pequeña de Firebase que es
la que le avisa de cada versión nueva.

### 3. Sacar los dos App ID

En Firebase → ⚙️ **Configuración del proyecto** → pestaña **General** → sección
*Tus apps*. Cada app Android muestra su **ID de la aplicación**, con esta
forma:

```
1:90710396547:android:a1b2c3d4e5f6
```

Anota el de la app del conductor y el de la app del cliente. **No son el mismo.**

### 4. Crear la cuenta de servicio

En [console.cloud.google.com](https://console.cloud.google.com) con el mismo
proyecto → **IAM y administración** → **Cuentas de servicio** → *Crear*.

- Nombre: `github-app-distribution`
- Rol: **Firebase App Distribution Admin** (búscalo así, en inglés)
- Termina, entra a la cuenta creada → pestaña **Claves** → *Agregar clave* →
  *Crear clave nueva* → **JSON**. Se descarga un archivo.

### 5. Cargar los secrets en GitHub

En el repositorio → **Settings** → **Secrets and variables** → **Actions** →
*New repository secret*:

| Nombre | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | El contenido **completo** del archivo JSON del paso 4 |
| `FIREBASE_APP_ID_DRIVER` | El App ID de la app del conductor |
| `FIREBASE_APP_ID_CLIENTE` | El App ID de la app del cliente |

Para el JSON: ábrelo con el Bloc de notas, selecciona todo y pega. Es un solo
valor aunque ocupe varias líneas.

---

## Cómo se usa a partir de ahí

No hay que hacer nada. Cada vez que se fusiona un cambio a `main`, el CI
compila el APK y lo reparte solo. El probador recibe la notificación con el
título del commit como nota de versión, así que sabe **qué** cambió.

Si algún día quieres que una versión NO se reparta, quita los secrets o
desactiva el workflow: el paso se salta solo y el APK queda como artefacto
descargable, igual que antes.

---

## Detalles que conviene saber

**Si faltan los secrets, no se rompe nada.** El paso imprime «Sin secrets de
Firebase — no se reparte» y el build sigue su curso. Es el mismo patrón que la
firma del APK.

**La firma tiene que ser la estable.** App Distribution instala sobre la
versión anterior solo si el APK está firmado con la misma llave. Eso ya lo
resuelven los secrets `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD`,
y el paso *Verify APK signature* del CI deja en el log la huella con la que
quedó firmado. Si ahí ves el aviso de firma debug, los probadores tendrán que
desinstalar antes de actualizar.

**Esto no es Google Play.** Sirve para un piloto con gente conocida, que es lo
que necesitas ahora. Cuando abras al público general vas a querer la tienda:
actualizaciones silenciosas, sin invitación y sin que nadie instale nada
aparte. Eso implica cuenta de desarrollador (25 USD una vez), ficha de tienda,
política de privacidad publicada y revisión de Google — semanas, no días. El
AAB que el CI ya genera es exactamente lo que se sube ahí.
