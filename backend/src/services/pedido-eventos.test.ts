import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// La bitácora del pedido tiene UNA puerta. El estado del pedido se mueve
// desde trece sitios repartidos en cinco archivos, y repartir también el
// `create` de la bitácora por los trece es garantizar que al catorceavo se
// le olvide — que es exactamente lo que pasó con la condición de despacho
// («una CUARTA copia en `_offerOrderToCandidate`, que descartaba el
// candidato en silencio»).
//
// Esta prueba es lo único que sostiene esa puerta: el compilador no puede
// verla, porque `prisma.orderEvent.create` es válido desde cualquier parte.

const RAIZ = join(__dirname, '..');
const PUERTA = 'services/pedido-eventos.service.ts';

function archivosTs(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...archivosTs(ruta));
    } else if (entrada.endsWith('.ts') && !entrada.includes('.test.')) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe('la bitácora del pedido se escribe por un solo sitio', () => {
  it('nadie más toca `prisma.orderEvent`', () => {
    const fugas: string[] = [];
    for (const ruta of archivosTs(RAIZ)) {
      const relativa = ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
      if (relativa === PUERTA) continue;
      const src = readFileSync(ruta, 'utf8');
      if (src.includes('prisma.orderEvent')) fugas.push(relativa);
    }
    expect(
      fugas,
      `escriben la bitácora por su cuenta en vez de usar `
      + `registrarEventoPedido(): ${fugas.join(', ')}`,
    ).toEqual([]);
  });

  it('registrar un evento NUNCA puede tumbar la transición que lo produjo', () => {
    // Es best-effort a propósito: perder una hora del historial es molesto;
    // que un fallo al escribirla impida que el pedido pase a «en camino»
    // deja al cliente con la caja parada. La firma lo dice —`Promise<void>`,
    // sin resultado que comprobar— y el cuerpo tiene que atrapar todo.
    const src = readFileSync(join(RAIZ, PUERTA), 'utf8');
    const cuerpo = src.slice(src.indexOf('export async function registrarEventoPedido'));
    const fin = cuerpo.indexOf('\n}\n');
    expect(cuerpo.slice(0, fin)).toMatch(/catch\s*\(/);
  });

  it('cada estado del enum de Prisma cabe en el tipo de la bitácora', () => {
    // `EstadoPedidoBD` está escrito a mano en `lib/` para que la línea de
    // tiempo no dependa del cliente de Prisma. Un estado nuevo en el schema
    // que no esté ahí dejaría su paso sin poder registrarse.
    const schema = readFileSync(
      join(RAIZ, '..', 'prisma', 'schema.prisma'), 'utf8',
    );
    const bloque = /enum OrderStatus \{([\s\S]*?)\}/.exec(schema);
    expect(bloque).not.toBeNull();
    const delSchema = bloque![1]!
      .replace(/\/\/\/.*$/gm, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[A-Z_]+$/.test(l));

    const lib = readFileSync(join(RAIZ, 'lib', 'linea-tiempo-pedido.ts'), 'utf8');
    const tipo = /export type EstadoPedidoBD =([\s\S]*?);/.exec(lib);
    expect(tipo).not.toBeNull();
    const faltan = delSchema.filter((e) => !tipo![1]!.includes(`'${e}'`));
    expect(faltan, 'estados del schema que la bitácora no sabe nombrar').toEqual([]);
  });
});
