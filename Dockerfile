# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Alpine no trae OpenSSL por defecto: sin esto Prisma no detecta la versión de
# libssl y genera un cliente para un motor que no coincide con el runtime.
RUN apk add --no-cache openssl

WORKDIR /app

# Copy only backend source (build context is repo root)
COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev && npx prisma generate

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S nexum && adduser -S nexum -G nexum

COPY --from=builder --chown=nexum:nexum /app/dist ./dist
COPY --from=builder --chown=nexum:nexum /app/node_modules ./node_modules
COPY --from=builder --chown=nexum:nexum /app/package.json ./package.json
COPY --from=builder --chown=nexum:nexum /app/prisma ./prisma

# Carpeta de subida de documentos (fallback a disco sin S3_BUCKET); /app es de
# root por defecto y el mkdir en tiempo de ejecución revienta con EACCES sin esto.
RUN mkdir -p /app/uploads/driver-documents && chown -R nexum:nexum /app/uploads

USER nexum

EXPOSE 3000

# Arranque resiliente: si `migrate deploy` falla (típicamente por un historial
# de migraciones desincronizado al cambiar la rama del servicio), el servidor
# NO debe quedar muerto — arranca igual y /health reporta el estado real de la
# BD (db:true/false). Antes, el `&&` tumbaba TODO el backend ante cualquier
# fallo de migración, dejando apps y portales sin diagnóstico.
CMD ["sh", "-c", "npx prisma migrate deploy || echo '[start] WARN: prisma migrate deploy falló — el servidor arranca igual; revisa /health (db) y los logs de migración'; exec node dist/index.js"]
