import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Las migraciones son ficheros .sql que NADIE compila: TypeScript no las mira,
// el linter tampoco, y Prisma solo se entera cuando intenta aplicarlas contra
// la base de datos de verdad. Si una lleva basura dentro, el fallo aparece en
// producción — y con el arranque tolerante de Render, ni siquiera tumba el
// despliegue: el servidor corre con el esquema viejo y el error le sale al
// usuario cuando pide un viaje.
//
// Pasó exactamente eso: generar la migración con `> fichero.sql 2>&1` metió el
// aviso de actualización de npm DENTRO del SQL. Esta prueba lo habría cazado
// antes de salir del repositorio.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = join(__dirname, '..', '..', 'prisma', 'migrations');

function migraciones(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function sqlDe(nombre: string): string {
  return readFileSync(join(DIR, nombre, 'migration.sql'), 'utf8');
}

/**
 * ¿Esta línea puede ser SQL?
 *
 * No se valida la gramática —para eso está PostgreSQL—, solo se descarta lo que
 * evidentemente NO lo es: la salida de una herramienta que se coló por una
 * redirección. Es la clase de error que se comete al generar el fichero, no al
 * escribir SQL a mano.
 */
const RUIDO = [
  /^npm (notice|warn|error|WARN|ERR)/i,
  /^Prisma schema loaded/i,
  /^Environment variables loaded/i,
  /^Datasource ".+":/i,
  /^\d+ migrations? found/i,
  /^(No pending migrations|Applying migration|Already in sync)/i,
  /^warning:/i,
  /^\$ /,
  /^Error:/i,
];

describe('los ficheros de migración solo contienen SQL', () => {
  const todas = migraciones();

  it('hay migraciones que revisar', () => {
    expect(todas.length).toBeGreaterThan(0);
  });

  it('ninguna trae salida de herramientas metida dentro', () => {
    const sucias: string[] = [];
    for (const m of todas) {
      const lineas = sqlDe(m).split('\n');
      lineas.forEach((l, i) => {
        const t = l.trim();
        if (!t || t.startsWith('--') || t.startsWith('/*') || t.startsWith('*')) return;
        if (RUIDO.some((r) => r.test(t))) {
          sucias.push(`${m}:${i + 1} → ${t.slice(0, 70)}`);
        }
      });
    }
    expect(sucias, `Líneas que no son SQL:\n${sucias.join('\n')}`).toEqual([]);
  });

  it('ninguna está vacía', () => {
    const vacias = todas.filter((m) => sqlDe(m).trim().length === 0);
    expect(vacias).toEqual([]);
  });

  it('todas terminan alguna sentencia (llevan al menos un ;)', () => {
    const sinPuntoYComa = todas.filter((m) => !sqlDe(m).includes(';'));
    expect(sinPuntoYComa).toEqual([]);
  });

  it('los nombres van en orden cronológico y sin repetir marca de tiempo', () => {
    const sellos = todas.map((m) => m.split('_')[0]!);
    expect(sellos).toEqual([...sellos].sort());
    expect(new Set(sellos).size, `marcas repetidas en: ${todas.join(', ')}`)
      .toBe(sellos.length);
  });
});
