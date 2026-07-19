# ZIPA — Puerto seguro DMCA / retiro de contenido

## Por qué

La plataforma permite a usuarios subir imágenes y documentos (documentos del
conductor, pruebas de entrega, fotos de chat, catálogo de negocios). Si un
usuario sube material infractor, el puerto seguro (safe harbor) protege a la
plataforma **solo si**: (1) hay un agente designado registrado, (2) existe un
procedimiento de notificación y retiro, y (3) los términos trasladan la
responsabilidad a quien subió el contenido — los tres ya están montados.

## Qué está implementado

- **Términos §4** (servidos por `GET /legal/terms`): responsabilidad del
  usuario por su contenido + procedimiento de retiro + suspensión de
  reincidentes.
- **Formulario de retiro**: `POST /legal/takedown`
  `{ reporterName, reporterEmail, contentUrl, reason }` (público, con rate
  limit). Queda en la tabla `takedown_requests`.
- **Procesamiento**: panel `/admin` → pestaña SOS → "Retiros DMCA" →
  el admin retira el contenido (borrar archivo/producto) y marca
  `Retirado`/`Rechazar` (constancia con quién y cuándo).
- **Trazabilidad del contenido**: toda subida queda atada a su autor y fecha —
  `DriverDocument.driverId+uploadedAt`, pruebas de entrega en el servicio del
  conductor, fotos de chat con `senderId`, productos con `businessId`.

## Pendiente del REPRESENTANTE LEGAL (no es código)

1. **Registrar el agente designado** en la oficina de derechos de autor de
   EE. UU. (copyright.gov/dmca-directory) si se opera/expone a usuarios de
   EE. UU. — US$6, **renovable cada 3 años**. Anotar aquí la fecha de registro
   y la de renovación.
2. Designar el correo del agente (p. ej. legal@zipa.app) y ponerlo en la
   página de términos pública.
3. En Colombia, el régimen análogo (Ley 1915 de 2018, decisiones CAN) queda
   cubierto por el mismo procedimiento de notificación y retiro.

| Campo | Valor |
|---|---|
| Agente designado | *(pendiente: nombre del representante)* |
| Correo | *(pendiente)* |
| Fecha de registro | *(pendiente)* |
| Próxima renovación | *(registro + 3 años)* |
