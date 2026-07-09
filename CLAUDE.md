# Nexum — Brief técnico para la IA

Plataforma colombiana de transporte (base: Pamplona, N. de Santander): viajes urbanos
(taxi/moto/particular), envíos, mandados, pedidos a negocios e **intermunicipal** con
empresas de transporte habilitadas (requisito legal). Todo es **funcionalidad real**
(nada de demos); los seeds solo crean datos de prueba (conductor/usuario/negocios) y
NUNCA empresas — esas entran por `/empresa/registro` + verificación del admin.

**Responde siempre en español.** El usuario usa PowerShell: nunca le des comandos con
`&&`; dáselos en líneas separadas.

## Superficies y verificación

| Superficie | Stack | Cómo verificar (SIEMPRE antes de commit) |
|---|---|---|
| `backend/` | Node+Express+TS, Prisma 5.22, PostgreSQL+PostGIS, `ws`. Puerto 3000 | `cd backend` → `npm run typecheck` y `npm test` (vitest) |
| `app/` (web Next.js 16) | React 19, Tailwind. `/empresa` portal empresas, `/negocio` negocios. Deploy: Vercel | raíz → `node_modules/.bin/tsc --noEmit` y, si tocaste `app/`, `node_modules/.bin/next build` |
| `AppCliente/` | Flutter (Riverpod, Dio singleton `DioClient`, go_router, flutter_map/OSM) | **No hay Flutter local** → CI (`flutter analyze` + APK build) |
| `AppTransport/` | Flutter, paquete `nexum_driver` (misma base) | Igual: CI |
| Panel admin | HTML embebido en `backend/src/routes/admin.routes.ts` (`PANEL_HTML`), servido en `/admin` | typecheck del backend; el JS del panel es string (revisar escapes `\\'`) |

- **Rama de trabajo:** `claude/bold-newton-nc61uw`. Commit descriptivo en español y push al terminar cada tanda verificada.
- **CI (GitHub Actions):** workflows `CI` (backend typecheck+test, `flutter analyze` de ambas apps) + `Build Nexum Driver/Cliente APK`. Para consultarlos: `mcp__github__actions_list` filtrando por `head_sha` — la salida es enorme, se guarda en archivo; parséala con `python3 -c "import json..."`.
- **Prisma sin DB local:** las migraciones se generan offline: `prisma migrate diff --from-schema-datamodel <backup del schema> --to-schema-datamodel prisma/schema.prisma --script` → `prisma/migrations/YYYYMMDDHHMMSS_nombre/migration.sql`. La columna `Driver.geo` es `Unsupported("geography(Point, 4326)")` (PostGIS), gestionada a mano en la migración `add_postgis` — no la toques con Prisma.
- **Producción:** Render (render.yaml Blueprint + Dockerfile: `prisma migrate deploy && node dist/index.js`); la web en Vercel (`NEXT_PUBLIC_BACKEND_URL`).

## Config crítica

- Flutter `api_config`: `kDebugMode ? (kIsWeb ? localhost:3000 : 10.0.2.2:3000) : <Render>`.
- OTP en dev: código `123456` (cuando `NODE_ENV !== 'production'`).
- `ADMIN_PHONES` habilita el panel admin (OTP→JWT, `admin.middleware`).
- `INTERCITY_DUAL_MODEL` (default `'false'`): al activarlo, las rutas troncales SOLO se despachan a flotas INTERCITY/MIXED verificadas con `OperatorRoute.authorized=true`. Activar en Render cuando existan empresas verificadas con rutas autorizadas.
- `INTERCITY_SIMULATE` (default `'false'`): simulación de conductores intercity — no encender en prod.

## Dominio y flujos (lo esencial)

- **Matching urbano** (`backend/src/services/matching.service.ts`): PostGIS `ST_DWithin`, candidatos ONLINE+`isVerified`+frescura 120s, radio 5 km, oferta secuencial (5 candidatos, 15 s c/u) por WS `trip_request`; `onDriverAccept` es transaccional y **sella `Trip.operatorId`** con la empresa del conductor. Ciclo paralelo para mandados (errands). Si se agotan candidatos → `registerOnNoDrivers` avisa al pasajero (CANCELLED, `NO_DRIVERS_AVAILABLE`).
- **Intermunicipal** (`backend/src/services/intercity.service.ts`): reservas `IntercityBooking` (ciudades enum: PAMPLONA/CUCUTA/BUCARAMANGA/CHITAGA/MALAGA/OCANA/BOGOTA), matching radio 25 km, frescura 600 s, requiere `Driver.intercityEnabled`; con DUAL_MODEL las troncales exigen flota habilitada (filtro `EXISTS` sobre `operators`+`operator_routes`).
- **Empresas** (`operator.service.ts`, `operator.routes.ts`, `operator-auth.middleware.ts`): registro público → `PENDING` → admin verifica (`ACTIVE`+`isVerified`) → afilia conductores por teléfono (se normaliza a E.164 `+57XXXXXXXXXX` con `normalizeColombianPhone` — el login OTP casa por match exacto; si la empresa es INTERCITY/MIXED se activa `intercityEnabled` automáticamente) → el conductor ve "Conduces para X" (affiliation en `driver-profile.service.ts`) → viajes sellados → portal ve `/operator/trips` + CSV `/operator/trips/export.csv` → declara rutas (`/operator/routes`) → admin autoriza (`/admin/routes/:id/authorize`).
- **Liquidación del viaje real**: `updateClientTripStatus('completed')` en `client.service.ts` calcula con `lib/fare.ts` (`calcFare` compartido), persiste `finalFare/netEarning/commission`, llama `recordCompletedTrip` (alimenta `DriverEarning` → wallet + `/earnings/*`) y libera al conductor a ONLINE. Cancelación del cliente → `cancelClientTrip` avisa al conductor por WS `trip_cancelled` y lo libera.
- **Inyección WS**: los servicios NO importan sockets; `ws.handler.ts` registra callbacks al arrancar (`registerSendToDriver`, `registerNotifyTripUpdate`, `registerOnNoDrivers`, `registerClientSendToDriver`, `registerIntercitySendToDriver`). Sigue ese patrón para nuevos avisos (evita imports circulares).

## Convenciones de código

- Flutter web-safe: `MultipartFile.fromBytes` (nunca `fromFile`), widget `PickedImage` para previews (Image.network en web), heartbeat geo con fallback centro Pamplona `(7.3754, -72.6486)` cuando no hay GPS.
- Web `/empresa`: cliente HTTP compartido `app/empresa/api.ts` (`createOperatorApi`), componentes separados (`FleetMap.tsx` Leaflet vía CDN sin dependencia npm, `RoutesManager.tsx`). Sin `any`; tipado estricto.
- Cualquier simulación/mock nuevo debe ser **no-op en release** (`if (!kDebugMode) return;`) — patrón ya aplicado en `intercity_provider.dart`.
- Backend: rutas validan body a mano y responden `{ success, data | error }`; errores de negocio con mensajes en español.

## HECHO y verificado (no re-auditar)

Ciclo empresa completo (registro→verificación→afiliación→sellado→liquidación+CSV+rutas troncales+matching restringido), **onboarding del portal** (afiliar conductores + registrar vehículos con estado de verificación: `DriversManager.tsx`/`VehiclesManager.tsx`), mapa Leaflet del portal, liquidación real de viajes urbanos, cancelación coherente cliente↔conductor, aviso "sin conductores", estado `in_progress` en el cliente, afiliación E.164, `intercityEnabled` automático, ganancias reales (`/earnings/history` → `trip_history_provider`), subida de documentos web-safe, panel admin (docs/conductores/empresas/rutas/SOS/promos/payouts), **ciclo intermunicipal completo** (WS `intercity_start`/`intercity_complete` → CONFIRMED→IN_PROGRESS→COMPLETED con `finalFare`/`completedAt` + liquidación al conductor vía `recordCompletedTrip`; avisos al conductor en confirm/reject/cancel del cliente; UI de viaje activo con fases en `intercity_requests_screen.dart`; feedback `intercity_accept_ok`/error en `ws_service.dart`, que además ya no parsea `trip_request` muerto).

También HECHO (Tanda 3): `IntercityBooking.operatorId` sellado al aceptar (migración `20260707000000_add_intercity_operator`) y fusionado en `/operator/trips` + CSV (urbano + intermunicipal); historial del conductor sin viajes sintéticos (`trip_summary_screen` refetchea vía `tripHistoryProvider.refresh()` — la liquidación es 100 % del backend); estado `arriving` enviado al iniciar navegación al pickup (`active_trip_screen`, guardado por `isToPickup`); eliminados `acceptClientTrip`/`_startTripSimulation` (demo muerto).

También HECHO (Tanda 4 — liquidación en vivo + de-mock total de release): `trip_status_ack` devuelve `settlement {finalFare,netEarning,commission}` al completar (`getTripSettlement` en client.service; parseado en `driver_ws_service.dart` con buffer por tripId) y `trip_summary_screen` muestra los montos del backend con badge "Liquidación confirmada" (fallback 6 s a estimación; `TripModel.id` ahora es el id real del backend); `ClientTripDTO.finalFare` expuesto. Fixes WS multi-conductor: `trip_status`/`driver_mode` ya no exigen el socket singleton; presencia condicional `noteDriverConnected/Disconnected` (OFFLINE↔ONLINE sin pisar ON_TRIP; antes `onClose` leía `driverIdByWs` tras borrarlo y nunca marcaba offline). De-mock: conductor — home/drawer/ajustes/perfil con identidad real (`driverProfileProvider`), rendimiento y calificaciones 100 % reales (perfil + historial; distribución calculada; comentarios = estado vacío honesto), tickets de soporte = estado vacío → chat, historial sin `_buildSeedTrips` (purga `seed-`), portal/registro de negocio del app solo `kDebugMode` ("(demo)"), "Mis documentos" → `/verification` (real), 401 → login (`AuthInterceptor.onSessionExpired` registrado en `app.dart`); cliente — sin `_mockDrivers`/`_simulateLifecycle`/`_buildMockHistory`/`_seedVehicles`: solicitudes fallan con error honesto si el POST no llega (booking/checkout/mandado muestran snackbar), fallback sin WS = **polling REST 5 s** (`GET /client/trips/:id` nuevo, `/client/orders/:id`, `/client/errands/:id`), mapa del home con conductores reales (`GET /client/drivers/nearby` → `getNearbyDriverPositions` PostGIS, refresh 15 s), negocios sin fallback mock (error → `_buildError`), llamada real `tel:` al repartidor (chat demo eliminado).

También HECHO (Tanda 5 — mandados a la empresa + purga legacy + tokens intercity): `Errand.operatorId` sellado al aceptar (migración `20260708000000_add_errand_operator`; `acceptClientErrand` consulta la empresa del conductor) y fusionado en `/operator/trips` + CSV como servicio `MANDADO` con estados normalizados (`_errandStatusForPortal`: DELIVERED→COMPLETED, SHOPPING/ON_THE_WAY→IN_PROGRESS) y `fare = serviceFee` — **Order NO se sella**: los pedidos aún no asignan conductor en el backend (no hay punto de accept). Eliminados del app conductor: `features/business_portal` y `features/documents` completos (el canal real de negocios es la web `/negocio`; documentos van por `/verification`), capas `data/`, `presentation/`, `domain/usecases`, `domain/repositories` de `trip_requests` (solo sobreviven `domain/entities`, usadas por home y active_trip) y `core/mock_data/{passengers,trips,errands}_mock.dart` (`driver_mock.dart` queda: seed del perfil editable + auth mock web). Pantallas intercity del cliente 100 % tokenizadas (bloque `AppColors.intercity*` — tema nocturno slate — y `starText`; 96 hex fuera) e `intercityBrand` compartido en el conductor; sonido real de notificación (`NotificationService.playTripRequestSound` → `AudioService` + `assets/sounds/trip_request.wav`).

También HECHO (Tanda 6 — despacho REAL de pedidos a repartidores): eliminada la simulación server-side de pedidos (`MOCK_DRIVERS`/`_startSimulation` en client.service — el último teatro de la plataforma); `startOrderMatchingCycle` en matching.service (oferta secuencial `order_request` anclada a coords del negocio, fallback Pamplona; `getOrderOfferInfo` vive en `order-offer.service.ts` para evitar el ciclo client↔matching) disparado por POST /client/orders; WS `accept_order`/`reject_order`/`order_status` (at_pickup|in_transit|delivered) en ws.handler; `acceptClientOrder` sella driverId+identidad+**operatorId** (migración `20260709000000_add_order_dispatch`) y `updateOrderStatusByDriver` liquida el `deliveryFee` (menos comisión) vía `recordCompletedTrip` y libera al conductor; fusión `PEDIDO` en `/operator/trips` + CSV (`_orderStatusForPortal`); app conductor: `orderRequests` stream + `sendAcceptOrder/sendRejectOrder/sendOrderStatus` en driver_ws_service, `TripRequestEntity.orderId`/`isOrder`, oferta mapeada en home (`_orderRequestFromMap`) y ramas de pedido en accept/reject/arrived/pickup/finish del viaje activo (at_pickup→in_transit→delivered); guard del `arriving` para no mandar trip_status a pedidos/mandados.

## PENDIENTE (Tanda 7) — punteros exactos

1. **Activar `INTERCITY_DUAL_MODEL=true` en Render** cuando existan empresas verificadas con rutas autorizadas (env var; no es cambio de código).
2. **`driver_mock.dart` restante:** lo usan `editable_profile_provider` (seed antes del load real) y `auth_mock_datasource` (web/tests). Sustituible por estados vacíos si se quiere cero mocks.
3. **Colores inline fuera de intercity:** `transport_home_screen` del cliente aún tiene ~24 `Color(0x…)` (home funcional; barrido opcional).
4. **Pedidos v2 (pulido):** coords reales del negocio en la oferta al repartidor (hoy placeholder Pamplona en el mapa del conductor), foto de recogida/entrega del pedido subida al backend, y cancelación de pedido por el cliente notificando al repartidor asignado.

## Regla de oro (eficiencia de tokens)

Antes de explorar: lee este archivo y `docs/ESTRUCTURA_EMPRESAS_FLOTAS.md`. No re-verifiques lo listado en HECHO. Para lo PENDIENTE, ve directo a los archivos citados. Verifica local (backend + web) antes de commitear; Flutter se verifica en CI tras el push. **Al verificar con pipes usa `set -o pipefail`**: un `npm run typecheck | tail` sin pipefail se traga el exit code y deja pasar errores (ya pasó). Una tanda = auditar poco, arreglar, verificar, commit, push, confirmar CI.
