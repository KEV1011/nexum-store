/**
 * E2E del cupón aplicado a un VIAJE.
 *
 * Hasta ahora los cupones solo funcionaban en el carrito de comida, aunque el
 * servicio de promociones ya aceptaba el contexto 'trip'. Esta prueba corre
 * contra PostgreSQL real porque hay columnas nuevas y porque lo que hay que
 * demostrar es aritmética sobre datos guardados.
 *
 * Lo que vigila, por orden de importancia:
 *
 *  1. **La liquidación del conductor no cambia.** El descuento es publicidad
 *     nuestra. Si saliera de su bolsillo, estaríamos regalando plata ajena.
 *  2. El monto lo decide el SERVIDOR: un teléfono no puede pedir su propio
 *     descuento.
 *  3. Un cupón inválido no deja al pasajero sin taxi.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/cupon-en-viaje.ts
 */
import { PromoScope, PromoType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3921, lng: -72.6602 };

async function main(): Promise<void> {
  const { requestClientTrip, updateClientTripStatus } = await import(
    '../src/services/client.service'
  );

  const sufijo = Date.now().toString().slice(-6);
  const cliente = await prisma.user.create({
    data: { phone: `+5730${Math.floor(10000000 + Math.random() * 89999999)}`, name: 'e2e-cupon' },
  });

  const CODIGO = `E2E-${sufijo}`;
  await prisma.promoCode.create({
    data: {
      code: CODIGO,
      description: 'Prueba E2E',
      type: PromoType.FIXED,
      value: 3000,
      scope: PromoScope.ALL,
      active: true,
      minAmount: 0,
    },
  });

  const pedir = (promoCode?: string) =>
    requestClientTrip(cliente.id, {
      serviceType: 'taxi',
      originAddress: 'Parque principal',
      destinationAddress: 'Terminal',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      ...(promoCode ? { promoCode } : {}),
    } as Parameters<typeof requestClientTrip>[1]);

  console.log('\n═══ El cupón se sella en el viaje ═══');
  let conCupon: string;
  {
    const v = await pedir(CODIGO);
    conCupon = v.id;
    const g = await prisma.trip.findUnique({
      where: { id: v.id },
      select: { promoCode: true, promoDiscount: true, estimatedFare: true },
    });
    comprobar('se guarda el código', g?.promoCode === CODIGO, String(g?.promoCode));
    comprobar('se guarda el MONTO, no el porcentaje', g?.promoDiscount === 3000, String(g?.promoDiscount));
    comprobar(
      'la tarifa guardada NO baja: es lo que gana el conductor',
      (g?.estimatedFare ?? 0) > 0 && g?.estimatedFare === v.estimatedFare,
      `${g?.estimatedFare} vs ${v.estimatedFare}`,
    );
    comprobar(
      'el DTO dice lo que paga el pasajero',
      v.totalPasajero === Math.round(v.estimatedFare) - 3000,
      `${v.totalPasajero} (tarifa ${v.estimatedFare})`,
    );
    comprobar('queda constancia del canje',
      (await prisma.promoRedemption.count({ where: { userId: cliente.id } })) === 1);
  }

  console.log('\n═══ El teléfono NO decide cuánto se descuenta ═══');
  {
    // Cupón aparte: el de arriba ya se canjeó, y son de un uso por persona.
    const OTRO = `E2X-${sufijo}`;
    await prisma.promoCode.create({
      data: {
        code: OTRO, description: 'Prueba E2E 2', type: PromoType.FIXED,
        value: 3000, scope: PromoScope.ALL, active: true, minAmount: 0,
      },
    });
    // Se manda un descuento inventado junto al código. Debe ignorarse por
    // completo: el monto sale del canje contra la tarifa que midió el servidor.
    const v = await requestClientTrip(cliente.id, {
      serviceType: 'taxi',
      originAddress: 'Parque principal',
      destinationAddress: 'Terminal',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      promoCode: OTRO,
      promoDiscount: 19000,
      totalPasajero: 1,
    } as unknown as Parameters<typeof requestClientTrip>[1]);
    const g = await prisma.trip.findUnique({
      where: { id: v.id }, select: { promoDiscount: true },
    });
    comprobar(
      'el descuento que manda la app se descarta',
      g?.promoDiscount === 3000,
      `se guardó ${g?.promoDiscount}`,
    );
  }

  console.log('\n═══ Un cupón inválido no deja a nadie sin taxi ═══');
  {
    const v = await pedir('NO-EXISTE-123');
    const g = await prisma.trip.findUnique({
      where: { id: v.id }, select: { promoCode: true, promoDiscount: true },
    });
    comprobar('el viaje se crea igual', Boolean(v.id));
    comprobar('sin cupón sellado', g?.promoCode === null && g?.promoDiscount === null);
    comprobar(
      'y se dice por qué, en vez de cobrar de más en silencio',
      Boolean((v as { promoError?: string }).promoError),
      String((v as { promoError?: string }).promoError),
    );
  }

  console.log('\n═══ LA LIQUIDACIÓN DEL CONDUCTOR NO CAMBIA ═══');
  {
    // La comprobación que sostiene todo el diseño. Se liquidan dos viajes
    // idénticos —mismo origen, mismo destino, mismo servicio— uno con cupón y
    // otro sin él, y el conductor tiene que cobrar exactamente lo mismo.
    const sinCupon = await pedir();

    const conductor = await prisma.driver.create({
      data: {
        phone: `+5731${Math.floor(10000000 + Math.random() * 89999999)}`,
        name: 'e2e-conductor-cupon',
        isVerified: true,
      },
    });

    for (const id of [conCupon, sinCupon.id]) {
      await prisma.trip.update({
        where: { id },
        data: { driverId: conductor.id, status: 'IN_PROGRESS' },
      });
      await updateClientTripStatus(id, 'completed');
    }

    const [a, b] = await Promise.all([
      prisma.trip.findUnique({
        where: { id: conCupon },
        select: { finalFare: true, netEarning: true, commission: true, promoDiscount: true },
      }),
      prisma.trip.findUnique({
        where: { id: sinCupon.id },
        select: { finalFare: true, netEarning: true, commission: true, promoDiscount: true },
      }),
    ]);

    comprobar('el del cupón lo conserva tras liquidar', a?.promoDiscount === 3000, String(a?.promoDiscount));
    comprobar('el otro no tiene descuento', b?.promoDiscount === null);
    comprobar(
      'MISMO neto para el conductor',
      a?.netEarning === b?.netEarning && (a?.netEarning ?? 0) > 0,
      `con cupón ${a?.netEarning} vs sin cupón ${b?.netEarning}`,
    );
    comprobar(
      'MISMA tarifa final',
      a?.finalFare === b?.finalFare,
      `${a?.finalFare} vs ${b?.finalFare}`,
    );
    comprobar(
      'MISMA comisión sellada',
      a?.commission === b?.commission,
      `${a?.commission} vs ${b?.commission}`,
    );

    await prisma.driverEarning.deleteMany({ where: { driverId: conductor.id } });
    await prisma.trip.updateMany({ where: { driverId: conductor.id }, data: { driverId: null } });
    await prisma.driver.delete({ where: { id: conductor.id } });
  }

  await prisma.promoRedemption.deleteMany({ where: { userId: cliente.id } });
  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
  await prisma.promoCode.deleteMany({ where: { code: { in: [CODIGO, `E2X-${sufijo}`] } } });
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
