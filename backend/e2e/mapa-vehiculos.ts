/**
 * E2E del mapa del cliente: ¿ve los vehículos conectados que tiene alrededor?
 *
 * Es lo que se enseña en una demo y lo que la gente compara contra las otras
 * plataformas, así que conviene que esté probado y no supuesto.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/mapa-vehiculos.ts
 */
import { prisma } from '../src/lib/prisma';
import { getNearbyDriverPositions } from '../src/services/matching.service';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

/** Coloca al conductor en el mapa (columna PostGIS, como el latido real). */
async function ubicar(driverId: string, lat: number, lng: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        "lastSeenAt" = now(), "lastLat" = ${lat}, "lastLng" = ${lng}
    WHERE "id" = ${driverId}`;
}

async function crearConductor(
  nombre: string,
  opts: { verificado?: boolean; enLinea?: boolean; tipo?: 'MOTO' | 'PARTICULAR' } = {},
): Promise<string> {
  const d = await prisma.driver.create({
    data: {
      phone: `+5739${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: nombre,
      status: opts.enLinea === false ? 'OFFLINE' : 'ONLINE',
      isVerified: opts.verificado ?? true,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: d.id, type: opts.tipo ?? 'PARTICULAR', isActive: true,
      plate: `X${Math.floor(100 + Math.random() * 899)}`,
      brand: 'Marca', model: 'Modelo', year: 2020, color: 'Blanco',
    },
  });
  return d.id;
}

async function main(): Promise<void> {
  console.log('\n═══ Mapa del cliente: vehículos conectados alrededor ═══\n');

  // Una plaza cualquiera FUERA del centro de Pamplona (unos 40 km), para que
  // el radio de 5 km alrededor del obelisco no la alcance.
  const OTRA_CIUDAD = { lat: 7.7500, lng: -72.9000 };

  const cerca1 = await crearConductor('Cerca carro', { tipo: 'PARTICULAR' });
  const cerca2 = await crearConductor('Cerca moto', { tipo: 'MOTO' });
  await ubicar(cerca1, OTRA_CIUDAD.lat + 0.002, OTRA_CIUDAD.lng);
  await ubicar(cerca2, OTRA_CIUDAD.lat, OTRA_CIUDAD.lng + 0.002);

  console.log('1. El cliente está lejos del centro de Pamplona');
  const alrededor = await getNearbyDriverPositions(OTRA_CIUDAD.lat, OTRA_CIUDAD.lng);
  comprobar(
    've los vehículos que tiene al lado',
    alrededor.length >= 2,
    `vio ${alrededor.length} (buscando en su propia ubicación)`,
  );

  const enElObelisco = await getNearbyDriverPositions(7.3754, -72.6486);
  comprobar(
    'y NO los vería buscando en el obelisco (por eso importa el centro)',
    enElObelisco.length === 0,
    `vio ${enElObelisco.length} desde el obelisco`,
  );

  console.log('\n2. Cada vehículo trae lo que el mapa necesita');
  const uno = alrededor[0];
  comprobar('id opaco para poder deslizarlo entre refrescos', !!uno?.id, 'sin id');
  comprobar('id que NO es el id real del conductor',
    uno?.id !== cerca1 && uno?.id !== cerca2, 'expone el id real');
  comprobar('tipo de vehículo para el ícono correcto', !!uno?.vehicleType, 'sin tipo');
  const tipos = alrededor.map((d) => d.vehicleType).sort();
  comprobar('distingue moto de carro', tipos.includes('MOTO') && tipos.includes('PARTICULAR'),
    `tipos: ${tipos.join(',')}`);

  console.log('\n3. Quién NO debe salir');
  const desconectado = await crearConductor('Desconectado', { enLinea: false });
  await ubicar(desconectado, OTRA_CIUDAD.lat, OTRA_CIUDAD.lng);
  const viejo = await crearConductor('Sin señal hace rato');
  await ubicar(viejo, OTRA_CIUDAD.lat, OTRA_CIUDAD.lng);
  await prisma.$executeRaw`
    UPDATE "drivers" SET "lastSeenAt" = now() - INTERVAL '10 minutes' WHERE "id" = ${viejo}`;

  const tras = await getNearbyDriverPositions(OTRA_CIUDAD.lat, OTRA_CIUDAD.lng);
  comprobar('el desconectado no aparece', tras.length === 2, `salieron ${tras.length}`);
  comprobar('el que lleva 10 min sin reportar tampoco', tras.length === 2,
    'un conductor sin señal fresca seguiría pintado donde ya no está');

  console.log('\n4. El id opaco es estable dentro del día');
  const otraVez = await getNearbyDriverPositions(OTRA_CIUDAD.lat, OTRA_CIUDAD.lng);
  const ids1 = alrededor.map((d) => d.id).sort().join(',');
  const ids2 = otraVez.filter((d) => ids1.includes(d.id)).map((d) => d.id).sort().join(',');
  comprobar('el mismo vehículo conserva su id entre dos consultas', ids1 === ids2,
    'sin id estable no se puede animar el deslizamiento');

  console.log(`\n${fallos === 0 ? '✓ TODO EN VERDE' : `✗ ${fallos} FALLIDAS`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('ERROR:', e);
  await prisma.$disconnect();
  process.exit(1);
});
