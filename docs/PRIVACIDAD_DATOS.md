# ZIPA — Inventario de datos recolectados (base para privacy labels)

> Fuente única para las **etiquetas de privacidad** de App Store ("App Privacy")
> y Google Play ("Data safety"), y para responder requerimientos CCPA/Ley 1581.
> Actualizar este archivo CADA vez que se agregue una recolección nueva
> (SDK de analítica, píxel, permiso nuevo) **antes** de publicar la versión.

## App Cliente (`com.zipa.cliente`)

| Dato | ¿Se recolecta? | Propósito | ¿Vinculado a identidad? | ¿Tracking publicitario? |
|---|---|---|---|---|
| Teléfono | Sí | Cuenta y login OTP | Sí | No |
| Nombre / correo | Sí (opcional el correo) | Perfil, facturación | Sí | No |
| Ubicación precisa | Sí (en uso) | Origen/destino, conductores cercanos, seguimiento en vivo | Sí | No |
| Fotos / cámara | Sí (bajo demanda) | Adjuntos de soporte/chat, selfie KYC | Sí | No |
| Identificadores del dispositivo (token FCM) | Sí | Notificaciones push | Sí | No |
| Datos de pago | **No los almacena ZIPA** (los procesa Wompi) | Pago en línea | — | No |
| Historial de servicios | Sí | Historial, soporte, obligaciones legales | Sí | No |
| Analítica de terceros / píxeles publicitarios | **No** (hoy no hay SDK de analítica) | — | — | No |

## App Conductor (`com.zipa.conductor`)

| Dato | ¿Se recolecta? | Propósito | ¿Vinculado? | ¿Tracking? |
|---|---|---|---|---|
| Teléfono / nombre / cédula / licencia | Sí | Cuenta, verificación legal del conductor | Sí | No |
| Ubicación precisa, también con la app en segundo plano | Sí (solo EN LÍNEA) | Despacho por cercanía, seguimiento del servicio, seguridad de ruta | Sí | No |
| Documentos e imágenes (cédula, licencia, SOAT, tarjeta, selfie) | Sí | Verificación/KYC, cumplimiento normativo | Sí | No |
| Datos bancarios (banco, tipo y número de cuenta) | Sí | Pagos/retiros al conductor | Sí | No |
| Identificadores del dispositivo (token FCM) | Sí | Ofertas de servicio y avisos push | Sí | No |
| Fotos de prueba de entrega | Sí | Cadena de custodia de envíos/pedidos | Sí | No |
| Analítica de terceros | **No** | — | — | No |

## Terceros que tratan los datos (encargados)

Los mismos que nombra la Política de Privacidad, y por el mismo motivo: la Ley
1581 obliga a identificarlos, y sin la cláusula de transferencia internacional
la autorización no cubre sacar el dato del país. `legal-privacidad.test.ts`
falla si esta lista y la política dejan de coincidir.

| Proveedor | Qué recibe |
|---|---|
| Google (Maps Platform) | Direcciones y coordenadas: búsqueda de direcciones, rutas y mapas |
| Google Firebase (Cloud Messaging) | El identificador de notificaciones del dispositivo |
| Meta Platforms (WhatsApp Business Cloud API) | Número y mensajes, incluida la ubicación que se comparta por ese canal |
| Twilio | Número, para el SMS del código de verificación |
| Wompi (Bancolombia) | Datos del pago. ZIPA no almacena números de tarjeta |
| Amazon Web Services o Cloudflare R2 | Documentos y fotos que sube el usuario |
| Render y Vercel | Alojamiento de la plataforma y de la base de datos |

**Todos tienen servidores fuera de Colombia** (principalmente EE. UU.), de ahí
la cláusula de transferencia internacional del artículo 26.

> Para el formulario de Play: son **proveedores de servicios que tratan datos
> por cuenta nuestra**, no destinatarios que los usen para lo suyo. Decide con
> ese criterio la pregunta de «¿se comparten con terceros?» y deja la respuesta
> escrita aquí cuando la contestes, para que la próxima subida no la vuelva a
> decidir desde cero.

## Notas operativas

- **Cómo se recoge la ubicación del conductor, con precisión** (importa porque
  el formulario de la tienda y el manifiesto se cruzan): de forma continua
  mientras está EN LÍNEA, mediante un servicio en primer plano con notificación
  visible en Android y el modo de fondo `location` con indicador azul en iOS.
  **No se pide `ACCESS_BACKGROUND_LOCATION` ni el permiso «Siempre» de iOS**, y
  no hay que marcarlos en ninguna ficha: decir que sí obliga al formulario de
  declaración de permisos de Play y a un video, por un permiso que la app no
  tiene.
- **Divulgación previa**: antes del diálogo del sistema, ambas apps enseñan la
  hoja de `core/ubicacion/ubicacion_gate.dart` con qué se recoge, para qué, con
  quién se comparte y cuándo deja de recogerse. Es requisito de Play, y una
  prueba impide que ningún otro archivo pida el permiso por su cuenta.
- **Declaración en tiendas**: ambos formularios deben marcar Ubicación
  **precisa**, Info de contacto, Identificadores, Fotos, Datos financieros
  (solo conductor: datos bancarios; el cliente NO, Wompi procesa la tarjeta) y
  Contenido de usuario (fotos/mensajes). Nada de "Data used to track you": no
  hay SDKs publicitarios.
  > ⚠ **No marques «ubicación en segundo plano»** en la app del conductor, aunque
  > la recoja con la pantalla apagada. Son DOS cosas distintas y confundirlas es
  > un rechazo: *Seguridad de los datos* pregunta qué se recoge (ubicación
  > precisa: sí), mientras que el **formulario de declaración de permisos** —el
  > del video— lo dispara tener `ACCESS_BACKGROUND_LOCATION` en el manifiesto, y
  > NO lo tenemos: el rastreo va en un servicio en primer plano. Marcarlo
  > obligaría a justificar un permiso que la app no pide, y Play cruza las dos
  > cosas.
- **IA**: el emparejamiento, la estimación de rutas/tarifas y la detección de
  fraude usan algoritmos/IA — declarado en Términos §3 y Política §3 (servidos
  por `GET /legal/terms` y `GET /legal/privacy`).
- **Derechos (habeas data / CCPA)**: la supresión es **autoservicio** —pasajero:
  Cuenta → *Eliminar mi cuenta*; conductor: Ajustes → *Eliminar mi cuenta*— y
  además hay una URL pública alcanzable sin instalar la app
  (`/legal/eliminar-cuenta`), que es lo que Play exige. El acceso y la
  corrección van por el canal de atención publicado. La cuenta se **anonimiza**:
  se van nombre, teléfono, correo, foto y direcciones; quedan los importes y
  fechas de los servicios completados, sin identidad, porque sostienen la
  liquidación de las empresas y las cuentas de cobro. Los consentimientos quedan
  en `legal_consents` con versión, fecha e IP.
- Si algún día se agrega analítica (Firebase Analytics, píxeles), actualizar
  esta tabla, la Política (nueva versión → re-aceptación) y las etiquetas de
  ambas tiendas ANTES del release.
