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

# ── Arranque ──────────────────────────────────────────────────────────────────
#
# ESTE es el Dockerfile que construye Render: render.yaml apunta a
# `dockerfilePath: ./Dockerfile` con el contexto en la raíz. El de
# `backend/Dockerfile` lo usa docker-compose en local.
#
# LOS DOS TIENEN QUE ARRANCAR IGUAL. Tenerlos distintos ya costó un despliegue
# entero: se arregló el de backend/, Render siguió con este, y el servidor
# corrió con el esquema viejo hasta que el error le salió a un pasajero al
# pedir un viaje. `src/lib/dockerfiles.test.ts` compara los dos CMD y falla si
# alguien vuelve a tocar solo uno.
CMD ["sh", "-c", "\
if [ -n \"$PRISMA_RESOLVE_ROLLED_BACK\" ]; then \
  echo \"[start] marcando como revertida la migración $PRISMA_RESOLVE_ROLLED_BACK\"; \
  npx prisma migrate resolve --rolled-back \"$PRISMA_RESOLVE_ROLLED_BACK\" || echo '[start] no se pudo marcar (¿ya estaba resuelta?)'; \
fi; \
if npx prisma migrate deploy; then \
  echo '[start] migraciones al día'; \
elif node prisma/recuperar-migraciones.mjs && npx prisma migrate deploy; then \
  echo '[start] migraciones al día (tras desatascar una fallida)'; \
else \
  echo '[start] ERROR: prisma migrate deploy FALLÓ. El servidor arranca, pero el esquema NO coincide con el código: /health dirá migraciones:fallaron'; \
  touch /tmp/nexum-migraciones-fallaron; \
fi; \
exec node dist/index.js"]
