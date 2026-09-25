import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Que los tipos escritos a mano del portal no MIENTAN sobre lo que devuelve la
 * base de datos.
 *
 * EL FALLO QUE ESTO EVITA, y que tumbó el portal en producción: la sección
 * «Equipo y vehículos» de /empresa se caía entera con «This page couldn't
 * load». La causa era una sola línea —`d.rating.toFixed(2)`— sobre un campo
 * que la interfaz `OperatorDriver` declaraba `number` mientras el backend
 * devuelve `Driver.rating`, que es `Float?`. La migración de calificaciones
 * dejó en NULL a todo conductor sin votos, así que reventaba con el PRIMER
 * conductor que hubiera completado un servicio sin recibir estrellas.
 *
 * POR QUÉ NO LO CAZÓ `tsc`: `listOperatorDrivers` devuelve el resultado de
 * Prisma sin DTO declarado, así que el portal se escribió su propia interfaz a
 * mano. Un tipo escrito a mano que no coincide con la API es indistinguible de
 * uno correcto para el compilador: nunca exigió la guarda.
 *
 * La comparación se hace contra `schema.prisma`, que es la única fuente que
 * sabe de verdad qué columna admite NULL.
 */

const RAIZ = join(__dirname, '..', '..');

function leer(rel: string): string {
  return readFileSync(join(RAIZ, rel), 'utf8');
}

/** Los campos que un `select` de Prisma pide, tal como están escritos. */
function camposDelSelect(fuente: string, funcion: string): string[] {
  const desde = fuente.indexOf(`export async function ${funcion}`);
  if (desde < 0) throw new Error(`no encontré ${funcion}`);
  const ini = fuente.indexOf('select: {', desde);
  if (ini < 0) throw new Error(`${funcion} no tiene select`);
  const fin = fuente.indexOf('},', ini);
  return [...fuente.slice(ini, fin).matchAll(/^\s*(\w+):\s*true/gm)].map((m) => m[1]!);
}

/** Campos de un modelo de Prisma que admiten NULL (`Tipo?`). */
function camposNulables(schema: string, modelo: string): Set<string> {
  const desde = schema.indexOf(`model ${modelo} {`);
  if (desde < 0) throw new Error(`no encontré model ${modelo}`);
  const cuerpo = schema.slice(desde, schema.indexOf('\n}', desde));
  const out = new Set<string>();
  for (const m of cuerpo.matchAll(/^\s{2}(\w+)\s+([A-Za-z]+)(\?)?/gm)) {
    if (m[3] === '?') out.add(m[1]!);
  }
  return out;
}

/** Cómo declara el portal cada campo de una interfaz suya. */
function camposDeInterfaz(fuente: string, nombre: string): Map<string, string> {
  const desde = fuente.indexOf(`interface ${nombre} {`);
  if (desde < 0) throw new Error(`no encontré interface ${nombre}`);
  const cuerpo = fuente.slice(desde, fuente.indexOf('\n}', desde));
  const out = new Map<string, string>();
  for (const m of cuerpo.matchAll(/^\s{2}(\w+)(\??):\s*([^\n/]+)/gm)) {
    out.set(m[1]!, `${m[2]}${m[3]}`.trim());
  }
  return out;
}

describe('los tipos del portal no mienten sobre la base', () => {
  it('OperatorDriver declara nullable todo lo que la columna admite en NULL', () => {
    const servicio = leer('src/services/operator.service.ts');
    const schema = leer('prisma/schema.prisma');
    const portal = leer('../app/empresa/DriversManager.tsx');

    const pedidos = camposDelSelect(servicio, 'listOperatorDrivers');
    const nulables = camposNulables(schema, 'Driver');
    const declarados = camposDeInterfaz(portal, 'OperatorDriver');

    // La prueba no prueba nada si el parseo falla en silencio.
    expect(pedidos.length).toBeGreaterThan(5);
    expect(nulables.has('rating')).toBe(true);

    const mentiras: string[] = [];
    for (const campo of pedidos) {
      if (!nulables.has(campo)) continue;
      const decl = declarados.get(campo);
      if (decl === undefined) continue; // el portal no lo pinta: no le afecta
      // Vale `?: X`, `X | null` o `X | undefined`.
      const admiteVacio = decl.startsWith('?') || /\|\s*(null|undefined)/.test(decl);
      if (!admiteVacio) mentiras.push(`${campo}: declarado "${decl}", la columna admite NULL`);
    }
    expect(mentiras).toEqual([]);
  });

  // NO se añade una regla de texto que prohíba `.rating.toFixed(`: en
  // AnalyticsPanel ese mismo texto está DENTRO de un `d.rating != null &&` y es
  // correcto. Una prueba que marca usos buenos acaba desactivada, y entonces no
  // vigila nada. Lo que de verdad cierra el agujero es el tipo honesto: con
  // `number | null` el compilador exige la guarda en cada sitio, hoy y siempre.

});
