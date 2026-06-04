#!/bin/sh
set -e

echo "[nexum] Running database migrations..."
node_modules/.bin/prisma migrate deploy

echo "[nexum] Starting server..."
exec node dist/index.js
