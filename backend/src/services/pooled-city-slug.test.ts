import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * La ciudad de un viaje intermunicipal se guarda como SLUG del municipio.
 *
 * Esto existe porque ya falló una vez, en silencio y en producción. La tanda de
 * municipios pasó `pooled_trips.origin` de enum a TEXT en minúscula y arregló
 * `intercity.service`, pero se saltó `intercity-pool.service` — el de las
 * salidas programadas en bus —, que siguió escribiendo con un mapa de los siete
 * valores viejos y `?? toUpperCase()` de respaldo.
 *
 * Nada lo delataba: el servicio publicaba y buscaba con el MISMO mapa, así que
 * entre sí eran coherentes y las pruebas pasaban. Lo que se perdía eran las
 * salidas escritas antes de la migración, que habían quedado en minúscula y
 * dejaron de aparecerle al pasajero. En PostgreSQL 'pamplona' <> 'PAMPLONA'.
 *
 * Por eso la regla se vigila sobre el FUENTE: el error no está en un valor de
 * salida que se pueda comprobar con una llamada, sino en cómo se escribe en la
 * base, y solo se ve cruzando dos filas guardadas en momentos distintos.
 */
const SERVICIOS = ['intercity.service.ts', 'intercity-pool.service.ts'] as const;

function fuente(nombre: string): string {
  return readFileSync(join(__dirname, nombre), 'utf8');
}

describe('la ciudad del intermunicipal se guarda como slug', () => {
  it.each(SERVICIOS)('%s no pasa ninguna ciudad a mayúsculas', (nombre) => {
    const src = fuente(nombre);
    // Cualquier toUpperCase() sobre algo que se llame origin/destination/city
    // es el patrón exacto que rompió: escribe 'PAMPLONA' donde va 'pamplona'.
    const sospechosas = src
      .split('\n')
      .map((linea, i) => ({ linea: linea.trim(), n: i + 1 }))
      .filter(({ linea }) => /(origin|destination|city|ciudad)\w*\.toUpperCase\(\)/i.test(linea));

    expect(
      sospechosas,
      `${nombre} convierte una ciudad a mayúsculas; la columna guarda el slug en minúscula`,
    ).toEqual([]);
  });

  it.each(SERVICIOS)('%s no reintroduce el mapa de los siete municipios', (nombre) => {
    const src = fuente(nombre);
    // El mapa hacia la base (slug → valor guardado) no puede volver a ser una
    // tabla cerrada: con 45 municipios, los que no estén en ella se escriben
    // distinto y desaparecen de la búsqueda sin un solo error en los registros.
    const mapaEstatico = /const CITY_TO_PRISMA[^=]*=\s*\{/.test(src);
    expect(
      mapaEstatico,
      `${nombre} volvió a declarar CITY_TO_PRISMA como objeto literal; debe resolver el slug tal cual`,
    ).toBe(false);
  });

  it('la migración de municipios dejó las columnas en minúscula', () => {
    const sql = readFileSync(
      join(__dirname, '..', '..', 'prisma', 'migrations', '20260801200000_municipalities', 'migration.sql'),
      'utf8',
    );
    // Si esto cambiara, la premisa de todo lo anterior deja de ser cierta.
    expect(sql).toContain('"pooled_trips" ALTER COLUMN "origin" TYPE TEXT USING lower');
  });
});
