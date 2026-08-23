import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Hay DOS Dockerfiles y es fácil arreglar el que no despliega:
//
//   • `/Dockerfile`         → el que construye RENDER (render.yaml apunta a
//                             `dockerfilePath: ./Dockerfile`, contexto la raíz).
//   • `/backend/Dockerfile` → el que usa docker-compose en local.
//
// Pasó exactamente eso: se arregló el arranque en el de backend/, Render siguió
// con el de la raíz, y el servidor corrió con el esquema viejo hasta que el
// error de Prisma le salió a un pasajero al pedir un viaje. Las dos veces que
// se "arregló" no cambió nada porque el arreglo no llegaba a producción.
//
// El resto del fichero PUEDE diferir (los contextos de build son distintos:
// uno copia `backend/`, el otro copia `.`), pero el comando de arranque no.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(__dirname, '..', '..', '..');
const PRODUCCION = join(RAIZ, 'Dockerfile');
const LOCAL = join(RAIZ, 'backend', 'Dockerfile');

/** El CMD tal como lo ejecutaría Docker: primero une las líneas partidas con \. */
function comandoDeArranque(ruta: string): string {
  const unido = readFileSync(ruta, 'utf8').replace(/\\\n/g, '');
  const linea = unido.split('\n').find((l) => l.startsWith('CMD '));
  if (!linea) throw new Error(`${ruta} no tiene CMD`);
  const partes = JSON.parse(linea.slice(4).trim()) as string[];
  return partes[partes.length - 1]!;
}

describe('los dos Dockerfiles arrancan igual', () => {
  it('ambos existen', () => {
    expect(existsSync(PRODUCCION), 'falta el Dockerfile de la raíz').toBe(true);
    expect(existsSync(LOCAL), 'falta backend/Dockerfile').toBe(true);
  });

  it('el CMD es JSON válido en los dos', () => {
    expect(() => comandoDeArranque(PRODUCCION)).not.toThrow();
    expect(() => comandoDeArranque(LOCAL)).not.toThrow();
  });

  it('ejecutan EL MISMO comando de arranque', () => {
    expect(comandoDeArranque(PRODUCCION)).toBe(comandoDeArranque(LOCAL));
  });

  it('el arranque aplica migraciones', () => {
    expect(comandoDeArranque(PRODUCCION)).toContain('prisma migrate deploy');
  });

  it('y si fallan, deja constancia en vez de tragárselo', () => {
    const cmd = comandoDeArranque(PRODUCCION);
    // La marca es lo que /health publica como `migraciones: fallaron`.
    expect(cmd).toContain('/tmp/nexum-migraciones-fallaron');
  });

  it('intenta recuperarse de una migración fallida', () => {
    expect(comandoDeArranque(PRODUCCION)).toContain('recuperar-migraciones.mjs');
  });
});

describe('lo que el arranque necesita está donde la imagen lo va a buscar', () => {
  it('el script de recuperación existe en prisma/, que es lo que se copia', () => {
    // El runner hace `COPY --from=builder /app/prisma ./prisma`, así que el
    // script tiene que vivir ahí dentro; en cualquier otra carpeta el
    // contenedor no lo encontraría y la recuperación fallaría en silencio.
    expect(existsSync(join(RAIZ, 'backend', 'prisma', 'recuperar-migraciones.mjs'))).toBe(true);
  });

  it('el CMD lo invoca por esa misma ruta', () => {
    expect(comandoDeArranque(PRODUCCION)).toContain('node prisma/recuperar-migraciones.mjs');
  });

  it('render.yaml sigue apuntando al Dockerfile de la raíz', () => {
    // Si esto cambiara, la prueba de arriba estaría comparando el fichero
    // equivocado y volveríamos al mismo punto.
    const render = readFileSync(join(RAIZ, 'render.yaml'), 'utf8');
    expect(render).toContain('dockerfilePath: ./Dockerfile');
  });
});
