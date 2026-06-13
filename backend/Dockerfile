# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Debian slim en lugar de Alpine: Prisma (motor de migración/consulta) carga
# OpenSSL de forma fiable aquí; en alpine fallaba con "failed to detect libssl".
FROM node:20-slim AS builder

WORKDIR /app

# OpenSSL es necesario para que el motor de Prisma cargue.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies (including dev deps needed for TypeScript compilation)
COPY package*.json ./
RUN npm ci

# Copy source, generate the Prisma client (provee los tipos de los modelos que
# usa el build de TypeScript) y compila. Sin `prisma generate` el tsc falla.
COPY . .
RUN npx prisma generate
RUN npm run build

# Prune devDependencies so we only ship production modules
RUN npm prune --omit=dev

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

# OpenSSL para el motor de consultas de Prisma en runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root user
RUN groupadd -r nexum && useradd -r -g nexum nexum

# Copy compiled output and production node_modules from builder
COPY --from=builder --chown=nexum:nexum /app/dist ./dist
COPY --from=builder --chown=nexum:nexum /app/node_modules ./node_modules
COPY --from=builder --chown=nexum:nexum /app/package.json ./package.json

# Copy Prisma schema so @prisma/client can locate it at runtime
COPY --from=builder --chown=nexum:nexum /app/prisma ./prisma

USER nexum

EXPOSE 3000

CMD ["node", "dist/index.js"]
