import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { $Enums } from '@prisma/client';
import { BUSINESS_CATEGORIES } from '../types';

// La categoría del comercio viaja por CUATRO superficies escritas en dos
// lenguajes —el enum de Prisma, la unión de TypeScript, el desplegable del
// portal y el enum de Dart— y nada las ata salvo esto. Cuando se añadió
// «Tiendas», olvidar una sola habría dado un fallo distinto en cada sitio:
// el registro rechazado sin motivo claro, el formulario sin inventario, o un
// almacén de ropa apareciendo en la app como «Supermercado».

const RAIZ = join(__dirname, '../../..');

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

describe('la categoría del comercio, en las cuatro superficies', () => {
  it('la lista de TypeScript cubre el enum de Prisma, y al revés', () => {
    const prisma = Object.values($Enums.BusinessCategory).map((v) =>
      v.toLowerCase(),
    );
    expect([...BUSINESS_CATEGORIES].sort()).toEqual([...prisma].sort());
  });

  it('el desplegable del portal ofrece todas', () => {
    // Una categoría que existe en la base pero no en el formulario es una que
    // ningún negocio nuevo puede elegir: quedaría inalcanzable en silencio,
    // que es exactamente lo que le pasaba a la mercancía.
    const registro = leer('app/negocio/registro/page.tsx');
    const bloque = /const CATEGORIES = \[([\s\S]*?)\] as const/.exec(registro);
    expect(bloque, 'no se encontró CATEGORIES en el registro').not.toBeNull();

    const enElFormulario = new Set(
      [...bloque![1]!.matchAll(/value:\s*'([a-z]+)'/g)].map((m) => m[1]!),
    );
    const faltan = BUSINESS_CATEGORIES.filter((c) => !enElFormulario.has(c));
    expect(faltan, 'categorías que ningún negocio puede elegir').toEqual([]);
  });

  it('el enum de la app cliente cubre todas', () => {
    const dart = leer(
      'AppCliente/lib/features/businesses/domain/entities/business_entity.dart',
    );
    const bloque = /enum BusinessCategory\s*\{([^}]*)\}/.exec(dart);
    expect(bloque, 'no se encontró el enum en la app cliente').not.toBeNull();

    // Comentarios fuera ANTES de partir por comas: un comentario del enum
    // lleva comas dentro y al revés se pierden valores.
    const valores = new Set(
      bloque![1]!
        .replace(/\/\/.*$/gm, '')
        .split(',')
        .map((l) => l.trim())
        .filter((l) => /^[a-z][A-Za-z]*$/.test(l)),
    );
    const faltan = BUSINESS_CATEGORIES.filter((c) => !valores.has(c));
    expect(
      faltan,
      'el backend manda categorías que la app no conoce: caerán a `other`',
    ).toEqual([]);
  });

  it('la app cliente traduce cada categoría, sin dejar el nombre crudo', () => {
    const dart = leer(
      'AppCliente/lib/features/businesses/domain/entities/business_entity.dart',
    );
    for (const c of BUSINESS_CATEGORIES) {
      expect(
        dart.includes(`case BusinessCategory.${c}:`),
        `la categoría ${c} no tiene etiqueta en la app`,
      ).toBe(true);
    }
  });

  it('el parser de la app reconoce cada categoría por su nombre del servidor', () => {
    // Sin esto la categoría existe en el enum de Dart pero el JSON nunca la
    // produce: el comercio llega bien del servidor y la app lo pinta como
    // «Comercio», sin que falle nada ni se note.
    const parser = leer(
      'AppCliente/lib/features/businesses/data/datasources/' +
        'businesses_real_datasource.dart',
    );
    const bloque = /_mapCategory\(String s\) => switch \(s\) \{([\s\S]*?)\};/
      .exec(parser);
    expect(bloque, 'no se encontró _mapCategory').not.toBeNull();

    const reconocidas = new Set(
      [...bloque![1]!.matchAll(/'([a-z]+)'\s*=>/g)].map((m) => m[1]!),
    );
    // `other` es el comodín del `_ =>`, no necesita rama propia.
    const faltan = BUSINESS_CATEGORIES.filter(
      (c) => c !== 'other' && !reconocidas.has(c),
    );
    expect(faltan).toEqual([]);
  });

  it('el catálogo del portal decide el inventario con una lista de los que SÍ', () => {
    // Si fuera una excepción para el restaurante, cada categoría nueva
    // heredaría el formulario con código de barras sin que nadie lo decidiera.
    const catalogo = leer('app/negocio/[token]/catalogo/page.tsx');
    expect(catalogo).toContain("const CON_INVENTARIO = [");
    expect(catalogo).toMatch(/CON_INVENTARIO\s*=\s*\[[^\]]*'store'/);
  });

  it('el panel admin traduce todas las categorías', () => {
    // El panel es HTML dentro de una cadena: no lo compila nadie y una
    // categoría sin traducir sale como hueco en blanco en la tabla.
    const panel = leer('backend/src/routes/admin.routes.ts');
    const bloque = /var BIZ_CATEGORY = \{([^}]*)\}/.exec(panel);
    expect(bloque, 'no se encontró BIZ_CATEGORY en el panel').not.toBeNull();
    for (const c of BUSINESS_CATEGORIES) {
      expect(
        bloque![1]!.includes(`${c.toUpperCase()}:`),
        `el panel no traduce ${c}`,
      ).toBe(true);
    }
  });
});
