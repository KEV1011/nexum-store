/**
 * E2E de la zona de marca.
 *
 * En Pamplona la app se presenta como «ZIPA/SANTURBÁN». Lo que hay que
 * demostrar no es que la cadena se concatene —eso ya lo fijan las pruebas
 * unitarias— sino que el municipio se resuelva bien desde unas coordenadas
 * reales y, sobre todo, que NO se le atribuya una zona a quien no le
 * corresponde: eso saldría en la primera pantalla de la app diciéndole a
 * alguien de Bogotá que está en Santurbán.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/zona-de-marca.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

// Puntos reales.
const PARQUE_PAMPLONA = { lat: 7.3754, lng: -72.6486 };
const CUCUTA = { lat: 7.8891, lng: -72.4967 };
const BOGOTA = { lat: 4.7110, lng: -74.0721 };
// Selva amazónica, a cientos de kilómetros del municipio más cercano de la
// tabla. En tierra firme, que es el caso realista de "fuera de cobertura".
const AMAZONIA = { lat: -1.5, lng: -71.5 };
const MITAD_DEL_ATLANTICO = { lat: 20.0, lng: -40.0 };

async function main(): Promise<void> {
  const { zonaDeCoordenadas, invalidarCacheMunicipios } =
    await import('../src/services/municipality.service');

  const cuantos = await prisma.municipality.count({ where: { isActive: true } });
  comprobar('la tabla de municipios está sembrada', cuantos > 0, `${cuantos} filas`);

  const pam = await prisma.municipality.findUnique({ where: { slug: 'pamplona' } });
  comprobar('Pamplona tiene su zona en la base', pam?.zone === 'Santurbán',
    String(pam?.zone));

  console.log('\n═══ En Pamplona la marca lleva su zona ═══');
  {
    const z = await zonaDeCoordenadas(PARQUE_PAMPLONA.lat, PARQUE_PAMPLONA.lng);
    comprobar('resuelve el municipio', z.municipio === 'Pamplona', String(z.municipio));
    comprobar('con su departamento', (z.departamento ?? '').length > 0, String(z.departamento));
    comprobar('la etiqueta es ZIPA/SANTURBÁN', z.etiqueta === 'ZIPA/SANTURBÁN', z.etiqueta);
  }

  console.log('\n═══ Donde no hay zona, la marca va sola ═══');
  {
    // Cúcuta existe en la tabla pero no tiene zona asignada: tiene que decir
    // «ZIPA», no inventarse una ni dejar «ZIPA/».
    const z = await zonaDeCoordenadas(CUCUTA.lat, CUCUTA.lng);
    comprobar('resuelve el municipio igualmente', z.municipio != null, String(z.municipio));
    comprobar('sin zona configurada', z.zona === null, String(z.zona));
    comprobar('y la etiqueta es solo ZIPA', z.etiqueta === 'ZIPA', z.etiqueta);
  }

  console.log('\n═══ Otra ciudad de la tabla resuelve la suya, no la de Pamplona ═══');
  {
    // Bogotá SÍ está en la tabla (viene del intermunicipal), así que lo correcto
    // es que se resuelva como Bogotá. Lo que nunca puede pasar es que herede la
    // zona de Pamplona por ser el centroide menos lejano — ese sería el fallo
    // que más daño haría, y saldría en la primera pantalla de la app.
    const z = await zonaDeCoordenadas(BOGOTA.lat, BOGOTA.lng);
    comprobar('resuelve Bogotá', z.municipio === 'Bogotá', String(z.municipio));
    comprobar('sin heredar la zona de Pamplona', z.zona === null, String(z.zona));
    comprobar('la etiqueta cae a ZIPA', z.etiqueta === 'ZIPA', z.etiqueta);
  }

  console.log('\n═══ Lejos de TODO municipio NO se afirma nada ═══');
  {
    const selva = await zonaDeCoordenadas(AMAZONIA.lat, AMAZONIA.lng);
    comprobar('en la selva no se atribuye municipio', selva.municipio === null,
      String(selva.municipio));
    comprobar('y la etiqueta cae a ZIPA', selva.etiqueta === 'ZIPA', selva.etiqueta);

    const mar = await zonaDeCoordenadas(MITAD_DEL_ATLANTICO.lat, MITAD_DEL_ATLANTICO.lng);
    comprobar('en medio del océano tampoco', mar.municipio === null, String(mar.municipio));
  }

  console.log('\n═══ Coordenadas imposibles no revientan ═══');
  {
    const nan = await zonaDeCoordenadas(Number.NaN, Number.NaN);
    comprobar('NaN devuelve la marca a secas', nan.etiqueta === 'ZIPA', nan.etiqueta);
  }

  console.log('\n═══ Añadir una zona es una fila, no un despliegue ═══');
  {
    // Es la promesa del diseño: ZIPA crecerá a otras ciudades y ninguna debería
    // exigir tocar código. Se comprueba de verdad, y se deja como estaba.
    const antes = await prisma.municipality.findUnique({ where: { slug: 'cucuta' } });
    if (antes) {
      await prisma.municipality.update({
        where: { slug: 'cucuta' },
        data: { zone: 'Frontera' },
      });
      invalidarCacheMunicipios();
      const z = await zonaDeCoordenadas(CUCUTA.lat, CUCUTA.lng);
      comprobar('la zona nueva se refleja sin tocar código',
        z.etiqueta === 'ZIPA/FRONTERA', z.etiqueta);

      await prisma.municipality.update({
        where: { slug: 'cucuta' },
        data: { zone: antes.zone },
      });
      invalidarCacheMunicipios();
    } else {
      comprobar('Cúcuta está en la tabla', false, 'no encontrada');
    }
  }

  console.log(`\n${fallos === 0 ? '✅ La zona sale donde toca y en ningún otro sitio' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
