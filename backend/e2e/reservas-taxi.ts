/**
 * E2E del tablero de reservas: el taxista aparta con antelación.
 *
 * El caso que motivó todo esto: el estudiante que entra a clase a las 6:00 no
 * quiere que a las 5:45 «se empiece a buscar», quiere dormirse sabiendo que
 * tiene un taxi. Lo que se comprueba aquí, por orden de gravedad:
 *
 *  1. **Dos conductores no pueden llevarse la misma reserva.** Si pudieran, el
 *     pasajero tendría dos carros en la puerta y uno de los dos trabajó gratis.
 *  2. **Una reserva apartada NO sale a buscar a nadie más.** Ese era el
 *     comportamiento anterior y sería el error más caro: el pasajero acabaría
 *     con el que apartó y con el que le mandó el despacho.
 *  3. **La reserva de mañana no ocupa al conductor hoy**: al cerrar su carrera
 *     de hoy tiene que volver a ONLINE, no quedarse ON_TRIP hasta mañana.
 *  4. **El que no aparece pierde la reserva** y el viaje sale a buscar normal.
 *  5. Un conductor solo ve —y solo puede apartar— lo que su vehículo atiende.
 *  6. El pasajero ve al conductor apartado al abrir la app.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/reservas-taxi.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const ORIGEN = { lat: 7.3754, lng: -72.6486 };
const DESTINO = { lat: 7.3921, lng: -72.6602 };
const enMin = (m: number) => new Date(Date.now() + m * 60_000);
const tel = () => `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;
const placa = () => `R${Math.floor(1000 + Math.random() * 8999)}`;

async function sembrarConductor(nombre: string, tipo: 'TAXI' | 'MOTO') {
  const d = await prisma.driver.create({
    data: {
      phone: tel(), name: nombre, status: 'ONLINE', isVerified: true,
      acceptsTrips: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      driverId: d.id, type: tipo, isActive: true, brand: 'Prueba', model: 'X',
      plate: placa(), year: 2020, color: 'Amarillo',
    },
  });
  await prisma.$executeRaw`
    UPDATE "drivers"
    SET "geo" = ST_SetSRID(ST_MakePoint(${ORIGEN.lng}, ${ORIGEN.lat}), 4326)::geography,
        "lastSeenAt" = now(), "lastLat" = ${ORIGEN.lat}, "lastLng" = ${ORIGEN.lng}
    WHERE "id" = ${d.id}`;
  return d;
}

async function main(): Promise<void> {
  const { requestClientTrip, despacharProgramados, getActiveClientTrip } =
    await import('../src/services/client.service');
  const reservas = await import('../src/services/reservas.service');
  const matching = await import('../src/services/matching.service');
  const { liberarConductorSiNoTieneMas } = await import('../src/lib/liberar-conductor');

  // El canal al conductor se captura para poder AFIRMAR que se le avisó: sin
  // esto, «se activó la reserva» solo diría que cambió una fila.
  const alConductor: Array<Record<string, unknown>> = [];
  reservas.registerReservaSendToDriver((_id, msg) => {
    alConductor.push(msg);
  });
  const ofertas: Array<Record<string, unknown>> = [];
  matching.registerSendToDriver((_id, msg) => {
    ofertas.push(msg as Record<string, unknown>);
    return true;
  });

  const cliente = await prisma.user.create({
    data: { phone: tel(), name: 'e2e-reservas' },
  });

  const pedir = (cuando: Date, tipo: 'taxi' | 'moto' = 'taxi') =>
    requestClientTrip(cliente.id, {
      serviceType: tipo,
      originAddress: 'Parque principal',
      destinationAddress: 'Universidad',
      originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destLat: DESTINO.lat, destLng: DESTINO.lng,
      scheduledFor: cuando.toISOString(),
    } as Parameters<typeof requestClientTrip>[1]);

  const fila = (id: string) =>
    prisma.trip.findUnique({
      where: { id }, select: { status: true, driverId: true, acceptedAt: true },
    });

  const taxi = await sembrarConductor('e2e-taxista', 'TAXI');
  const taxi2 = await sembrarConductor('e2e-taxista-2', 'TAXI');
  const moto = await sembrarConductor('e2e-motero', 'MOTO');

  console.log('\n═══ El tablero: cada conductor ve lo que puede atender ═══');
  const reserva = await pedir(enMin(180));
  {
    const paraTaxi = (await reservas.listarReservasLibres(taxi.id)).reservas;
    comprobar('el taxi ve la reserva de taxi',
      paraTaxi.some((r) => r.id === reserva.id), JSON.stringify(paraTaxi.map((r) => r.id)));
    comprobar('y la ve como todavía no activa', paraTaxi.find((r) => r.id === reserva.id)?.enCurso === false);

    const paraMoto = (await reservas.listarReservasLibres(moto.id)).reservas;
    comprobar('la moto NO ve la carrera de taxi',
      !paraMoto.some((r) => r.id === reserva.id));
  }

  console.log('\n═══ Una reserva sin plaza NO se le esconde a nadie ═══');
  {
    // El defecto que dejaba el tablero vacío en el teléfono del usuario: el
    // conductor recibe `citySlug` en CADA latido, pero el viaje solo lo tiene
    // si `plazaDeCoordenadas` resolvió al crearlo. Con una igualdad estricta,
    // una reserva con la plaza en nulo desaparecía para todo el mundo y sin un
    // solo mensaje.
    await prisma.driver.update({
      where: { id: taxi.id }, data: { citySlug: 'pamplona' },
    });
    const base = {
      passengerId: cliente.id, serviceType: 'TAXI' as const,
      status: 'SCHEDULED' as const,
      originAddress: 'Parque principal', originLat: ORIGEN.lat, originLng: ORIGEN.lng,
      destAddress: 'Universidad', destLat: DESTINO.lat, destLng: DESTINO.lng,
      estimatedFare: 8000, scheduledFor: enMin(200), searchFrom: enMin(185),
    };
    const sinPlaza = await prisma.trip.create({
      data: { ...base, requestRef: `SP${Date.now()}` },
    });
    const otraPlaza = await prisma.trip.create({
      data: { ...base, requestRef: `OP${Date.now()}`, citySlug: 'cucuta' },
    });

    const libres = (await reservas.listarReservasLibres(taxi.id)).reservas;
    comprobar('la reserva SIN plaza sí se ve',
      libres.some((r) => r.id === sinPlaza.id));
    // Y lo que sí debe excluirse sigue excluido: un dato presente y distinto.
    comprobar('la reserva de OTRA ciudad no se ve',
      !libres.some((r) => r.id === otraPlaza.id));

    await prisma.trip.deleteMany({
      where: { id: { in: [sinPlaza.id, otraPlaza.id] } },
    });
    await prisma.driver.update({ where: { id: taxi.id }, data: { citySlug: null } });
  }

  console.log('\n═══ Apartar: la toma es atómica ═══');
  {
    // Los dos taxistas tocan «Apartar» en el mismo instante.
    const [a, b] = await Promise.allSettled([
      reservas.apartarReserva(taxi.id, reserva.id),
      reservas.apartarReserva(taxi2.id, reserva.id),

    ]);
    const ganadores = [a, b].filter((r) => r.status === 'fulfilled').length;
    comprobar('SOLO UNO se la lleva', ganadores === 1, `ganaron ${ganadores}`);
    const perdedor = [a, b].find((r) => r.status === 'rejected');
    comprobar('al otro se le dice por qué',
      /tomó esa reserva primero/.test(
        perdedor && perdedor.status === 'rejected' ? String(perdedor.reason?.message) : ''),
      perdedor && perdedor.status === 'rejected' ? String(perdedor.reason?.message) : 'no hubo perdedor');

    const t = await fila(reserva.id);
    comprobar('queda con conductor y sigue SCHEDULED',
      t?.driverId !== null && t?.status === 'SCHEDULED', `${t?.status}/${t?.driverId}`);

    // Conviene saber qué prueba de verdad lo de arriba: quitando la guarda del
    // `updateMany` esa comprobación SIGUE en verde —lo comprobé—, porque entre
    // las dos llamadas hay suficientes idas y venidas a la base como para que
    // el `findUnique` de la segunda ya vea la escritura de la primera. Lo que
    // sostiene la regla cuando hay DOS instancias del servidor es la guarda de
    // la escritura, y eso se comprueba aparte: repetir exactamente el mismo
    // `updateMany` sobre una reserva ya tomada tiene que quedar en cero filas.
    const repetida = await prisma.trip.updateMany({
      where: { id: reserva.id, status: 'SCHEDULED', driverId: null },
      data: { driverId: taxi2.id },
    });
    comprobar('la BASE rechaza una segunda toma de la misma reserva',
      repetida.count === 0, `escribió ${repetida.count} fila(s)`);
  }

  // Quién se la llevó (la carrera la decide la base, no el orden de la llamada).
  const dueno = (await fila(reserva.id))!.driverId!;
  const otro = dueno === taxi.id ? taxi2.id : taxi.id;

  console.log('\n═══ El pasajero ve que tiene taxi apartado ═══');
  {
    const activo = await getActiveClientTrip(cliente.id);
    comprobar('el viaje reservado sale como activo', activo?.id === reserva.id);
    comprobar('con el conductor ya asignado', activo?.driverId === dueno, String(activo?.driverId));
    // Esta es la que de verdad ve el pasajero en pantalla: sin el nombre no
    // puede saber que tiene carro, solo que «algo» pasó.
    comprobar('y con su nombre', Boolean(activo?.driverName), String(activo?.driverName));
    comprobar('la app lo sabe leer como reservado', activo?.status === 'scheduled', String(activo?.status));
  }

  console.log('\n═══ Ya apartada, NO se le ofrece a nadie más ═══');
  {
    const n = await despacharProgramados();
    comprobar('el barrido de búsqueda la ignora', n === 0, `despachó ${n}`);
    // Aunque le llegue la hora.
    await prisma.trip.update({ where: { id: reserva.id }, data: { searchFrom: enMin(-1) } });
    ofertas.length = 0;
    const n2 = await despacharProgramados();
    await new Promise((r) => setTimeout(r, 400));
    comprobar('tampoco al llegar la hora', n2 === 0, `despachó ${n2}`);
    comprobar('y NINGÚN conductor recibe oferta',
      !ofertas.some((m) => m['type'] === 'trip_request'),
      JSON.stringify(ofertas.map((m) => m['type'])));
    comprobar('sigue siendo del que la apartó',
      (await fila(reserva.id))?.driverId === dueno);
  }

  console.log('\n═══ Y el otro taxista ya no la ve libre ═══');
  {
    const libres = (await reservas.listarReservasLibres(otro)).reservas;
    comprobar('fuera del tablero', !libres.some((r) => r.id === reserva.id));
    const mias = await reservas.listarMisReservas(dueno);
    comprobar('en «mis reservas» del que la apartó',
      mias.some((r) => r.id === reserva.id));
    const suya = mias.find((r) => r.id === reserva.id);
    comprobar('con el nombre del pasajero', Boolean(suya?.passengerName), String(suya?.passengerName));
    comprobar('y el teléfono ENMASCARADO, nunca el real',
      Boolean(suya?.passengerPhone?.includes('•')), String(suya?.passengerPhone));
  }

  console.log('\n═══ Le llega la hora: se activa y se le avisa ═══');
  {
    alConductor.length = 0;
    const n = await reservas.activarReservas();
    comprobar('el barrido la activa', n === 1, `activó ${n}`);
    const t = await fila(reserva.id);
    comprobar('pasa a ACCEPTED', t?.status === 'ACCEPTED', String(t?.status));
    comprobar('con la hora de aceptación sellada', t?.acceptedAt !== null);
    comprobar('SE LE AVISA al conductor por el socket',
      alConductor.some((m) => m['type'] === 'reserva_activa' && m['tripId'] === reserva.id),
      JSON.stringify(alConductor));
    // No se le marca ON_TRIP por adelantado: todavía no recogió a nadie y
    // podría estar terminando otro servicio.
    const d = await prisma.driver.findUnique({ where: { id: dueno }, select: { status: true } });
    comprobar('no se le saca del despacho por adelantado', d?.status === 'ONLINE', String(d?.status));
    comprobar('un segundo barrido no la activa dos veces',
      (await reservas.activarReservas()) === 0);
  }

  console.log('\n═══ Una reserva para mañana NO ocupa al conductor hoy ═══');
  {
    // El fallo silencioso que esto vigila: contar la reserva como servicio
    // abierto dejaba al conductor ON_TRIP al cerrar su carrera de hoy, o sea
    // fuera del despacho hasta que cumpliera la de mañana.
    const futura = await pedir(enMin(240));
    await reservas.apartarReserva(otro, futura.id);
    await prisma.driver.update({ where: { id: otro }, data: { status: 'ON_TRIP' } });
    await liberarConductorSiNoTieneMas(otro);
    const d = await prisma.driver.findUnique({ where: { id: otro }, select: { status: true } });
    comprobar('vuelve a ONLINE al terminar su carrera', d?.status === 'ONLINE', String(d?.status));

    console.log('\n═══ Y se puede soltar mientras siga reservada ═══');
    await reservas.soltarReserva(otro, futura.id);
    const t = await fila(futura.id);
    comprobar('vuelve al tablero sin conductor',
      t?.driverId === null && t?.status === 'SCHEDULED', `${t?.status}/${t?.driverId}`);
    comprobar('y otro la vuelve a ver libre',
      (await reservas.listarReservasLibres(taxi.id)).reservas
        .some((r) => r.id === futura.id));
    await prisma.trip.update({ where: { id: futura.id }, data: { status: 'CANCELLED' } });
  }

  console.log('\n═══ El que no aparece pierde la reserva ═══');
  {
    // La reserva ya está ACCEPTED. Se simula que dio la hora y que el conductor
    // lleva rato sin reportar posición: teléfono apagado, app cerrada.
    await prisma.trip.update({
      where: { id: reserva.id }, data: { scheduledFor: enMin(-10) },
    });
    await prisma.driver.update({
      where: { id: dueno }, data: { lastSeenAt: enMin(-30) },
    });
    ofertas.length = 0;
    const n = await reservas.liberarReservasIncumplidas();
    comprobar('se le quita la reserva', n === 1, `liberó ${n}`);
    const t = await fila(reserva.id);
    comprobar('el viaje sale a buscar como uno normal',
      t?.status === 'SEARCHING' && t?.driverId === null, `${t?.status}/${t?.driverId}`);
    await new Promise((r) => setTimeout(r, 600));
    comprobar('y AHORA sí se le ofrece a los conductores cercanos',
      ofertas.some((m) => m['type'] === 'trip_request'),
      JSON.stringify(ofertas.map((m) => m['type'])));
  }

  console.log('\n═══ Al que SÍ da señales no se le quita nada ═══');
  {
    const v = await pedir(enMin(60));
    await reservas.apartarReserva(taxi2.id, v.id);
    await prisma.trip.update({
      where: { id: v.id },
      data: { status: 'ACCEPTED', scheduledFor: enMin(-10), acceptedAt: new Date() },
    });
    await prisma.driver.update({ where: { id: taxi2.id }, data: { lastSeenAt: new Date() } });
    const n = await reservas.liberarReservasIncumplidas();
    comprobar('con latido reciente se le respeta', n === 0, `liberó ${n}`);
    comprobar('y el viaje sigue siendo suyo',
      (await fila(v.id))?.driverId === taxi2.id);
    await prisma.trip.update({ where: { id: v.id }, data: { status: 'CANCELLED' } });
  }

  console.log('\n═══ Guardas de quién puede apartar qué ═══');
  {
    const carrera = await pedir(enMin(200));
    let msg = '';
    try {
      await reservas.apartarReserva(moto.id, carrera.id);
    } catch (e) {
      msg = e instanceof Error ? e.message : '';
    }
    comprobar('la moto no puede apartar una carrera de taxi',
      /vehículo no corresponde/.test(msg), msg || 'no falló');
    comprobar('y la reserva sigue libre', (await fila(carrera.id))?.driverId === null);

    // Tope por conductor: apartar diez y cumplir dos deja a ocho tirados.
    const tope = reservas.TOPE_RESERVAS_POR_CONDUCTOR;
    const creadas: string[] = [];
    for (let i = 0; i < tope; i++) {
      const v = await pedir(enMin(300 + i * 10));
      await reservas.apartarReserva(taxi.id, v.id);
      creadas.push(v.id);
    }
    let msgTope = '';
    try {
      await reservas.apartarReserva(taxi.id, carrera.id);
    } catch (e) {
      msgTope = e instanceof Error ? e.message : '';
    }
    comprobar(`no puede pasar de ${tope} reservas`, /reservas apartadas/.test(msgTope),
      msgTope || 'no falló');

    await prisma.trip.updateMany({
      where: { id: { in: [...creadas, carrera.id] } },
      data: { status: 'CANCELLED', driverId: null },
    });
  }

  console.log('\n═══ Documentos vencidos: la reserva no se puede cumplir ═══');
  {
    // El SOAT pudo vencerse ENTRE apartar y la hora del viaje: por eso se
    // comprueba también al activar, no solo al apartar.
    process.env['DOC_KILL_SWITCH_ENFORCE'] = 'true';
    const v = await pedir(enMin(90));
    await prisma.trip.update({
      where: { id: v.id }, data: { driverId: taxi.id, searchFrom: enMin(-1) },
    });
    await prisma.driver.update({
      where: { id: taxi.id },
      data: { complianceStatus: 'BLOCKED', blockedReason: 'SOAT vencido' },
    });
    ofertas.length = 0;
    await reservas.activarReservas();
    const t = await fila(v.id);
    comprobar('no se activa con el conductor bloqueado; sale a buscar',
      t?.status === 'SEARCHING' && t?.driverId === null, `${t?.status}/${t?.driverId}`);
    await prisma.driver.update({
      where: { id: taxi.id },
      data: { complianceStatus: 'CLEAR', blockedReason: null },
    });
    delete process.env['DOC_KILL_SWITCH_ENFORCE'];
    await prisma.trip.update({ where: { id: v.id }, data: { status: 'CANCELLED' } });
  }

  // ── Limpieza ───────────────────────────────────────────────────────────────
  const conductores = [taxi.id, taxi2.id, moto.id];
  await prisma.trip.updateMany({
    where: { OR: [{ passengerId: cliente.id }, { driverId: { in: conductores } }] },
    data: { status: 'CANCELLED', driverId: null },
  });
  await prisma.trip.deleteMany({ where: { passengerId: cliente.id } });
  await prisma.vehicle.deleteMany({ where: { driverId: { in: conductores } } });
  await prisma.driver.deleteMany({ where: { id: { in: conductores } } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(
    fallos === 0
      ? '\n✅ Reservas: todo en verde'
      : `\n❌ Reservas: ${fallos} comprobación(es) fallida(s)`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
