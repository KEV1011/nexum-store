# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only backend source (build context is repo root)
COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
RUN npm run build
RUN npm prune --omit=dev

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S nexum && adduser -S nexum -G nexum

COPY --from=builder --chown=nexum:nexum /app/dist ./dist
COPY --from=builder --chown=nexum:nexum /app/node_modules ./node_modules
COPY --from=builder --chown=nexum:nexum /app/package.json ./package.json
COPY --from=builder --chown=nexum:nexum /app/prisma ./prisma
# Entrypoint: corre `prisma migrate deploy` y luego arranca el servidor, igual
# que backend/Dockerfile, para que render/railway no queden sin migraciones.
COPY --from=builder --chown=nexum:nexum /app/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

USER nexum

EXPOSE 3000

CMD ["./entrypoint.sh"]
