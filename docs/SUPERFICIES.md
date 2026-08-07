# Las superficies de ZIPA — dónde está cada cosa

Inventario de las **cinco superficies** del producto: qué hace cada una, quién
la usa, dónde se entra y qué build lleva. Pensado para probar todo sin adivinar.

> **Regla de oro para probar:** el `Deploy live` en verde de Render **no**
> prueba que corra el commit nuevo. Compruébalo siempre con `/health`
> (backend) o `/api/version` (portal). Los dos devuelven el commit exacto.

---

## Mapa rápido

| # | Superficie | Quién la usa | Dónde |
|---|---|---|---|
| 1 | **Backend + API** | todo lo demás | `https://nexum-api-trxr.onrender.com` |
| 2 | **App Cliente** (Flutter) | pasajeros, compradores | APK · web · iOS sin firmar |
| 3 | **App Conductor** (Flutter) | conductores y repartidores | APK · web · iOS sin firmar |
| 4 | **Portal web** (Next.js) | empresas de transporte y negocios | `https://nexum-store.onrender.com` |
| 5 | **Panel de administración** | tú | `https://nexum-api-trxr.onrender.com/admin` |

---

## 1 · Backend y API

- **Dónde:** `https://nexum-api-trxr.onrender.com`
- **Servicio Render:** `nexum-api` (plan *starter* — sin cold-starts), rama `main`,
  auto-deploy si está activado en Settings → Build & Deploy.
- **Base de datos:** PostgreSQL + PostGIS en Render (`nexum-db`). Las migraciones
  las corre el propio arranque (`prisma migrate deploy`).

**Diagnóstico — `GET /health`.** Es la fuente de verdad de qué corre y con qué
integraciones. Devuelve, entre otros:

| Campo | Qué significa |
|---|---|
| `commit` | el build exacto que está vivo |
| `otp` / `otpAdmin` | `twilio-sms` · `codigo-fijo-propio` · `piloto-123456` · `cerrado` |
| `otpRiesgo` | `true` = la llave maestra del OTP sigue encendida |
| `sos` | `sms` = el botón de pánico avisa · `sin-canal` = solo empuja al 123 |
| `uploads` | `s3-r2` = fotos permanentes · `disco-efimero` = se pierden al redeploy |
| `push` | `firebase` · `apagado` |
| `pagos` | Wompi encendido o apagado |
| `pilotSkipVerificationUntil` / `…DaysLeft` | cuándo caduca el modo piloto |
| `docKillSwitch`, `kyc`, `ocr`, `background`, `legalConsent` | los demás interruptores |

También hay `GET /` (página amable con enlaces) y `GET /geo/health`, que prueba
las cuatro APIs de Google (geocoding, places, routes, map tiles).

---

## 2 · App Cliente — pasajeros y compradores

**Paquete:** `nexum_client` · **applicationId:** `com.nexum.nexum_client`

**Cómo instalarla o abrirla:**
- **Android (APK):** GitHub → Actions → *Build Nexum Cliente APK* → última corrida
  → artifact **`nexum-cliente-apk`**. Para Play Store, `nexum-cliente-aab`.
- **Web (funciona en Safari de iPhone):** `https://kev1011.github.io/nexum-store/cliente/`
- **iOS:** workflow manual *Build iOS (sin firma)* → `nexum-cliente-ipa-unsigned`.
  Para instalar en un iPhone real hace falta cuenta Apple Developer + TestFlight.

**Qué puede hacer:**

| Pantalla | Para qué |
|---|---|
| Home / movilidad | pedir viaje urbano (taxi, moto, particular), envíos y mandados; mapa con conductores reales cerca |
| Intermunicipal | reservar entre municipios, con paradas ("pasa por"), seguimiento en vivo del conductor |
| Cupos compartidos | buscar salidas programadas publicadas por empresas |
| Negocios y pedidos | catálogo con fotos, carrito, checkout, seguimiento con PIN de entrega |
| Fletes de carga | publicar un flete (turbo/camión/mula), ver el camión en el mapa, cancelar |
| Pon tu precio | negociar la tarifa del viaje urbano |
| Cuenta | perfil con foto, direcciones guardadas, historial, soporte con tickets |
| Seguridad | botón SOS, contacto de confianza, compartir viaje |
| Pagos | Wompi con confirmación real (sondea hasta aprobado o rechazado) |

---

## 3 · App Conductor — conductores y repartidores

**Paquete:** `nexum_driver` · **applicationId:** `com.nexum.driver_app`

**Cómo instalarla o abrirla:**
- **Android (APK):** Actions → *Build Nexum Driver APK* → artifact **`nexum-driver-apk`**
  (o `nexum-driver-aab` para Play).
- **Web:** `https://kev1011.github.io/nexum-store/`
- **iOS:** *Build iOS (sin firma)* → `nexum-driver-ipa-unsigned`.

**Qué puede hacer:**

| Pantalla | Para qué |
|---|---|
| Home | conectarse (botón en la barra de vidrio), panel arrastrable, mapa, ofertas entrantes |
| Preferencias de servicio | qué recibe: pasajeros, encargos, intermunicipal. **En línea recibe de todo y decide cada solicitud** |
| Viaje activo | navegación, ruta real por calles, PIN de recogida y entrega, prueba fotográfica |
| Intermunicipal | disponibilidad, solicitudes, viaje activo con fases |
| Cupos | publicar salidas, gestionarlas, manifiesto de pasajeros |
| Mis fletes de carga | tomar fletes disponibles, iniciar, completar, bitácora de tanqueo y paradas |
| Ganancias y billetera | historial real de liquidaciones, retiros |
| **Nexum Pro** | niveles Bronce → Diamante por servicios liquidados y calificación |
| Verificación | documentos, selfie de identidad (KYC) |
| Perfil, calificaciones, soporte | identidad real, distribución de estrellas, tickets |
| Seguridad | SOS y contacto de confianza |

**Kill-switch documental:** con `DOC_KILL_SWITCH_ENFORCE=true`, un conductor con
documentos vencidos no puede conectarse y sale del despacho. Ve un banner rojo
con el motivo. Hoy el interruptor está apagado por defecto.

---

## 4 · Portal web — empresas y negocios

**Next.js.** Publicado en **dos sitios**: Render (`nexum-store.onrender.com`, el
canónico — es a donde apunta `PORTAL_BASE_URL`) y Vercel (auto-deploy en cada
push; son los checks del PR).

> ⚠️ **Render no tiene auto-deploy** en este servicio. Si el portal "sigue
> viejo", es esto. Manual Deploy con *Clear build cache*, o activa Auto-Deploy.
> Comprobación: `GET /api/version` devuelve el commit.

### 4a · `/empresa` — Torre de control de la flota

Entra el dueño o su equipo con **OTP al celular** (el que registró la empresa, o
el de un miembro que él dio de alta). Secciones:

| Sección | Contenido |
|---|---|
| **Torre de control** | KPIs en vivo (en línea, disponibles, en viaje), mapa de la flota, alertas de ruta (desvío, detención, llegada) |
| **Equipo** | conductores afiliados —con **chips de "Docs vencidos", "Por vencer" e "Intermunicipal"**— , vehículos y accesos del portal por rol (OWNER / DISPATCHER / VIEWER) |
| **Viajes** | liquidación de **todos** los servicios (viaje, intermunicipal, mandado, pedido, flete y **viaje de carga**) con rango de fechas, atajo "Mes pasado" y CSV del mismo rango |
| **Finanzas** | bruto, comisión, neto, **margen real**, costo por km, km/galón, por servicio, conductor y vehículo |
| **Carga** | viajes de carga con sus remitos, cuentas de cobro con anticipos y abonos, tablero de fletes del marketplace, informe final por viaje |
| **Intermunicipal** | rutas troncales declaradas (el admin las autoriza) y salidas programadas con manifiesto |
| **Mi empresa** | perfil editable y documentos de habilitación |

Documentos imprimibles: `/empresa/cobro/[id]` (la cuenta de cobro con el formato
del papel), `/empresa/viaje/[id]` (informe final), `/empresa/remito/[id]`.

Alta nueva: `/empresa/registro` — empresa o persona natural con camiones.

### 4b · `/negocio` — Portal del comercio

Se entra por **enlace único** (`/negocio/<token>`). Si el dueño lo pierde,
`/negocio` lo recupera con OTP a su celular.

| Página | Contenido |
|---|---|
| Pedidos | entrantes con **campana, vibración y título parpadeante** cuando la pestaña está de fondo; PIN de recogida; pruebas de entrega |
| Catálogo | alta de productos con foto, **escáner de código de barras**, existencias, buscador y **carga masiva por CSV con vista previa** |
| Ajustes | portada del local y **ubicación en el mapa** (necesaria para que el cliente vea el trayecto) |

Alta nueva: `/negocio/registro` — autoservicio, devuelve el enlace del portal.

### 4c · Landing `/`

Dos entradas: *Registra tu negocio* (comercio) y *Empresa de transporte* (flota),
más el ingreso de empresas.

---

## 5 · Panel de administración — `/admin`

Vive dentro del backend. Se entra con **OTP a un teléfono de `ADMIN_PHONES`**.
El pie del login muestra qué build corre y qué código espera.

| Pestaña | Para qué |
|---|---|
| Verificaciones | documentos de conductores, con OCR y fecha de vencimiento |
| Conductores | verificar, KYC, antecedentes, cumplimiento documental y **diagnóstico de despacho** (por qué un conductor no recibe: en línea, verificado, GPS fresco, radio) |
| Empresas | verificar habilitación, revisar sus documentos, autorizar rutas troncales |
| Negocios | buscar, abrir su portal, activar o desactivar |
| Métricas | uso e **integraciones con botón "Probar ahora"** — las ejercita de verdad |
| SOS | alertas de pánico, alertas de ruta y retiros DMCA |
| Soporte | tickets de conductores y clientes |
| Promos y pagos | promociones y retiros |

---

## Cómo saber qué build corre en cada sitio

| Superficie | Comprobación |
|---|---|
| Backend | `GET /health` → campo `commit` |
| Portal web | `GET /api/version` → `commit` (404 = build viejo) |
| App conductor | menú lateral → *"v1.0.0 · build N"* |
| App cliente | pantalla de login, abajo |

El número de build de las apps es el `run_number` del workflow de GitHub
Actions, así que se puede casar con la corrida exacta que lo produjo.
