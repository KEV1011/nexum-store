import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Las referencias que ve la gente («NX-K7P2QA») viven en columnas ÚNICAS de
// la base: `Order.orderRef`, `PooledTrip.tripRef` y el `requestRef` de
// viajes, mandados, intermunicipales y fletes. Se generaban con
// `Math.floor(1000 + Math.random() * 8000)`, o sea ocho mil valores: con
// ochocientos pedidos guardados, uno de cada diez pedidos nuevos chocaba con
// una referencia existente y el cliente recibía un error sin explicación (y
// en el domicilio el inventario ya se había descontado). La E2E de sillas lo
// destapó con un P2002 en `tripRef`.
//
// El arreglo es `nuevaReferencia()` (lib/referencia.ts). Esta prueba es lo
// que impide que una referencia nueva vuelva a nacer con el generador corto:
// el compilador no lo ve, porque un número aleatorio en una plantilla es
// código perfectamente válido.
//
// Lo que NO marca, a propósito: asignar el id del propio registro
// (`requestRef: ride.id`), que ya es único, ni leer la referencia de otra
// fila (`orderRef: o.orderRef`). Una prueba que marca usos correctos acaba
// desactivada.

const RAIZ = join(__dirname, '..');
const COLUMNAS = /\b(orderRef|tripRef|requestRef)\s*[:=]\s*(.+)$/;

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

/** Cada línea de código (sin comentarios) que asigna una de las columnas. */
function asignaciones(): Array<{ donde: string; linea: string; valor: string; declara: boolean }> {
  const salida: Array<{ donde: string; linea: string; valor: string; declara: boolean }> = [];
  for (const ruta of archivosTs(RAIZ)) {
    const relativa = ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
    readFileSync(ruta, 'utf8')
      .split('\n')
      .forEach((cruda, i) => {
        const linea = cruda.trim();
        if (linea.startsWith('//') || linea.startsWith('*')) return;
        const m = COLUMNAS.exec(linea);
        if (!m) return;
        salida.push({
          donde: `${relativa}:${i + 1}`,
          linea,
          valor: m[2]!.trim(),
          declara: /^(const|let|var)\s/.test(linea),
        });
      });
  }
  return salida;
}

describe('las referencias únicas no vuelven al generador de ocho mil valores', () => {
  it('ninguna asignación a una columna única usa un número aleatorio ni una plantilla', () => {
    const malas = asignaciones()
      .filter((a) => /Math\.random|Date\.now|`/.test(a.valor))
      .map((a) => `${a.donde} → ${a.linea}`);
    expect(malas, `Usa nuevaReferencia(prefijo) de lib/referencia.ts:\n${malas.join('\n')}`).toEqual([]);
  });

  it('donde se GENERA la referencia se usa nuevaReferencia()', () => {
    const generadas = asignaciones().filter((a) => a.declara);
    // Si esto llega a cero, el barrido dejó de ver el código y la prueba
    // de arriba pasaría por no mirar nada.
    expect(generadas.length).toBeGreaterThanOrEqual(7);
    const malas = generadas
      .filter((a) => !a.valor.startsWith('nuevaReferencia('))
      .map((a) => `${a.donde} → ${a.linea}`);
    expect(malas, `Usa nuevaReferencia(prefijo):\n${malas.join('\n')}`).toEqual([]);
  });

  it('el generador corto no aparece en ningún servicio que guarde en la base', () => {
    // `rideRef` de la negociación «Pon tu precio» vive en memoria y no es una
    // columna: es el único sitio donde el generador corto no hace daño.
    const permitidos = new Set(['services/ride-negotiation.service.ts']);
    const fugas: string[] = [];
    for (const ruta of archivosTs(RAIZ)) {
      const relativa = ruta.slice(RAIZ.length + 1).replace(/\\/g, '/');
      if (permitidos.has(relativa)) continue;
      readFileSync(ruta, 'utf8')
        .split('\n')
        .forEach((cruda, i) => {
          const linea = cruda.trim();
          if (linea.startsWith('//') || linea.startsWith('*')) return;
          if (/Math\.random\(\)\s*\*\s*8000/.test(linea)) fugas.push(`${relativa}:${i + 1} → ${linea}`);
        });
    }
    expect(fugas, fugas.join('\n')).toEqual([]);
  });
});
