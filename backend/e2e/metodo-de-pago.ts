/**
 * E2E del método de pago del viaje.
 *
 * Existe por el fallo que llegó a producción: el campo se añadió al código y la
 * migración que crea la columna no aplicó, así que `prisma.trip.create()`
 * reventaba en la cara del pasajero. Esta prueba corre contra PostgreSQL real,
 * que es el único sitio donde eso se nota.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/metodo-de-pago.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3921, lng: -72.6602 };

async function main(): Promise<void> {
  const { requestClientTrip } = await import('../src/services/client.service');

  const cliente = await prisma.user.create({
    data: { phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`, name: 'e2e-pago' },
  });

  const pedir = (paymentMethod?: string) =>
    requestClientTrip(cliente.id, {
      serviceType: 'taxi',
      originAddress: 'Parque principal',
      destinationAddress: 'Terminal',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      ...(paymentMethod ? { paymentMethod } : {}),
    } as Parameters<typeof requestClientTrip>[1]);

  const guardado = (id: string) =>
    prisma.trip.findUnique({ where: { id }, select: { paymentMethod: true } });

  console.log('\n═══ La columna existe y guarda lo elegido ═══');
  {
    const v = await pedir('transferencia');
    comprobar('el viaje se crea sin reventar', Boolean(v.id));
    const g = await guardado(v.id);
    comprobar('se guarda "transferencia"', g?.paymentMethod === 'transferencia', String(g?.paymentMethod));
    comprobar(
      'y viaja en el DTO que ve el cliente',
      (v as { paymentMethod?: string }).paymentMethod === 'transferencia',
      String((v as { paymentMethod?: string }).paymentMethod),
    );
  }

  console.log('\n═══ Lo que manda el teléfono no se guarda a ciegas ═══');
  {
    const v = await pedir('bitcoin-en-efectivo');
    const g = await guardado(v.id);
    comprobar(
      'un método inventado se descarta',
      g?.paymentMethod === null,
      `se guardó ${g?.paymentMethod}`,
    );
  }
  {
    const v = await pedir('EFECTIVO');
    const g = await guardado(v.id);
    comprobar('acepta mayúsculas y las normaliza', g?.paymentMethod === 'efectivo', String(g?.paymentMethod));
  }

  console.log('\n═══ Una app vieja, sin el campo, sigue funcionando ═══');
  {
    const v = await pedir();
    const g = await guardado(v.id);
    comprobar('el viaje se crea igual', Boolean(v.id));
    comprobar('y queda sin método (= efectivo)', g?.paymentMethod === null, String(g?.paymentMethod));
  }

  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(`\n${fallos === 0 ? '✅ Todo en verde' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
