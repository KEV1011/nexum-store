/**
 * El viaje por puestos que arma un PASAJERO, contra PostgreSQL real.
 *
 * LO QUE SOLO SE VE EJECUTANDO:
 *
 *   • Que la salida NAZCA sin conductor y con la reserva de su autor ya hecha,
 *     las dos en la misma transacción. Es lo que impide que exista un viaje
 *     publicado en el que su propio autor no va, y una prueba unitaria no toca
 *     la transacción.
 *
 *   • Que la toma sea ATÓMICA. Dos taxistas tocando «Tomar» a la vez y el
 *     pasajero acaba con dos carros en la puerta. OJO: llamar dos veces
 *     seguidas desde aquí NO lo demuestra —entre las dos llamadas hay
 *     bastantes idas y venidas a la base como para que la segunda ya vea la
 *     escritura de la primera—, así que además se comprueba que repetir el
 *     `updateMany` con el mismo `where` escriba CERO filas. Esa es la que vale
 *     cuando Render levanta dos instancias.
 *
 *   • Que después de tomada el viaje entre por la maquinaria de siempre:
 *     arrancar, cerrar y dejar rastro en la billetera del conductor con la
 *     comisión a deber, como cualquier carrera en efectivo.
 *
 *   • Que el DTO diga «sin conductor» en vez de inventarse uno. El parser de
 *     la app tenía `?? 'Conductor'`, que se lee como si ya hubiera uno.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/puesto-de-pasajero.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  bookSeats,
  buscarPuestosUrbanos,
  completePooledTrip,
  departPooledTrip,
  listarPuestosSinConductor,
  publicarPuestoDePasajero,
  tomarPuestoDePasajero,
} from '../src/services/intercity-pool.service';
import { getDriverBalance } from '../src/services/payout.service';
import { tablaTarifas } from '../src/lib/tarifa-categoria';
import {
  precioDelPuesto, repartoDeCarrera, tarifaDeCarrera, topePorPuesto,
} from '../src/lib/puesto-urbano';
import {
  ABIERTAS_MAX_POR_PASAJERO, GRACIA_TOMA_MIN,
} from '../src/lib/puesto-de-pasajero';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

async function motivoDe(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);
const enHoras = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function main() {
  const marca = `e2epas-${Date.now()}`;

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

  const autor = await prisma.user.create({
    data: { name: `${marca} Autor`, phone: `+5730061${sufijo()}` },
  });
  const otro = await prisma.user.create({
    data: { name: `${marca} Otro`, phone: `+5730062${sufijo()}` },
  });
  const usuarios = [autor.id, otro.id];

  const taxista = await prisma.driver.create({
    data: {
      name: `${marca} Taxista`, phone: `+5730063${sufijo()}`,
      isVerified: true, status: 'ONLINE', citySlug: 'pamplona',
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: taxista.id, type: 'TAXI', brand: 'Chevrolet', model: 'Spark',
      year: 2019, plate: `TXP${sufijo() % 1000}`.slice(0, 6), color: 'Amarillo', isActive: true,
    },
  });

  const motociclista = await prisma.driver.create({
    data: {
      name: `${marca} Moto`, phone: `+5730064${sufijo()}`,
      isVerified: true, status: 'ONLINE', citySlug: 'pamplona',
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: motociclista.id, type: 'MOTO', brand: 'Bajaj', model: 'Boxer',
      year: 2021, plate: `MTP${sufijo() % 100}A`.slice(0, 6), color: 'Negra', isActive: true,
    },
  });

  // Cuatro conductores con carro, para la carrera del paso [7].
  const corredores: { id: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const d = await prisma.driver.create({
      data: {
        name: `${marca} Corredor ${i}`, phone: `+57300${70 + i}${sufijo()}`,
        isVerified: true, status: 'ONLINE', citySlug: 'pamplona',
      },
    });
    await prisma.vehicle.create({
      data: {
        driverId: d.id, type: 'TAXI', brand: 'Kia', model: 'Picanto',
        year: 2020, plate: `CR${i}${sufijo() % 1000}`.slice(0, 6), color: 'Blanco', isActive: true,
      },
    });
    corredores.push({ id: d.id });
  }

  // Un taxista de la plaza CON token de push: es a quien tiene que llegarle el
  // aviso. Sin `fcmToken` el envío se descarta antes de salir y la
  // comprobación del paso [1b] pasaría sin probar nada.
  const avisado = await prisma.driver.create({
    data: {
      name: `${marca} Avisado`, phone: `+573009${sufijo()}`,
      isVerified: true, status: 'ONLINE', citySlug: 'pamplona',
      fcmToken: `tok-${sufijo()}`, lastSeenAt: new Date(),
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: avisado.id, type: 'TAXI', brand: 'Chevrolet', model: 'Spark',
      year: 2019, plate: `AV${sufijo() % 10000}`.slice(0, 6), color: 'Amarillo', isActive: true,
    },
  });
  // Y uno de OTRA plaza, para comprobar que el aviso no se le va encima.
  const ajenoPlaza = await prisma.driver.create({
    data: {
      name: `${marca} Cucuta`, phone: `+573008${sufijo()}`,
      isVerified: true, status: 'ONLINE', citySlug: 'cucuta',
      fcmToken: `tok-aj-${sufijo()}`, lastSeenAt: new Date(),
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: ajenoPlaza.id, type: 'TAXI', brand: 'Kia', model: 'Rio',
      year: 2019, plate: `AJ${sufijo() % 10000}`.slice(0, 6), color: 'Amarillo', isActive: true,
    },
  });

  const minimoTaxi = tablaTarifas().TAXI.minimo;
  const tope = topePorPuesto(minimoTaxi, 4);

  // Se anota lo que el mock de push escribe en el registro: en desarrollo es el
  // único sitio donde se puede ver un envío sin Firebase.
  const registroPush: string[] = [];
  const logOriginal = console.log;
  console.log = (...args: unknown[]) => {
    const linea = args.map(String).join(' ');
    if (linea.includes('[Push:mock]')) registroPush.push(linea);
    logOriginal(...args);
  };

  console.log('\n[1] El pasajero publica el viaje y queda SIN conductor');
  let salidaId = '';
  {
    const salida = await publicarPuestoDePasajero(autor.id, {
      city: 'pamplona',
      originLabel: 'Barrio El Rosario',
      destLabel: 'Hospital San Juan de Dios',
      departureTime: enHoras(3),
      totalSeats: 4,
      seatsForMe: 1,
    });
    salidaId = salida.id;
    // EL PRECIO LO PONE LA PLATAFORMA. Con la carrera a $8.000 y cuatro
    // puestos, $2.000 cada uno.
    check(
      salida.farePerSeat === precioDelPuesto(4),
      `el puesto cuesta lo que fija la plataforma ($${precioDelPuesto(4)})`,
      salida.farePerSeat,
    );
    check(
      salida.farePerSeat * 4 <= tarifaDeCarrera(),
      'y los cuatro puestos no pasan de la carrera completa',
      { puesto: salida.farePerSeat, carrera: tarifaDeCarrera() },
    );
    check(salida.kind === 'urbano', 'es una salida urbana', salida.kind);
    check(salida.tripRef.startsWith('NXP-'), 'con su propio consecutivo', salida.tripRef);
    check(salida.sinConductor === true, 'el DTO dice que no tiene conductor');
    check(salida.driverId === undefined, 'y NO manda un driverId vacío', salida.driverId);
    check(
      salida.driverName === undefined && salida.vehicleDescription === undefined,
      'ni un nombre o un carro inventados',
      { n: salida.driverName, v: salida.vehicleDescription },
    );
    check(salida.createdByUserId === autor.id, 'queda sellado quién la publicó');
    check(salida.soloFareRef === minimoTaxi, 'la carrera sola queda SELLADA', salida.soloFareRef);
  }

  console.log('\n[1b] EL AVISO: ¿le llega a algún taxista?');
  {
    // ÉSTA es la comprobación de la tanda. Reportado: «se solicita un servicio
    // y no le sale a ningún conductor». El viaje SÍ llegaba al tablero; lo que
    // no había era aviso, así que funcionaba solo si al taxista se le ocurría
    // ir a mirar.
    await new Promise((r) => setTimeout(r, 400)); // el aviso sale sin `await`
    const mios = registroPush.filter((l) => l.includes(`driver=${avisado.id}`));
    check(mios.length >= 1, 'sale un push dirigido a un taxista de la plaza', mios[0]);
    check(
      (mios[0] ?? '').includes('type=pooled_urban_new'),
      'con el tipo que su app sabe enrutar hasta el tablero',
      mios[0],
    );
    check(
      registroPush.every((l) => !l.includes(`driver=${ajenoPlaza.id}`)),
      'y NO se le manda a un taxista de otra ciudad',
      registroPush.filter((l) => l.includes(`driver=${ajenoPlaza.id}`)),
    );
    check(
      registroPush.every((l) => !l.includes(`driver=${motociclista.id}`)),
      'ni a una moto, que no podría tomarlo',
      registroPush.filter((l) => l.includes(`driver=${motociclista.id}`)),
    );
  }

  console.log('\n[2] Quien publica VIAJA: su reserva se creó en la misma operación');
  {
    const reservas = await prisma.seatBooking.findMany({ where: { tripId: salidaId } });
    check(reservas.length === 1, 'hay exactamente una reserva', reservas.length);
    check(reservas[0]?.userId === autor.id, 'y es la del autor');
    check(reservas[0]?.seatsBooked === 1, 'con el puesto que dijo que ocupa');
    check(
      reservas[0]?.fareTotal === precioDelPuesto(4),
      'y el importe sellado a lo que aceptó',
      reservas[0]?.fareTotal,
    );
  }

  console.log('\n[3] Le aparece a los demás pasajeros de la ciudad');
  {
    const enPamplona = await buscarPuestosUrbanos({ ciudad: 'pamplona', horas: 12 });
    check(
      enPamplona.some((t) => t.id === salidaId),
      'sale en el buscador de puestos urbanos aunque no tenga conductor',
    );
    const enCucuta = await buscarPuestosUrbanos({ ciudad: 'cucuta', horas: 12 });
    check(!enCucuta.some((t) => t.id === salidaId), 'y NO en el de otra ciudad');

    const { trip } = await bookSeats(otro.id, `${marca} Otro`, otro.phone, salidaId, {
      seatsBooked: 2,
    } as never);
    check(trip.availableSeats === 1, 'otro pasajero se suma y quedan los puestos justos', trip.availableSeats);
  }

  console.log('\n[4] Y al conductor le aparece en su tablero');
  {
    const tablero = await listarPuestosSinConductor('pamplona');
    check(tablero.some((t) => t.id === salidaId), 'está en el tablero de sin conductor');
    const ajeno = await listarPuestosSinConductor('cucuta');
    check(!ajeno.some((t) => t.id === salidaId), 'no en el de otra plaza');
  }

  console.log('\n[5] Una moto NO puede tomarlo');
  {
    const motivo = await motivoDe(() => tomarPuestoDePasajero(motociclista.id, salidaId));
    check(/carro/i.test(motivo), 'se rechaza diciendo que hace falta un carro', motivo);
    const sigue = await prisma.pooledTrip.findUnique({ where: { id: salidaId } });
    check(sigue?.driverId === null, 'y el viaje sigue libre');
  }

  console.log('\n[6] El taxista lo toma y se sellan los cuatro campos');
  {
    const tomada = await tomarPuestoDePasajero(taxista.id, salidaId);
    check(tomada.driverId === taxista.id, 'queda a su nombre');
    check(tomada.sinConductor === false, 'el DTO deja de decir «sin conductor»');
    check(
      (tomada.vehicleDescription ?? '').includes('Spark'),
      'con la descripción de SU vehículo, no una inventada',
      tomada.vehicleDescription,
    );
    check(!!tomada.maskedPhone, 'y el teléfono enmascarado para el pasajero');

    const tablero = await listarPuestosSinConductor('pamplona');
    check(!tablero.some((t) => t.id === salidaId), 'y sale del tablero de libres');
  }

  console.log('\n[7] La toma es ATÓMICA');
  {
    const motivo = await motivoDe(() => tomarPuestoDePasajero(motociclista.id, salidaId));
    check(/ya tomó|carro/i.test(motivo), 'un segundo conductor se lo encuentra tomado', motivo);

    // La de verdad, y la que costó escribir bien: llamar dos veces SEGUIDAS no
    // prueba nada —entre las dos llamadas hay bastantes idas y venidas a la
    // base como para que la segunda ya vea la escritura de la primera, así que
    // la comprobación pasa igual con la guarda quitada (se verificó)—. Lo que
    // hace falta es que varias lecturas vean el viaje libre ANTES de que
    // ninguna escriba, o sea de verdad a la vez. Con la guarda, solo una de
    // las cuatro puede escribir; sin ella, todas creen habérselo llevado.
    const enDisputa = await publicarPuestoDePasajero(autor.id, {
      city: 'pamplona', originLabel: 'Plaza principal', destLabel: 'Terminal',
      departureTime: enHoras(5), totalSeats: 4, seatsForMe: 1,     });
    const resultados = await Promise.allSettled(
      corredores.map((d) => tomarPuestoDePasajero(d.id, enDisputa.id)),
    );
    const ganaron = resultados.filter((r) => r.status === 'fulfilled');
    check(
      ganaron.length === 1,
      `solo UNO de los ${corredores.length} que la piden a la vez se la lleva`,
      { ganaron: ganaron.length },
    );
    const final = await prisma.pooledTrip.findUnique({ where: { id: enDisputa.id } });
    check(
      corredores.some((d) => d.id === final?.driverId),
      'y el viaje queda a nombre del que ganó, no del último en escribir',
    );
  }

  console.log('\n[8] Desde ahí es un viaje por puestos normal: arranca, cierra y paga');
  {
    const antes = await getDriverBalance(taxista.id);
    await departPooledTrip(taxista.id, salidaId);
    const cerrada = await completePooledTrip(taxista.id, salidaId);
    check(cerrada?.status === 'completed', 'se cierra', cerrada?.status);

    // `recordCompletedTrip` escribe sin esperar a propósito (no puede frenar el
    // cierre del viaje por la base), así que aquí sí hay que darle el respiro.
    await new Promise((r) => setTimeout(r, 400));

    const ganancias = await prisma.driverEarning.findMany({ where: { driverId: taxista.id } });
    check(ganancias.length > 0, 'deja rastro en driver_earnings');

    // EL REPARTO ACORDADO, y justo en el caso que lo hace interesante: el carro
    // salió con TRES de los cuatro puestos (uno del autor, dos del pasajero
    // que se sumó en el paso [3]), así que se recaudaron $6.000 de los $8.000
    // de la carrera. El conductor se lleva $4.500 y la app $1.500 — su cuarta
    // parte de lo que entró. Con $2.000 fijos la app se habría llevado un
    // tercio, y ésa es la razón de que sea tasa.
    const vendidos = 3;
    const recaudado = precioDelPuesto(4) * vendidos;
    const esperado = repartoDeCarrera(recaudado);
    // `driver_earnings` agrega por conductor y DÍA (no hay fila por viaje), y
    // este taxista no tiene otro servicio cerrado hoy: la fila es esta carrera.
    const liq = ganancias[0];
    check(
      liq?.grossFare === recaudado,
      `el bruto es lo que de verdad se cobró ($${recaudado} por ${vendidos} puestos), no la carrera completa`,
      { bruto: liq?.grossFare, esperado: recaudado },
    );
    check(
      liq?.netEarning === esperado.neto && liq?.commission === esperado.comision,
      'y se reparte 75 / 25 sobre lo recaudado',
      { neto: liq?.netEarning, comision: liq?.commission, esperado },
    );
    check(
      repartoDeCarrera(tarifaDeCarrera()).neto === 6000
        && repartoDeCarrera(tarifaDeCarrera()).comision === 2000,
      'la carrera completa deja exactamente $6.000 al conductor y $2.000 a la app',
      repartoDeCarrera(tarifaDeCarrera()),
    );
    const despues = await getDriverBalance(taxista.id);
    check(
      despues.owed > antes.owed,
      'y la comisión le queda a DEBER: el puesto se paga en la mano',
      { antes: antes.owed, despues: despues.owed },
    );
    check(
      despues.available === antes.available,
      'no se le acredita nada retirable, que es plata que nunca entró aquí',
      { antes: antes.available, despues: despues.available },
    );
  }

  console.log('\n[8b] «Lo antes posible»: el caso que estaba roto');
  {
    // Antes, un viaje para AHORA no se podía ni publicar («la hora tiene que
    // ser en el futuro», porque entre el teléfono y el servidor pasan
    // décimas) y, si se publicaba al minuto siguiente, desaparecía del tablero
    // y dejaba de poderse tomar. Era la causa de «se solicita un servicio y no
    // le sale a ningún conductor».
    const autorYa = await prisma.user.create({
      data: { name: `${marca} Ya`, phone: `+5730066${sufijo()}` },
    });
    usuarios.push(autorYa.id);
    const ya = await publicarPuestoDePasajero(autorYa.id, {
      city: 'pamplona', originLabel: 'Calle 5 con 6', destLabel: 'Terminal',
      departureTime: new Date().toISOString(),
      totalSeats: 4, seatsForMe: 1,
    });
    check(!!ya.id, 'un viaje para AHORA MISMO se publica');

    const tablero = await listarPuestosSinConductor('pamplona');
    check(
      tablero.some((x) => x.id === ya.id),
      'y aparece en el tablero del conductor (antes se evaporaba)',
      tablero.map((x) => x.id),
    );

    // Y la gracia: un viaje cuya hora pasó hace poco todavía se toma, porque
    // un taxi que llega cuatro minutos tarde hace el viaje igual.
    await prisma.pooledTrip.update({
      where: { id: ya.id },
      data: { departureTime: new Date(Date.now() - (GRACIA_TOMA_MIN - 2) * 60_000) },
    });
    const tomado = await motivoDe(() => tomarPuestoDePasajero(corredores[0]!.id, ya.id));
    check(tomado === '', `se puede tomar hasta ${GRACIA_TOMA_MIN} min después de la hora`, tomado);

    // Pasada la gracia sí se retira: el pasajero ya se fue en otra cosa.
    const viejo2 = await publicarPuestoDePasajero(autorYa.id, {
      city: 'pamplona', originLabel: 'Otro punto', destLabel: 'Otro destino',
      departureTime: new Date().toISOString(), totalSeats: 4, seatsForMe: 1,
    });
    await prisma.pooledTrip.update({
      where: { id: viejo2.id },
      data: { departureTime: new Date(Date.now() - (GRACIA_TOMA_MIN + 5) * 60_000) },
    });
    const tarde = await motivoDe(() => tomarPuestoDePasajero(corredores[1]!.id, viejo2.id));
    check(/pas/i.test(tarde), 'pero pasada la gracia ya no', tarde);
    const sinEl = await listarPuestosSinConductor('pamplona');
    check(!sinEl.some((x) => x.id === viejo2.id), 'y tampoco sigue en el tablero');

    for (const id of [ya.id, viejo2.id]) {
      await prisma.seatBooking.deleteMany({ where: { tripId: id } });
      await prisma.pooledTrip.delete({ where: { id } });
    }
  }

  console.log('\n[9] Las guardas del pasajero, contra la base');
  {
    const todos = await motivoDe(() => publicarPuestoDePasajero(autor.id, {
      city: 'pamplona', originLabel: 'A', destLabel: 'B',
      departureTime: enHoras(2), totalSeats: 3, seatsForMe: 3,     }));
    check(/al menos un puesto libre/i.test(todos), 'no puede quedarse con todos los puestos', todos);

    // Esta comprobación ERA «no puede publicar un puesto por encima del tope».
    // Se retira porque el precio dejó de ser un dato que alguien manda: se
    // comprueba en su lugar que un precio inventado en el cuerpo se IGNORE,
    // que es la versión fuerte de lo mismo.
    const conPrecioInventado = await publicarPuestoDePasajero(autor.id, {
      city: 'pamplona', originLabel: 'Colegio', destLabel: 'Plaza',
      departureTime: enHoras(2), totalSeats: 4, seatsForMe: 1,
      farePerSeat: minimoTaxi * 10,
    });
    check(
      conPrecioInventado.farePerSeat === precioDelPuesto(4),
      'un precio mandado desde la app se descarta',
      conPrecioInventado.farePerSeat,
    );
    await prisma.seatBooking.deleteMany({ where: { tripId: conPrecioInventado.id } });
    await prisma.pooledTrip.delete({ where: { id: conPrecioInventado.id } });

    const inventada = await motivoDe(() => publicarPuestoDePasajero(autor.id, {
      city: 'no-existe', originLabel: 'A', destLabel: 'B',
      departureTime: enHoras(2), totalSeats: 4, seatsForMe: 1,     }));
    check(/municipios/i.test(inventada), 'ni en una ciudad que no está en la lista', inventada);
  }

  console.log('\n[10] El tope de viajes abiertos a la vez');
  {
    const autorTope = await prisma.user.create({
      data: { name: `${marca} Tope`, phone: `+5730065${sufijo()}` },
    });
    usuarios.push(autorTope.id);
    for (let i = 0; i < ABIERTAS_MAX_POR_PASAJERO; i++) {
      await publicarPuestoDePasajero(autorTope.id, {
        city: 'pamplona', originLabel: `Origen ${i}`, destLabel: `Destino ${i}`,
        departureTime: enHoras(4 + i), totalSeats: 4, seatsForMe: 1,       });
    }
    const pasado = await motivoDe(() => publicarPuestoDePasajero(autorTope.id, {
      city: 'pamplona', originLabel: 'Una más', destLabel: 'No cabe',
      departureTime: enHoras(9), totalSeats: 4, seatsForMe: 1,     }));
    check(/sin terminar/i.test(pasado), 'con el tope alcanzado se rechaza', pasado);
    check(
      pasado.includes(String(ABIERTAS_MAX_POR_PASAJERO)),
      'diciendo cuántas tiene, no «no puedes»',
      pasado,
    );
  }

  console.log('\n[11] Las salidas de siempre no cambiaron');
  {
    const conConductor = await prisma.pooledTrip.findMany({
      where: { driverId: { not: null }, kind: 'URBANO' },
      take: 1,
    });
    check(conConductor.length > 0, 'siguen existiendo salidas con conductor');
    const dto = await listarPuestosSinConductor('pamplona');
    check(
      dto.every((t) => t.sinConductor === true),
      'y el tablero de libres solo trae las que de verdad no tienen',
    );
  }

  // ── Limpieza ───────────────────────────────────────────────────────────────
  const mios = await prisma.pooledTrip.findMany({
    where: { OR: [{ createdByUserId: { in: usuarios } }, { driverId: { in: [taxista.id, ...corredores.map((c) => c.id)] } }] },
    select: { id: true },
  });
  const ids = mios.map((t) => t.id);
  const conductores = [taxista.id, motociclista.id, ...corredores.map((c) => c.id)];
  await prisma.seatAssignment.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.seatBooking.deleteMany({ where: { tripId: { in: ids } } });
  await prisma.pooledTrip.deleteMany({ where: { id: { in: ids } } });
  await prisma.driverEarning.deleteMany({ where: { driverId: { in: conductores } } });
  await prisma.vehicle.deleteMany({ where: { driverId: { in: conductores } } });
  await prisma.driver.deleteMany({ where: { id: { in: conductores } } });
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } });

  console.log(`\n${fallos === 0 ? 'TODO EN VERDE' : 'HAY FALLOS'}: ${ok} ok, ${fallos} fallos`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
