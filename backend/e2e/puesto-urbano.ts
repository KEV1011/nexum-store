/**
 * El puesto de taxi urbano, contra PostgreSQL real.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   • Que la salida urbana NO se cuele en la búsqueda intermunicipal. Esa
 *     búsqueda abre sin filtro de ciudad —se cambió en la tanda anterior para
 *     que el pasajero vea la oferta antes de elegir destino—, así que las dos
 *     viven en la misma tabla y solo las separa un `where`. Una prueba unitaria
 *     no toca ese `where`.
 *
 *   • Que cerrar el viaje deje rastro en la billetera. Son tres saltos
 *     —`completePooledTrip` → `comisionPara` → `driver_earnings`— y el defecto
 *     que esto evita es que el único servicio que no liquidaba nada fuera
 *     justo el que se construyó para cobrar comisión.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/puesto-urbano.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  buscarPuestosUrbanos,
  completePooledTrip,
  departPooledTrip,
  publicarPuestoUrbano,
  publishPooledTrip,
  searchPooledTrips,
  topeDelPuestoUrbano,
  bookSeats,
  PooledTripError,
} from '../src/services/intercity-pool.service';
import { getDriverBalance } from '../src/services/payout.service';
import { tablaTarifas } from '../src/lib/tarifa-categoria';
import { topePorPuesto } from '../src/lib/puesto-urbano';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

/** Ejecuta algo que debe fallar y devuelve el mensaje. */
async function motivoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);
const enHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function main() {
  const marca = `e2epuesto-${Date.now()}`;

  // Dos municipios: el de la ruta y uno vecino, para probar que el puesto de
  // una ciudad no le sale al pasajero de la otra.
  await prisma.municipality.upsert({
    where: { slug: 'pamplona' },
    create: { slug: 'pamplona', name: 'Pamplona', department: 'Norte de Santander', lat: 7.3754, lng: -72.6486 },
    update: {},
  });
  await prisma.municipality.upsert({
    where: { slug: 'cucuta' },
    create: { slug: 'cucuta', name: 'Cúcuta', department: 'Norte de Santander', lat: 7.8891, lng: -72.4967 },
    update: {},
  });

  const taxista = await prisma.driver.create({
    data: { name: `${marca} Taxista`, phone: `+5730044${sufijo()}`, isVerified: true, status: 'ONLINE' },
  });
  const pasajero1 = await prisma.user.create({
    data: { name: `${marca} Uno`, phone: `+5730055${sufijo()}` },
  });
  const pasajero2 = await prisma.user.create({
    data: { name: `${marca} Dos`, phone: `+5730056${sufijo()}` },
  });

  const minimoTaxi = tablaTarifas().TAXI.minimo;

  console.log('\n[1] El tope sale de la carrera sola, no de la nada');
  {
    const tope = await topeDelPuestoUrbano({
      ciudad: 'pamplona',
      origenTexto: 'Terminal de transportes',
      destinoTexto: 'Universidad de Pamplona',
      puestos: 4,
    });
    // Sin GOOGLE_MAPS_API_KEY no se puede medir: se cae a la carrera mínima
    // del decreto, que es el piso real y por tanto el tope MÁS estricto.
    check(tope.tarifaSolo >= minimoTaxi, 'la carrera de referencia nunca baja de la mínima', tope.tarifaSolo);
    check(
      tope.topePorPuesto === topePorPuesto(tope.tarifaSolo, 4),
      'el tope por puesto es el de la regla pura',
      { api: tope.topePorPuesto, regla: topePorPuesto(tope.tarifaSolo, 4) },
    );
    check(tope.sugerido <= tope.topePorPuesto, 'lo sugerido nunca pasa del tope', tope);
    check(
      tope.topePorPuesto < tope.tarifaSolo,
      'un puesto siempre cuesta menos que la carrera entera',
      { puesto: tope.topePorPuesto, sola: tope.tarifaSolo },
    );
  }

  const topeReal = topePorPuesto(minimoTaxi, 4);
  const precioPuesto = Math.min(2000, topeReal);

  console.log('\n[2] Se publica el caso real: cuatro puestos Terminal → Universidad');
  let salidaId = '';
  {
    const salida = await publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
      city: 'pamplona',
      originLabel: 'Terminal de transportes',
      destLabel: 'Universidad de Pamplona',
      departureTime: enHoras(2),
      totalSeats: 4,
      farePerSeat: precioPuesto,
      vehicleDescription: 'Chevrolet Spark Amarillo • TAX 123',
    });
    salidaId = salida.id;
    check(salida.kind === 'urbano', 'queda marcada como urbana', salida.kind);
    check(salida.tripRef.startsWith('NXU-'), 'con su propio consecutivo', salida.tripRef);
    check(salida.routeName === 'Terminal de transportes → Universidad de Pamplona', 'con nombre de ruta armado', salida.routeName);
    check(salida.origin === 'pamplona' && salida.destination === 'pamplona', 'las dos puntas son la misma ciudad');
    check(salida.soloFareRef === minimoTaxi, 'la carrera sola queda SELLADA en la salida', salida.soloFareRef);
    check(
      salida.savingsPerSeat === minimoTaxi - precioPuesto,
      'y el ahorro del pasajero viene ya calculado',
      salida.savingsPerSeat,
    );
    check(salida.maxFarePerSeat === topeReal, 'el tope aplicado queda guardado', salida.maxFarePerSeat);
    check(salida.availableSeats === 4, 'con sus cuatro puestos libres');
  }

  console.log('\n[3] Los tres rechazos');
  {
    const caro = await motivoDe(() =>
      publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
        city: 'pamplona', originLabel: 'Terminal', destLabel: 'Universidad',
        departureTime: enHoras(3), totalSeats: 4, farePerSeat: minimoTaxi,
        vehicleDescription: 'Spark • TAX 123',
      }),
    );
    check(caro.includes('no puede pasar de'), 'el puesto por encima del tope se rechaza DICIENDO el número', caro);

    const uno = await motivoDe(() =>
      publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
        city: 'pamplona', originLabel: 'Terminal', destLabel: 'Universidad',
        departureTime: enHoras(3), totalSeats: 1, farePerSeat: 2000,
        vehicleDescription: 'Spark • TAX 123',
      }),
    );
    check(uno.includes('al menos 2'), 'un solo puesto se rechaza: eso es una carrera', uno);

    const muchos = await motivoDe(() =>
      publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
        city: 'pamplona', originLabel: 'Terminal', destLabel: 'Universidad',
        departureTime: enHoras(3), totalSeats: 8, farePerSeat: 1000,
        vehicleDescription: 'Spark • TAX 123',
      }),
    );
    check(muchos.includes('habilitada'), 'más de cuatro exige empresa de transporte', muchos);

    const inventada = await motivoDe(() =>
      publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
        city: 'ciudad-que-no-existe', originLabel: 'A', destLabel: 'B',
        departureTime: enHoras(3), totalSeats: 3, farePerSeat: 1000,
        vehicleDescription: 'Spark • TAX 123',
      }),
    );
    check(inventada.includes('municipios'), 'una ciudad inventada se rechaza', inventada);

    const pasada = await motivoDe(() =>
      publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
        city: 'pamplona', originLabel: 'Terminal', destLabel: 'Universidad',
        departureTime: enHoras(-1), totalSeats: 3, farePerSeat: 1000,
        vehicleDescription: 'Spark • TAX 123',
      }),
    );
    check(pasada.includes('futuro'), 'una salida que ya pasó se rechaza', pasada);
  }

  console.log('\n[4] LA GUARDA: el puesto urbano no se cuela en la búsqueda intermunicipal');
  {
    // Una salida intermunicipal de verdad, para comprobar que la búsqueda SÍ
    // funciona: sin esto, la comprobación pasaría también con la búsqueda rota.
    const inter = await publishPooledTrip(taxista.id, taxista.name, taxista.phone, {
      origin: 'pamplona', destination: 'cucuta',
      departureTime: enHoras(4), totalSeats: 4, farePerSeat: 20000,
      vehicleDescription: 'Spark • TAX 123',
    });

    const sinFiltro = await searchPooledTrips({});
    const ids = sinFiltro.map((t) => t.id);
    check(ids.includes(inter.id), 'la intermunicipal SÍ sale en «ver todas las salidas»');
    check(
      !ids.includes(salidaId),
      'y el puesto urbano NO: una ruta Terminal→Universidad no es alternativa para quien va a Cúcuta',
    );
    check(
      sinFiltro.every((t) => t.kind !== 'urbano'),
      'ninguna de las que salen es urbana',
    );

    await prisma.pooledTrip.delete({ where: { id: inter.id } });
  }

  console.log('\n[5] El pasajero de la ciudad sí lo ve — y el de la otra no');
  {
    const enPamplona = await buscarPuestosUrbanos({ ciudad: 'pamplona' });
    check(enPamplona.some((t) => t.id === salidaId), 'aparece en su ciudad');

    const enCucuta = await buscarPuestosUrbanos({ ciudad: 'cucuta' });
    check(!enCucuta.some((t) => t.id === salidaId), 'no aparece en otra ciudad');

    const sinCiudad = await buscarPuestosUrbanos({ ciudad: '' });
    check(sinCiudad.length === 0, 'sin ciudad no se devuelve nada: un puesto de otra ciudad no sirve');

    // Ventana de horas: una salida de mañana no es una alternativa para
    // moverse ahora, y mezclarla convierte la lista en ruido.
    const manana = await publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
      city: 'pamplona', originLabel: 'Parque principal', destLabel: 'Hospital',
      departureTime: enHoras(20), totalSeats: 3, farePerSeat: 1500,
      vehicleDescription: 'Spark • TAX 123',
    });
    const proximas = await buscarPuestosUrbanos({ ciudad: 'pamplona', horas: 6 });
    check(!proximas.some((t) => t.id === manana.id), 'la de dentro de veinte horas no sale en la ventana de seis');
    const amplia = await buscarPuestosUrbanos({ ciudad: 'pamplona', horas: 24 });
    check(amplia.some((t) => t.id === manana.id), 'y sí sale ampliando la ventana');
    await prisma.pooledTrip.delete({ where: { id: manana.id } });
  }

  console.log('\n[6] Se venden dos puestos');
  {
    const r1 = await bookSeats(pasajero1.id, 'Uno', pasajero1.phone, salidaId, {
      seatsBooked: 1, pickupAddress: 'Calle 6 # 4-20',
    });
    check(r1.trip.availableSeats === 3, 'queda un puesto menos', r1.trip.availableSeats);
    check(r1.booking.fareTotal === precioPuesto, 'con el precio sellado en la reserva', r1.booking.fareTotal);
    check(r1.booking.pickupAddress === 'Calle 6 # 4-20', 'y con dónde recogerlo: el taxi pasa por su casa');

    const r2 = await bookSeats(pasajero2.id, 'Dos', pasajero2.phone, salidaId, { seatsBooked: 2 });
    check(r2.trip.availableSeats === 1, 'y dos menos con la segunda reserva', r2.trip.availableSeats);
  }

  console.log('\n[7] Al cerrarlo, la comisión aparece en la billetera del taxista');
  {
    const antes = await getDriverBalance(taxista.id);
    check(antes.owed === 0, 'antes de cerrar no debe nada');

    await departPooledTrip(taxista.id, salidaId);
    const cerrada = await completePooledTrip(taxista.id, salidaId);
    check(cerrada?.status === 'completed', 'el viaje queda cerrado');

    // El `recordCompletedTrip` es fire-and-forget por dentro.
    await new Promise((r) => setTimeout(r, 400));

    const bruto = precioPuesto * 3; // un puesto + dos puestos
    const fila = await prisma.driverEarning.findFirst({ where: { driverId: taxista.id } });
    check(fila != null, 'se escribió la ganancia del día');
    check(
      Math.round(fila?.grossFare ?? 0) === bruto,
      'el bruto es lo que de verdad cobró: la suma de los puestos vendidos',
      { esperado: bruto, real: fila?.grossFare },
    );
    check((fila?.commission ?? 0) > 0, 'con su comisión', fila?.commission);

    const despues = await getDriverBalance(taxista.id);
    check(despues.totalEarned > 0, 'el panel de ganancias lo muestra', despues.totalEarned);
    // Aquí es donde el punto 3 se apoya en el punto 1: el pasajero le paga al
    // taxista en la mano, así que la comisión es DEUDA suya, no saldo nuestro.
    check(despues.available === 0, 'pero no puede retirar nada: la plata se la pagaron a él');
    // Explícito y no solo «igual a la comisión»: sin esta línea, quitar la
    // liquidación entera dejaría la comprobación en verde comparando 0 con 0.
    check(despues.owed > 0, 'la comisión SÍ se le cobra: la deuda es mayor que cero', despues.owed);
    check(
      Math.round(despues.owed) === Math.round(fila?.commission ?? 0),
      'y queda debiendo exactamente la comisión del viaje',
      { owed: despues.owed, comision: fila?.commission },
    );
  }

  console.log('\n[8] Un viaje que sale vacío no inventa una comisión');
  {
    const vacia = await publicarPuestoUrbano(taxista.id, taxista.name, taxista.phone, {
      city: 'pamplona', originLabel: 'Parque', destLabel: 'Cementerio',
      departureTime: enHoras(1), totalSeats: 2, farePerSeat: 1500,
      vehicleDescription: 'Spark • TAX 123',
    });
    const antes = await getDriverBalance(taxista.id);
    await departPooledTrip(taxista.id, vacia.id);
    await completePooledTrip(taxista.id, vacia.id);
    await new Promise((r) => setTimeout(r, 400));
    const despues = await getDriverBalance(taxista.id);
    check(
      Math.round(despues.owed) === Math.round(antes.owed),
      'nadie subió, así que no hay nada que comisionar',
      { antes: antes.owed, despues: despues.owed },
    );
    await prisma.pooledTrip.delete({ where: { id: vacia.id } });
  }

  // Limpieza
  await prisma.seatAssignment.deleteMany({ where: { trip: { driverId: taxista.id } } });
  await prisma.seatBooking.deleteMany({ where: { trip: { driverId: taxista.id } } });
  await prisma.pooledTrip.deleteMany({ where: { driverId: taxista.id } });
  await prisma.driverEarning.deleteMany({ where: { driverId: taxista.id } });
  await prisma.driver.delete({ where: { id: taxista.id } });
  await prisma.user.deleteMany({ where: { id: { in: [pasajero1.id, pasajero2.id] } } });

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones OK, ${fallos} en rojo`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  if (e instanceof PooledTripError) console.error('PooledTripError:', e.message);
  console.error(e);
  process.exit(1);
});
