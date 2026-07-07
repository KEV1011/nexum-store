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

## PENDIENTE (Tanda 3) — punteros exactos

1. **`IntercityBooking` sin `operatorId`:** los viajes troncales que la autorización de la empresa habilitó no aparecen en su liquidación. Requiere migración offline + sellar en `driverAcceptIntercity` (mismo patrón que `onDriverAccept`) + incluirlos en `/operator/trips`.
2. **Viaje activo del conductor semi-mock:** `AppTransport .../active_trip/data/datasources/active_trip_datasource.dart` calcula tarifa local y `trip_summary_screen.dart` añade un viaje sintético a `trip_history_provider` — debe refetch de `/earnings/history` (la verdad del backend ya existe).
3. **Estado `arriving` nunca se envía:** la app conductor manda solo arrived/in_progress/completed (`active_trip_screen.dart`); enviar `arriving` al iniciar la navegación al pickup.
4. **Código muerto restante:** `_startTripSimulation` server-side en `client.service.ts` (vía `acceptClientTrip`) — no se usa en el flujo real; considerar flag demo o borrar.
5. **Decisión de negocio:** `Errand`/`Order` no llevan `operatorId` (mandados/pedidos de conductores afiliados no son atribuibles a la empresa).
6. **Activar `INTERCITY_DUAL_MODEL=true` en Render** cuando existan empresas verificadas con rutas autorizadas.

## Regla de oro (eficiencia de tokens)

Antes de explorar: lee este archivo y `docs/ESTRUCTURA_EMPRESAS_FLOTAS.md`. No re-verifiques lo listado en HECHO. Para lo PENDIENTE, ve directo a los archivos citados. Verifica local (backend + web) antes de commitear; Flutter se verifica en CI tras el push. Una tanda = auditar poco, arreglar, verificar, commit, push, confirmar CI.
