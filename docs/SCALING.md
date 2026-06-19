# Escala horizontal — estado y plan

> Resumen: hoy el realtime corre **bien en una sola instancia**. Este documento
> describe el acoplamiento a instancia única, qué resuelve ya el bus de Redis y
> qué falta antes de poder correr **varias instancias** de forma segura.
> **No actives multi-instancia solo con definir `REDIS_URL`** — lee la sección
> "Trabajo pendiente".

## Cómo funciona hoy (instancia única)

El backend mantiene el estado de tiempo real **en memoria del proceso**:

- **Sockets por id** — `backend/src/websocket/ws.handler.ts`:
  - `clientSockets` (clientId → ws), `driverConnections` (driverId → conn),
    `businessSockets` (businessId → ws).
  - Primitivas de entrega por id: `sendToClient()` y `sendToDriverById()`.
- **Suscripciones por socket** — mapas como `clientTripSubs`, `clientErrandSubs`,
  `clientIntercitySubs`, `pooledSubs`, `rideSubs`, `chatSubs`. Cada callback
  **captura el `ws` concreto** y se dispara cuando el emisor de eventos del
  servicio correspondiente cambia, **en esa misma instancia**.
- **Estado de emparejamiento** — `backend/src/services/matching.service.ts`:
  `activeOffers` (ofertas con timeout) vive en memoria de la instancia que
  recibió la solicitud de viaje.
- **Geo del conductor** — se persiste en PostGIS (columna `geo` en `drivers`),
  así que el matching por cercanía ya consulta una fuente **compartida** (la DB).

Con una instancia, todo el que necesita hablar entre sí está en el mismo proceso,
así que funciona. Con varias instancias detrás de un balanceador, un conductor y
su pasajero pueden caer en instancias distintas y los mensajes se pierden.

## Qué resuelve ya el bus (`src/lib/bus.ts`)

Se añadió un bus de **entrega entre instancias** con Redis Pub/Sub y *fallback*
local:

- `sendToClient()` y `sendToDriverById()` ahora, además de entregar al socket
  local, **publican** la entrega en un canal Redis. Cada instancia recibe y
  entrega a su socket local si el destinatario está ahí. El origen ignora sus
  propios mensajes (dedupe por `instanceId`).
- **Sin `REDIS_URL` el bus está inactivo**: la entrega es solo local y el
  comportamiento es **idéntico** al de una sola instancia (cero riesgo).
- Esto cubre las entregas que pasan por esas dos primitivas: ofertas de viaje a
  conductores (`registerSendToDriver`), `ride_update`, intermunicipal directo
  (`registerIntercitySendToDriver`) y `notifyClientTripUpdateById`.

## Trabajo pendiente para multi-instancia segura

El bus es **necesario pero no suficiente**. Antes de correr 2+ instancias:

1. **Estado de ofertas de matching distribuido.** `activeOffers` vive en la
   instancia que arrancó el ciclo de emparejamiento. Si la oferta se entrega
   (vía bus) a un conductor en otra instancia y este **acepta**, el `accept`
   llega a su instancia local, que no tiene la oferta. Opciones:
   - mover `activeOffers` a Redis (con TTL para los timeouts), o
   - **routing pegajoso del viaje**: que el accept se enrute a la instancia
     dueña del viaje (por id de viaje → instancia, en Redis).
2. **Fan-out de eventos de suscripción.** Los callbacks de `subscribeClientTrip`
   / `subscribeClientErrand` / etc. se disparan donde ocurre la mutación. Si el
   pasajero se suscribió en otra instancia, no se entera. Hay que publicar el
   evento "viaje X actualizado" por el bus para que **todas** las instancias
   reevalúen sus suscripciones locales, o canalizar esas actualizaciones por
   `sendToClient()` (que ya es multi-instancia).
3. **`businessSockets` por el bus** (los pedidos a negocios) — análogo a los
   conductores; el bus ya soporta `kind: 'business'`, falta enrutar el envío.
4. **WebSocket sticky / balanceo.** Configurar el balanceador para afinidad de
   sesión o asumir reconexión (el cliente y el conductor ya reconectan solos
   tras la Fase 0).

## Plan de despliegue (cuando se aborde lo anterior)

1. Provisionar Redis (Render Key Value, Upstash, etc.) y poner `REDIS_URL`.
2. Validar en **staging con 2 instancias**: viaje punta a punta con conductor y
   pasajero forzados a instancias distintas; ofertas, aceptación, ubicación en
   vivo y estados.
3. Subir el plan de Render a varias instancias solo tras esa validación.

## Infra relacionada

- Una sola DB Postgres (`basic-256mb`) sin réplica — añadir réplica de lectura y
  failover es parte de HA, aparte de la escala del realtime.
- Región `oregon`: para Colombia conviene evaluar una región más cercana por
  latencia.
