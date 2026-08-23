// ─────────────────────────────────────────────────────────────────────────────
// Desatasca un despliegue bloqueado por una migración FALLIDA.
//
// Cuando `prisma migrate deploy` no puede aplicar una migración, deja la fila
// en `_prisma_migrations` con `finished_at` en null y a partir de ahí se niega
// a aplicar NINGUNA otra (error P3009). Salir de ahí normalmente pide una
// consola contra la base de producción, que en Render no siempre se tiene: el
// servicio queda con el código nuevo y el esquema viejo hasta que alguien
// entra a mano.
//
// POR QUÉ ES SEGURO MARCARLAS COMO REVERTIDAS:
// PostgreSQL ejecuta DDL dentro de transacciones y Prisma envuelve cada fichero
// de migración en una, así que una migración que falló NO dejó nada a medias:
// revirtió entera. Marcarla como revertida solo refleja lo que la base ya hizo.
// Eso deja de ser cierto si alguna migración usa sentencias que no admiten
// transacción (CREATE INDEX CONCURRENTLY, VACUUM…), y por eso este script las
// busca y se planta si encuentra alguna: ahí sí haría falta mirar a mano.
//
// Se ejecuta SOLO después de un fallo (ver el CMD del Dockerfile), nunca en un
// despliegue sano.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_MIGRACIONES = join(AQUI, 'migrations');

/** Sentencias que PostgreSQL no admite dentro de una transacción. */
const NO_TRANSACCIONAL = /\b(concurrently|vacuum|create\s+database|drop\s+database|alter\s+system)\b/i;

function migracionesNoAtomicas() {
  if (!existsSync(DIR_MIGRACIONES)) return [];
  const sospechosas = [];
  for (const e of readdirSync(DIR_MIGRACIONES, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const f = join(DIR_MIGRACIONES, e.name, 'migration.sql');
    if (!existsSync(f)) continue;
    if (NO_TRANSACCIONAL.test(readFileSync(f, 'utf8'))) sospechosas.push(e.name);
  }
  return sospechosas;
}

async function main() {
  const noAtomicas = migracionesNoAtomicas();
  if (noAtomicas.length > 0) {
    console.error(
      '[recuperar] HAY migraciones con sentencias no transaccionales ' +
        `(${noAtomicas.join(', ')}). Una de esas puede quedar a medias, así que ` +
        'NO se marca nada automáticamente: revísalo a mano.',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let fallidas = [];
  try {
    fallidas = await prisma.$queryRawUnsafe(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
       ORDER BY started_at ASC`,
    );
  } catch (e) {
    console.error('[recuperar] no se pudo consultar el historial de migraciones:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  }
  await prisma.$disconnect();

  if (fallidas.length === 0) {
    console.log('[recuperar] no hay migraciones fallidas; el fallo del despliegue es otro.');
    process.exit(1);
  }

  for (const { migration_name: nombre } of fallidas) {
    console.log(`[recuperar] marcando como revertida: ${nombre}`);
    try {
      execFileSync('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', nombre], {
        stdio: 'inherit',
      });
    } catch {
      console.error(`[recuperar] no se pudo marcar ${nombre}`);
      process.exit(1);
    }
  }
  console.log(`[recuperar] ${fallidas.length} migración(es) desatascada(s); se reintenta el despliegue.`);
}

main().catch((e) => {
  console.error('[recuperar] error inesperado:', e);
  process.exit(1);
});
