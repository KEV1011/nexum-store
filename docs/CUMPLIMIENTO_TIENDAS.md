# Cumplimiento de Play y App Store — qué falta, con evidencia

Auditoría del código a 2026-09-12. No repite lo que ya está escrito en
`docs/PUBLICAR_EN_PLAY.md` (proceso de subida, firma, ficha) ni en
`docs/REVISION_TIENDAS.md` (cuenta del revisor, eliminación de cuenta, pagos):
**esto es solo lo que HOY falta en el código**, comprobado archivo por archivo.

Cada punto trae: qué exige la tienda, dónde está el hueco, y qué hay que tocar.

---

## Lo que YA está y no hay que rehacer

Verificado, no asumido:

| Requisito | Estado | Dónde |
|---|---|---|
| Eliminar la cuenta desde la app | Hecho, en las dos | `delete_account_screen.dart` (×2), `account-deletion.service.ts`, `DELETE /client/account`, `DELETE /driver/account` |
| Eliminar la cuenta desde la web (Play lo exige aparte) | Hecho | `app/legal/eliminar-cuenta/page.tsx` |
| Política de privacidad y términos publicados | Hecho | `app/legal/privacidad`, `app/legal/terminos`, y legibles dentro de la app (`legal_doc_screen.dart`) |
| Manifiesto de privacidad de iOS | Hecho **y registrado en Xcode** | `PrivacyInfo.xcprivacy` (×2) + entrada en `project.pbxproj:18,61,122,234` |
| APIs de razón obligatoria (ITMS-91053) | Declaradas las cuatro | UserDefaults, FileTimestamp, DiskSpace, SystemBootTime |
| Ubicación en segundo plano en Android | **No se pide**, a propósito | El conductor usa foreground service; sin `ACCESS_BACKGROUND_LOCATION` no hay formulario de declaración ni video |
| Componentes fantasma que crasheaban al actualizar | Retirados | `.BootReceiver` / `.LocationForegroundService` |
| Cleartext en Android | Bloqueado salvo hosts de desarrollo | `network_security_config.xml` (×2) |
| Cuenta de demostración para el revisor | Hecha (falta encenderla) | `otp.service.ts:138-151` |
| AAB para Play | Se construye | `build-apk*.yml:125` (`flutter build appbundle`) |

---

## 1. Contenido de usuario sin reporte ni bloqueo — ✅ HECHO

**Lo que exigen.** Apple, guía 1.2, pide **cuatro cosas juntas** en cualquier app
con contenido generado por usuarios: filtrar el material ofensivo, un mecanismo
para **reportar** contenido, un mecanismo para **bloquear** a usuarios abusivos,
y datos de contacto publicados. Play tiene la misma exigencia en su política de
contenido generado por el usuario, y añade un plazo para actuar sobre lo
reportado. Es de los rechazos más mecánicos que hay: el revisor abre el chat,
no ve el botón, y devuelve la app.

**Qué contenido de usuario tenemos hoy** (no es poco):

- Chat pasajero↔conductor en viajes, pedidos y mandados — `trip-chat.service.ts`,
  con texto y **fotos**. Es la superficie principal: texto libre de una persona
  que llega a otra.
- Catálogo del negocio: nombre, descripción y **foto** de cada producto, que ve
  cualquier usuario de la app. Lo publica un tercero, no nosotros.
- Comentario libre al calificar al conductor (`client.service.ts:770`) y al
  negocio (`business.service.ts:849-870`).
- Elogios al conductor, en su perfil público.
- Adjuntos en tickets de soporte.

**Corrección de la primera versión de este documento.** Escribí que el
comentario de una reseña «se publica a todo el mundo». No es cierto: los
comentarios de un negocio se los enseña `GET /business/:token/reviews` **solo a
su dueño**, en su portal, y los de un conductor solo a él. El perfil público
del conductor no muestra texto libre — solo los elogios, que salen de un
catálogo cerrado. Sigue siendo contenido de usuario y sigue aplicando la guía
1.2 (el chat basta por sí solo), pero el botón de reportar una reseña no tiene
dónde ir en las apps, porque esa pantalla no existe ahí.

**Qué hay que construir:**

1. `POST /report` con `{tipo, objetivoId, motivo, detalle}` y una tabla
   `content_reports`. Los motivos son cerrados (contenido ofensivo, acoso,
   fraude, no es real, otro) — un campo libre no se puede triar.
2. Botón **Reportar** en el chat de las dos apps y en la ficha pública del
   conductor, con un mismo widget. La reseña y el producto quedan pendientes:
   la reseña no se enseña en las apps, y el producto es la superficie que
   falta por cablear.
3. **Bloquear**: una tabla `user_blocks` y, como mínimo, que el despacho no
   vuelva a emparejar a dos personas que se bloquearon. Esto último es lo que
   convierte el bloqueo en algo real y no en un botón decorativo — y es
   exactamente lo que Apple mira.
4. Cola de moderación en `/admin` (la pestaña de Soporte ya tiene la forma) con
   los estados y quién resolvió.

**Lo que NO sirve como sustituto:** los tickets de soporte que ya existen.
Es un canal genérico, no un reporte anclado a un mensaje, a una reseña y a una
persona. Apple lo rechaza como equivalente.

---

## 2. iOS del conductor: promete ubicación en segundo plano y no puede darla — ✅ HECHO

`AppTransport/ios/Runner/Info.plist:31` declara
`NSLocationAlwaysAndWhenInUseUsageDescription` («…usa tu ubicación en segundo
plano para mantenerte visible mientras estás en línea»).

**En ese archivo no existe `UIBackgroundModes`.** Comprobado.

Son dos problemas, no uno:

- **Funcional:** sin el modo `location`, iOS suspende la app al minimizarla y el
  latido de GPS se corta. El conductor sale del despacho por frescura a los 120 s
  con la app en el bolsillo. En Android esto funciona porque hay foreground
  service; en iOS, hoy, no.
- **De revisión:** pedir el permiso «Siempre» sin declarar un modo de fondo que
  lo use es justo el patrón que Apple marca como permiso pedido de más.

Hay que elegir, y las dos mitades tienen que coincidir:

- **(a)** Declarar `UIBackgroundModes: [location]` y justificarlo en la revisión
  — es lo que hacen Uber y DiDi, y para una app de conductores se acepta; o
- **(b)** Bajar a «mientras se usa», quitar la cadena de «Siempre», y asumir que
  en iOS el conductor tiene que dejar la app abierta.

Recomiendo (a): sin ella la app del conductor no cumple su función en iPhone.

---

## 3. iOS del cliente: ATS abierto de par en par — ✅ HECHO

`AppCliente/ios/Runner/Info.plist:6-8`:

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key><true/>
```

Eso desactiva la seguridad de transporte para **todos** los hosts: la app
aceptaría HTTP plano contra cualquier servidor. Apple pide justificación de esa
excepción y, sin una razón técnica, la devuelve.

Lo que hace más claro que es un descuido y no una decisión: **el conductor no la
tiene** (su plist no declara ATS), y **Android hace lo contrario** en el mismo
repositorio — `network_security_config.xml` prohíbe cleartext salvo para
`10.0.2.2` y `localhost`.

Arreglo: quitar `NSAllowsArbitraryLoads` y dejar solo `NSAllowsLocalNetworking`,
que es lo que hace falta para el desarrollo local. El backend de producción es
HTTPS, así que no se pierde nada.

---

## 4. No hay divulgación previa antes de pedir la ubicación — ✅ HECHO

Play exige, en su política de Datos de usuario, una **divulgación destacada
dentro de la app** antes del diálogo del sistema: qué dato se recoge, para qué,
y con quién se comparte, con una acción afirmativa para aceptar. Es una causa
frecuente de suspensión, y se aplica aunque el permiso sea «mientras se usa»,
porque la ubicación sale del dispositivo.

Hoy:

- **Cliente:** `transport_home_screen.dart:78` — `_locateMe()` se llama desde
  `initState`. El diálogo del sistema salta al entrar a la pantalla, sin que el
  usuario haya pedido nada y sin una palabra de contexto.
- **Conductor:** `home_screen.dart:323` — el permiso se pide al **Conectarse**,
  que sí es un momento con contexto. Pero no se dice que la posición se envía al
  servidor de forma continua y se comparte con el pasajero.

Arreglo: una hoja previa en cada app, con el texto y dos botones. En el cliente,
además, moverla al momento en que sirve para algo (tocar «mi ubicación» o elegir
recogida) en vez de al abrir.

---

## 5. Falta la clave de cifrado para exportación — ✅ HECHO

`ITSAppUsesNonExemptEncryption` no está en ninguno de los dos `Info.plist`.
No rechaza la app, pero **cada** subida a TestFlight se detiene en la pregunta de
cumplimiento de exportación hasta que alguien la contesta a mano. Una línea con
`<false/>` en cada plist (solo usamos HTTPS estándar, que está exento) y se acabó.

---

## 6. El SOS no avisa a nadie sin Twilio — MENOR, pero mírenlo antes de enviar

`safety.service.ts:179` devuelve `sin_canal` cuando no hay proveedor de SMS, y
las dos apps lo dicen con todas las letras («Evento registrado, pero NO pudimos
avisar a tu contacto. Llama al 123»). El comportamiento es honesto y el botón
sigue sirviendo para llamar al 123.

Aun así, un revisor que toque «SOS» y lea eso puede marcarlo como función
incompleta (Apple 2.1). Con Twilio configurado el aviso sale y el punto
desaparece. Es configuración, no código.

---

## 7. Un dato que se contradice entre la ficha y el manifiesto — ✅ HECHO

`docs/PRIVACIDAD_DATOS.md` dice, para el conductor, «Ubicación precisa **incl.
segundo plano**», y el manifiesto de Android **no** declara
`ACCESS_BACKGROUND_LOCATION`, deliberadamente.

Las dos cosas son ciertas a su manera (se recoge con la app en segundo plano,
mediante un servicio en primer plano), pero si en el formulario de Play se marca
«background» y el permiso no está, el revisor cruza los dos datos y pregunta.
Unificar la redacción: *se recoge de forma continua mientras el conductor está
en línea, mediante un servicio en primer plano con notificación visible*.

---

## Fuera del alcance de las tiendas, pero conviene tenerlo escrito

El catálogo ofrece **Particular** y **Moto** para transporte de pasajeros.
Apple (guía 5.0) y Play («actividades ilegales») exigen cumplir la ley local, y
en algunos países piden acreditar licencias antes de aprobar una app de
transporte.

En Colombia, el transporte público individual de pasajeros está reservado a
vehículos habilitados —Ley 336 de 1996 y Decreto 1079 de 2015—, y el
mototaxismo está restringido en la mayoría de municipios. **Taxi** e
**Intermunicipal con empresa habilitada** están del lado seguro; las otras dos
categorías son por donde un gremio o un competidor pediría el retiro de la
ficha.

No soy abogado y esto no es un dictamen: es señalar cuál es el punto expuesto,
para que la decisión se tome sabiéndolo y para que la ficha de la tienda no
anuncie como transporte público algo que no lo es.

---

## Cómo quedó

Todo lo de código está hecho y verificado. Lo que sigue abierto es
configuración y decisiones que no son mías:

| Qué | Estado |
|---|---|
| 1. Reportar y bloquear | Hecho. Backend, las dos apps y cola en `/admin`. El bloqueo saca del despacho de verdad, probado contra PostgreSQL |
| 2. Ubicación de fondo en iOS | Hecho. Modo `location` + `allowBackgroundLocationUpdates`, sin pedir «Siempre» |
| 3. ATS del cliente | Hecho |
| 4. Divulgación previa | Hecho en las dos apps, con una puerta única que una prueba vigila |
| 5. Cifrado de exportación | Hecho |
| 6. SOS sin Twilio | **Pendiente de configuración**: sin proveedor de SMS no se avisa al contacto |
| 7. Coherencia de la ficha de privacidad | Hecho |

**Lo que queda del lado del usuario**, ya documentado en `PUBLICAR_EN_PLAY.md`
y `REVISION_TIENDAS.md`: `REVIEW_DEMO_PHONE`/`REVIEW_DEMO_CODE`,
`NEXT_PUBLIC_SUPPORT_EMAIL`, Twilio, el formulario de seguridad de datos, la
declaración de servicio en primer plano y el contacto público que Apple 1.2
pide junto al reporte y el bloqueo (basta el correo de soporte en la ficha).

**Y una decisión de producto**: las categorías Particular y Moto, más abajo.

## Orden de ejecución (ya recorrido)

Por bloqueo primero, y dentro de eso por esfuerzo:

1. **iOS del conductor** — decidir (a) o (b) y dejar el plist coherente. Media
   hora, y hoy la app no funciona en iPhone.
2. **ATS del cliente** — quitar la excepción. Diez minutos.
3. **Clave de exportación** — dos líneas.
4. **Divulgación de ubicación** — una hoja por app, más mover la llamada del
   cliente. Medio día.
5. **Reporte y bloqueo de contenido** — es la tanda grande: tabla, ruta, cuatro
   botones, cola de moderación y el cruce con el despacho. Es también el único
   punto que por sí solo tumba la revisión de Apple.
6. Configuración del usuario, ya documentada: `REVIEW_DEMO_*`,
   `NEXT_PUBLIC_SUPPORT_EMAIL`, Twilio, y el formulario de seguridad de datos.

Los puntos 1-4 se pueden hacer en una tanda; el 5 merece la suya.
