/**
 * El perfil de catálogo por tipo de local.
 *
 * Se prueba desde aquí porque `app/negocio/perfil-catalogo.ts` es TypeScript
 * puro sin JSX y el portal Next no tiene corredor de pruebas — mismo patrón
 * que `carta-reglas.test.ts`, `moneda-portal.test.ts` y
 * `contacto-portal.test.ts`.
 *
 * LA PRUEBA QUE JUSTIFICA EL FICHERO es la primera: el restaurante ve la carta
 * por foto. Ese era el defecto reportado en producción —la función construida
 * para que un restaurante no teclee su menú estaba oculta justo para los
 * restaurantes— y la que tiene que caer si alguien vuelve a agrupar la carta
 * por foto con las herramientas de inventario.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BUSINESS_CATEGORIES } from '../types';
import {
  PERFIL_CATALOGO,
  perfilDe,
  type CategoriaComercio,
} from '../../../app/negocio/perfil-catalogo';

describe('cada local ve la herramienta que le sirve', () => {
  it('EL RESTAURANTE VE LA CARTA POR FOTO', () => {
    // El defecto que esto corrige: `CartaFoto` vivía dentro del bloque de
    // inventario, cuya lista no incluye `restaurant`. El supermercado recibe
    // un CSV de su proveedor; el que tiene una carta impresa es el
    // restaurante, y era el único que no podía subirla.
    expect(PERFIL_CATALOGO.restaurant.cartaPorFoto).toBe(true);
  });

  it('y es el ÚNICO que la ve: a un supermercado no le sirve', () => {
    expect(PERFIL_CATALOGO.supermarket.cartaPorFoto).toBe(false);
    expect(PERFIL_CATALOGO.pharmacy.cartaPorFoto).toBe(false);
    expect(PERFIL_CATALOGO.store.cartaPorFoto).toBe(false);
  });

  it('el CSV y el código de barras son de quien maneja inventario', () => {
    for (const c of ['supermarket', 'pharmacy', 'store'] as CategoriaComercio[]) {
      expect(PERFIL_CATALOGO[c].csvMasivo, c).toBe(true);
      expect(PERFIL_CATALOGO[c].codigoDeBarras, c).toBe(true);
    }
    expect(PERFIL_CATALOGO.restaurant.csvMasivo).toBe(false);
    expect(PERFIL_CATALOGO.restaurant.codigoDeBarras).toBe(false);
  });

  it('un restaurante NO cuenta existencias', () => {
    // El plato se agota y se marca agotado, pero nadie lleva «quedan 7
    // bandejas paisas». Pedirle el número es pedirle que lo mantenga, y un
    // stock que nadie actualiza deja de vender lo que sí hay.
    expect(PERFIL_CATALOGO.restaurant.existencias).toBe(false);
  });

  it('un electrodoméstico lleva marca, modelo y garantía; un plato no', () => {
    expect(PERFIL_CATALOGO.store.marca).toBe('marca-modelo-garantia');
    expect(PERFIL_CATALOGO.supermarket.marca).toBe('marca');
    expect(PERFIL_CATALOGO.restaurant.marca).toBe('ninguno');
  });

  it('las variantes con precio sirven a la carta Y a la ropa', () => {
    // Talla y color son el mismo mecanismo que el tamaño de una pizza, no uno
    // nuevo. Un supermercado no las necesita: la leche no tiene tallas.
    expect(PERFIL_CATALOGO.restaurant.opciones).toBe(true);
    expect(PERFIL_CATALOGO.store.opciones).toBe(true);
    expect(PERFIL_CATALOGO.supermarket.opciones).toBe(false);
  });
});

describe('una sección se llama distinto en cada negocio', () => {
  it('carta, pasillo y departamento', () => {
    expect(PERFIL_CATALOGO.restaurant.seccion.una).toMatch(/carta/i);
    expect(PERFIL_CATALOGO.supermarket.seccion.una).toMatch(/pasillo/i);
    expect(PERFIL_CATALOGO.store.seccion.una).toMatch(/departamento/i);
  });

  it('y todas traen un ejemplo, para no tener que inventárselo', () => {
    for (const c of Object.keys(PERFIL_CATALOGO) as CategoriaComercio[]) {
      expect(PERFIL_CATALOGO[c].ejemploSeccion.length, c).toBeGreaterThan(3);
    }
  });
});

describe('ninguna categoría se queda sin perfil', () => {
  it('las cinco del enum están, y no sobra ninguna', () => {
    // El mapa es `Record<CategoriaComercio, …>`, así que el compilador ya
    // obliga a decidir el perfil de una categoría nueva. Esto comprueba la
    // otra mitad: que la lista de categorías del backend y la del perfil no se
    // hayan separado.
    expect(Object.keys(PERFIL_CATALOGO).sort()).toEqual([...BUSINESS_CATEGORIES].sort());
  });

  it('`other` hereda el perfil de tienda, no el de restaurante', () => {
    // Es el cajón de quien no se reconoció en los otros cuatro. De los dos
    // extremos, el de inventario hace menos daño: un campo de más es ruido;
    // esconderle el código de barras a una ferretería la deja sin la
    // herramienta por la que vino.
    expect(PERFIL_CATALOGO.other).toEqual(PERFIL_CATALOGO.store);
  });
});

describe('mientras no se sabe la categoría', () => {
  it('se usa el perfil que más enseña, no el que menos', () => {
    // La categoría llega de una petición que puede no haber vuelto. Un campo
    // de más durante un instante es mucho menos grave que esconder el que la
    // persona vino a usar y que no vuelva a aparecer.
    expect(perfilDe(undefined)).toEqual(PERFIL_CATALOGO.store);
    expect(perfilDe(null)).toEqual(PERFIL_CATALOGO.store);
    expect(perfilDe('inventada')).toEqual(PERFIL_CATALOGO.store);
  });

  it('con categoría conocida devuelve la suya', () => {
    expect(perfilDe('restaurant')).toEqual(PERFIL_CATALOGO.restaurant);
    expect(perfilDe('pharmacy')).toEqual(PERFIL_CATALOGO.pharmacy);
  });
});

describe('la PANTALLA usa el perfil, no solo el fichero', () => {
  /**
   * Las pruebas de arriba comprueban los DATOS del perfil. Esta comprueba que
   * la pantalla los obedezca, y hace falta: al romper el arreglo a propósito
   * —devolviendo `<CartaFoto>` al bloque del CSV— las doce pasaron en verde.
   *
   * El defecto original no estaba en qué decía el perfil, estaba en QUÉ
   * CONDICIÓN envolvía al componente. Sin esto, el mismo error vuelve y nada
   * se entera.
   */
  const CATALOGO = readFileSync(
    join(__dirname, '..', '..', '..', 'app', 'negocio', '[token]', 'catalogo', 'page.tsx'),
    'utf8',
  );

  /** La condición que envuelve a `<Componente …>` en el JSX. */
  function guardiaDe(componente: string): string {
    const i = CATALOGO.indexOf(`<${componente} `);
    expect(i, `no se encontró <${componente}> en el catálogo`).toBeGreaterThan(0);
    // Hacia atrás hasta la condición más cercana: `{perfil.loQueSea && (`.
    const antes = CATALOGO.slice(Math.max(0, i - 400), i);
    const m = [...antes.matchAll(/\{perfil\.(\w+)\s*&&/g)].pop();
    return m?.[1] ?? '(ninguna)';
  }

  it('la carta por foto la enseña `cartaPorFoto`, no el CSV ni el inventario', () => {
    expect(guardiaDe('CartaFoto')).toBe('cartaPorFoto');
  });

  it('el CSV masivo lo enseña `csvMasivo`', () => {
    expect(guardiaDe('CsvImport')).toBe('csvMasivo');
  });
});
