/**
 * E2E de los elogios al conductor.
 *
 * Lo que vigila, en orden de gravedad:
 *
 *  1. **Un elogio inventado por el teléfono no llega al perfil de nadie.** Es
 *     tan grave como una verificación falsa: son ambas cosas que el pasajero
 *     lee para decidir si se sube a un carro.
 *  2. El conteo se RECALCULA de los viajes, nunca se suma encima de un
 *     contador — un acumulado y unas filas acaban discrepando.
 *  3. Corregir la calificación corrige también los elogios: se reemplazan, no
 *     se acumulan.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/elogios.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+573${p}${Math.floor(1000000 + Math.random() * 8999999)}`;

async function main(): Promise<void> {
  const { rateClientTrip } = await import('../src/services/client.service');
  const { getDriverPublicProfile } = await import(
    '../src/services/driver-profile.service'
  );

  const conductor = await prisma.driver.create({
    data: { phone: tel('1'), name: 'Nelson Elogios' },
  });
  const pasajero = await prisma.user.create({
    data: { phone: tel('0'), name: 'Pasajera' },
  });

  let n = 0;
  const crearViaje = () =>
    prisma.trip.create({
      data: {
        requestRef: `E2E-EL-${Date.now()}-${n++}`,
        passengerId: pasajero.id,
        driverId: conductor.id,
        serviceType: 'TAXI',
        status: 'COMPLETED',
        originAddress: 'A', destAddress: 'B',
        originLat: 7.3754, originLng: -72.6486,
        destLat: 7.3921, destLng: -72.6602,
        estimatedFare: 10000,
      },
    });

  const elogiosDe = async () =>
    (await getDriverPublicProfile(conductor.id))!.elogios ?? [];

  console.log('\n═══ Se guardan los elogios del catálogo ═══');
  {
    const v = await crearViaje();
    const r = await rateClientTrip(pasajero.id, v.id, 5, null, ['puntual', 'carro_limpio']);
    comprobar('la respuesta devuelve los guardados',
      JSON.stringify(r.ratingTags?.sort()) === JSON.stringify(['carro_limpio', 'puntual']),
      JSON.stringify(r.ratingTags));

    const e = await elogiosDe();
    comprobar('aparecen en el perfil', e.length === 2, JSON.stringify(e));
    comprobar('con su etiqueta en español',
      e.some((x) => x.etiqueta === 'Puntual'), JSON.stringify(e.map((x) => x.etiqueta)));
    comprobar('y contados una vez', e.every((x) => x.veces === 1));
  }

  console.log('\n═══ UN ELOGIO INVENTADO NO LLEGA AL PERFIL ═══');
  {
    const v = await crearViaje();
    await rateClientTrip(pasajero.id, v.id, 5, null, ['maneja_volando', 'puntual']);
    const guardado = await prisma.trip.findUnique({
      where: { id: v.id }, select: { ratingTags: true },
    });
    comprobar('solo se sella el válido',
      JSON.stringify(guardado?.ratingTags) === JSON.stringify(['puntual']),
      JSON.stringify(guardado?.ratingTags));
    const e = await elogiosDe();
    comprobar('el inventado no aparece en ninguna parte',
      !e.some((x) => x.clave === 'maneja_volando'), JSON.stringify(e));
  }

  console.log('\n═══ El tope no se puede saltar desde el teléfono ═══');
  {
    const v = await crearViaje();
    const r = await rateClientTrip(pasajero.id, v.id, 5, null, [
      'puntual', 'carro_limpio', 'amable', 'buena_musica', 'conduccion_segura',
    ]);
    comprobar('se guardan como máximo tres', (r.ratingTags ?? []).length === 3,
      String((r.ratingTags ?? []).length));
  }

  console.log('\n═══ El conteo se recalcula de los viajes ═══');
  {
    const e = await elogiosDe();
    const puntual = e.find((x) => x.clave === 'puntual');
    // Tres viajes calificados, los tres con «puntual».
    comprobar('«Puntual» va en 3', puntual?.veces === 3, JSON.stringify(puntual));
    comprobar('ordenado de más a menos',
      e.every((x, i) => i === 0 || e[i - 1]!.veces >= x.veces), JSON.stringify(e));
    comprobar('no salen los que nadie marcó',
      !e.some((x) => x.clave === 'buena_conversacion'), JSON.stringify(e));
  }

  console.log('\n═══ Corregir la calificación corrige los elogios ═══');
  {
    const v = await crearViaje();
    await rateClientTrip(pasajero.id, v.id, 5, null, ['amable']);
    const antes = (await elogiosDe()).find((x) => x.clave === 'amable')?.veces;
    // Se vuelve a calificar el MISMO viaje con otro elogio: debe reemplazar,
    // no sumarse. Si se acumulara, quien toca dos veces inflaría el perfil.
    await rateClientTrip(pasajero.id, v.id, 4, null, ['buena_musica']);
    const despues = await elogiosDe();
    comprobar('el anterior baja', (despues.find((x) => x.clave === 'amable')?.veces ?? 0) === (antes ?? 0) - 1);
    comprobar('el nuevo entra', despues.some((x) => x.clave === 'buena_musica'));
  }

  console.log('\n═══ Una calificación sin elogios no rompe nada ═══');
  {
    const v = await crearViaje();
    const r = await rateClientTrip(pasajero.id, v.id, 5, 'Todo bien');
    comprobar('se guarda null, no un array vacío', r.ratingTags === null, JSON.stringify(r.ratingTags));
    const g = await prisma.trip.findUnique({ where: { id: v.id }, select: { ratingTags: true } });
    comprobar('y en la base tampoco queda basura', g?.ratingTags === null, JSON.stringify(g?.ratingTags));
  }

  await prisma.trip.deleteMany({ where: { driverId: conductor.id } });
  await prisma.driver.delete({ where: { id: conductor.id } });
  await prisma.user.delete({ where: { id: pasajero.id } });

  console.log(`\n${fallos === 0 ? '✅ Todo en verde' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
