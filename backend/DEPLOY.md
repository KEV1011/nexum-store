# Deploy del backend — Nexum

El backend es **Node.js + Express + WebSocket + Prisma (PostgreSQL)**. Corre en
un solo contenedor; al arrancar aplica las migraciones de Prisma
(`entrypoint.sh` → `prisma migrate deploy`) y luego levanta el servidor HTTP +
WebSocket en el mismo puerto (`3000`).

## Variables de entorno

| Variable | Obligatoria | Descripción |
|----------|:-----------:|-------------|
| `DATABASE_URL` | ✅ | Cadena PostgreSQL. Sin ella el arranque falla en `migrate deploy`. |
| `JWT_SECRET` | ✅ | Secreto para firmar tokens. Genera con `openssl rand -hex 32`. |
| `PORT` | — | Por defecto `3000`. |
| `NODE_ENV` | — | `production` en el servidor. |
| `CORS_ORIGIN` | — | `*` es seguro para apps móviles (no envían Origin). |
| `GOOGLE_MAPS_API_KEY` | — | Directions/Geocoding/Places. Vacío ⇒ ruta recta de respaldo. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | JSON del service account (una línea). Vacío ⇒ push desactivado (no-op). |
| `TWILIO_*` | — | OTP por SMS. Vacío ⇒ modo mock (acepta `123456`). |
| `PORTAL_BASE_URL` | — | Base para links del portal de negocios. |

> ⚠️ Usa **claves de Google Maps distintas** para backend, Android e iOS, y
> restríngelas (el backend por IP del servidor).

## Opción A — Dokploy / Docker Compose (recomendada)

El `docker-compose.yml` en la raíz levanta API + PostgreSQL con healthcheck.

1. En Dokploy, crea un servicio tipo **Compose** apuntando a este repositorio y
   rama (`claude/driver-app-maas-pamplona-LYIfo`).
2. Define las variables de entorno (al menos `JWT_SECRET`,
   `POSTGRES_PASSWORD`, y `GOOGLE_MAPS_API_KEY` si la tienes). `DATABASE_URL`
   ya queda apuntando al servicio `nexum-db` por defecto.
3. Deploy. El contenedor corre migraciones y arranca.
4. Verifica: `GET https://<tu-dominio>/health` debe responder `{"status":"ok"}`.

```bash
# Prueba local equivalente:
docker compose up --build
curl http://localhost:3000/health
```

## Opción B — Render / Railway

Hay `render.yaml` y `railway.toml` en la raíz que construyen el `Dockerfile`
raíz (ya alineado para correr migraciones). Necesitas aprovisionar una base de
datos PostgreSQL aparte y definir `DATABASE_URL` + `JWT_SECRET`.

## Conectar las apps al backend

Las apps leen la URL en tiempo de compilación con `--dart-define` (no van
hardcodeadas). Reemplaza el dominio por el real:

```bash
# Cliente
cd AppCliente
flutter build apk \
  --dart-define=API_BASE_URL=https://api.nexum.tudominio.com \
  --dart-define=WS_BASE_URL=wss://api.nexum.tudominio.com

# Conductor
cd AppTransport
flutter build apk \
  --dart-define=API_BASE_URL=https://api.nexum.tudominio.com \
  --dart-define=WS_BASE_URL=wss://api.nexum.tudominio.com
```

> Usa `https://` y `wss://` (TLS). El WebSocket viaja por el mismo host/puerto
> que el REST, así que basta el mismo dominio con esquema `wss`.

En CI (GitHub Actions) define los secretos `API_BASE_URL` y `WS_BASE_URL` como
ya documenta `docs/SETUP_PRODUCCION.md`.

## Checklist previo al piloto

- [ ] `DATABASE_URL` y `JWT_SECRET` definidos en el servidor.
- [ ] `GET /health` responde `ok` detrás del dominio con TLS.
- [ ] WebSocket accesible por `wss://` (probar conexión real desde una app).
- [ ] APKs construidos con `--dart-define` apuntando al dominio de producción.
- [ ] (Opcional) `GOOGLE_MAPS_API_KEY` y `FIREBASE_SERVICE_ACCOUNT_JSON`.
