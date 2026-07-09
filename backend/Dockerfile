# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Alpine no trae OpenSSL por defecto: sin esto Prisma no puede detectar la
# versión de libssl ("Prisma failed to detect the libssl/openssl version"),
# genera el cliente para un motor que no coincide con el runtime, y
# `migrate deploy` revienta al arrancar con un motor que ni siquiera responde
# JSON válido. Se instala también aquí (no solo en runner) para que
# `prisma generate` detecte la versión correcta desde este paso.
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies (including dev deps needed for TypeScript compilation)
COPY package*.json ./
RUN npm ci

# Copy source and compile
COPY . .
# Generar el cliente Prisma CON el schema ya presente. El postinstall de `npm ci`
# corre antes del COPY (sin schema), así que produce un cliente sin los tipos del
# modelo (p. ej. el enum PromoType) y `tsc` falla con TS2305. Regenerar aquí es
# lo que hace que el build sea consistente con el CI.
RUN npx prisma generate
RUN npm run build

# Prune devDependencies y regenerar el cliente para que sobreviva el prune hacia
# la imagen de runner.
RUN npm prune --omit=dev && npx prisma generate

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Mismo motivo que en el builder: el motor de Prisma que corre `migrate deploy`
# y las queries en producción necesita libssl real, no la detección por defecto.
RUN apk add --no-cache openssl

ENV NODE_ENV=production

WORKDIR /app

# Run as non-root user
RUN addgroup -S nexum && adduser -S nexum -G nexum

# Copy compiled output and production node_modules from builder
COPY --from=builder --chown=nexum:nexum /app/dist ./dist
COPY --from=builder --chown=nexum:nexum /app/node_modules ./node_modules
COPY --from=builder --chown=nexum:nexum /app/package.json ./package.json

# Copy Prisma schema so @prisma/client can locate it at runtime
COPY --from=builder --chown=nexum:nexum /app/prisma ./prisma

# Carpeta de subida de documentos (fallback a disco sin S3_BUCKET). /app es de
# root por defecto (WORKDIR la crea antes del USER nexum de abajo): sin este
# chown, el mkdir que hace lib/upload.ts al arrancar revienta con
# EACCES y tumbaba el proceso completo.
RUN mkdir -p /app/uploads/driver-documents && chown -R nexum:nexum /app/uploads

USER nexum

EXPOSE 3000

# Aplica migraciones pendientes al arrancar (aquí sí hay DATABASE_URL). Si
# `migrate deploy` falla (p. ej. historial desincronizado al cambiar de rama),
# el servidor arranca igual para no quedar muerto: /health reporta db:true/false.
CMD ["sh", "-c", "npx prisma migrate deploy || echo '[start] WARN: prisma migrate deploy falló — el servidor arranca igual; revisa /health (db) y los logs de migración'; exec node dist/index.js"]
