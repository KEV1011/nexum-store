# ZIPA — Inventario de datos recolectados (base para privacy labels)

> Fuente única para las **etiquetas de privacidad** de App Store ("App Privacy")
> y Google Play ("Data safety"), y para responder requerimientos CCPA/Ley 1581.
> Actualizar este archivo CADA vez que se agregue una recolección nueva
> (SDK de analítica, píxel, permiso nuevo) **antes** de publicar la versión.

## App Cliente (`com.nexum.nexum_client`)

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

## App Conductor (`com.nexum.driver_app`)

| Dato | ¿Se recolecta? | Propósito | ¿Vinculado? | ¿Tracking? |
|---|---|---|---|---|
| Teléfono / nombre / cédula / licencia | Sí | Cuenta, verificación legal del conductor | Sí | No |
| Ubicación precisa, también con la app en segundo plano | Sí (solo EN LÍNEA) | Despacho por cercanía, seguimiento del servicio, seguridad de ruta | Sí | No |
| Documentos e imágenes (cédula, licencia, SOAT, tarjeta, selfie) | Sí | Verificación/KYC, cumplimiento normativo | Sí | No |
| Datos bancarios (banco, tipo y número de cuenta) | Sí | Pagos/retiros al conductor | Sí | No |
| Identificadores del dispositivo (token FCM) | Sí | Ofertas de servicio y avisos push | Sí | No |
| Fotos de prueba de entrega | Sí | Cadena de custodia de envíos/pedidos | Sí | No |
| Analítica de terceros | **No** | — | — | No |

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
- **Declaración en tiendas**: ambos formularios deben marcar Ubicación (precisa,
  y "background" solo en la app conductor), Info de contacto, Identificadores,
  Fotos, Datos financieros (solo conductor: datos bancarios; el cliente NO,
  Wompi procesa la tarjeta) y Contenido de usuario (fotos/mensajes). Nada de
  "Data used to track you": no hay SDKs publicitarios.
- **IA**: el emparejamiento, la estimación de rutas/tarifas y la detección de
  fraude usan algoritmos/IA — declarado en Términos §3 y Política §3 (servidos
  por `GET /legal/terms` y `GET /legal/privacy`).
- **Derechos (habeas data / CCPA)**: acceso, corrección y supresión vía canal
  de soporte in-app; los consentimientos quedan en `legal_consents` con
  versión, fecha e IP.
- Si algún día se agrega analítica (Firebase Analytics, píxeles), actualizar
  esta tabla, la Política (nueva versión → re-aceptación) y las etiquetas de
  ambas tiendas ANTES del release.
