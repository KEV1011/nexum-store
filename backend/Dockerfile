# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

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
FROM node:20-alpine AS runner

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

USER nexum

EXPOSE 3000

CMD ["node", "dist/index.js"]
