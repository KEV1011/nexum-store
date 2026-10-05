/**
 * El giro a negocios y empresas, y el tiquete que se enseña en el bus.
 *
 * Contra PostgreSQL real porque lo que hay que probar aquí no se puede probar
 * con objetos en memoria:
 *
 *  · la IDEMPOTENCIA del abono se apoya en un índice único de la base —un
 *    webhook de pasarela se reintenta, y sin esa guarda el aliado cobraría
 *    dos veces la misma venta—;
 *  · la CONCURRENCIA del giro y del abordaje se apoya en `updateMany` con
 *    guarda, que solo significa algo con un motor de verdad detrás.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/giro-aliado-y-tiquete.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  acreditarAliado, saldoDelAliado, creditosPendientes, crearGiroAliado,
  girosDelAliado, destinatarioDelGiro, registerAvisoDeGiro, avisarGiroPagado,
  GiroError,
} from '../src/services/giro-aliado.service';
import { adminUpdatePayout } from '../src/services/payout.service';
import { abordarConTiquete } from '../src/services/intercity-pool.service';
import { generarCodigoTiquete } from '../src/lib/tiquete-abordaje';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

async function main() {
  const suf = Date.now().toString().slice(-8);

  // ── Siembra ──────────────────────────────────────────────────────────────
  const negocio = await prisma.business.create({
    data: {
      name: `Tienda Giro ${suf}`, ownerName: 'Dueña', phone: `+5730011${suf.slice(-4)}`,
      address: 'Calle 5 # 3-40', category: 'STORE', token: `tok-giro-${suf}`,
    },
  });
  const empresa = await prisma.operator.create({
    data: {
      legalName: `Transportes Giro ${suf}`, nit: `NIT-G-${suf}`,
      type: 'INTERCITY', status: 'ACTIVE', isVerified: true, city: 'pamplona',
      tradeName: 'Trans Giro', contactPhone: `+5730022${suf.slice(-4)}`,
    },
  });

  // ── 1. Acreditar lo cobrado ──────────────────────────────────────────────
  console.log('\n[1] Se acredita lo que cobramos para el negocio');
  await acreditarAliado({
    beneficiario: { businessId: negocio.id },
    source: 'order', sourceId: `ord-A-${suf}`,
    grossAmount: 30000, commission: 3000,
  });
  const s1 = await saldoDelAliado({ businessId: negocio.id });
  check(s1.disponible === 27000, 'el neto es bruto menos comisión', s1.disponible);
  check(s1.movimientos === 1, 'y se sabe de cuántas ventas sale', s1.movimientos);

  // ── 2. IDEMPOTENCIA: el reintento del webhook no acredita dos veces ──────
  console.log('\n[2] La pasarela reintenta el webhook');
  await acreditarAliado({
    beneficiario: { businessId: negocio.id },
    source: 'order', sourceId: `ord-A-${suf}`,
    grossAmount: 30000, commission: 3000,
  });
  const s2 = await saldoDelAliado({ businessId: negocio.id });
  check(s2.disponible === 27000, 'el reintento NO acredita la venta otra vez', s2.disponible);

  // Y cuatro reintentos A LA VEZ, que es como de verdad llegan.
  const simultaneos = await Promise.allSettled(
    Array.from({ length: 4 }, () => acreditarAliado({
      beneficiario: { businessId: negocio.id },
      source: 'order', sourceId: `ord-A-${suf}`,
      grossAmount: 30000, commission: 3000,
    })),
  );
  const s3 = await saldoDelAliado({ businessId: negocio.id });
  check(s3.disponible === 27000,
    'cuatro reintentos simultáneos tampoco', { saldo: s3.disponible, simultaneos: simultaneos.length });

  // ── 3. Lo sellado no se reescribe ────────────────────────────────────────
  console.log('\n[3] Un webhook tardío con otra comisión');
  await acreditarAliado({
    beneficiario: { businessId: negocio.id },
    source: 'order', sourceId: `ord-A-${suf}`,
    grossAmount: 30000, commission: 9000, // tasa distinta
  });
  const pend = await creditosPendientes({ businessId: negocio.id });
  check(pend[0]?.commission === 3000,
    'manda la comisión del primer cobro, no la del reintento', pend[0]?.commission);

  // ── 4. El giro salda ventas completas, de la más vieja a la más nueva ────
  console.log('\n[4] Se le gira al negocio');
  await acreditarAliado({
    beneficiario: { businessId: negocio.id },
    source: 'order', sourceId: `ord-B-${suf}`,
    grossAmount: 50000, commission: 5000,
  });
  const antes = await saldoDelAliado({ businessId: negocio.id });
  check(antes.disponible === 72000, 'el saldo suma las dos ventas', antes.disponible);

  const giro = await crearGiroAliado({ businessId: negocio.id }, {});
  check(giro.amount === 72000, 'sin monto se gira todo lo pendiente', giro.amount);
  check(giro.creditos === 2, 'y salda las dos ventas', giro.creditos);

  const despues = await saldoDelAliado({ businessId: negocio.id });
  check(despues.disponible === 0, 'tras girar no queda nada pendiente', despues.disponible);

  // ── 5. CONCURRENCIA: dos giros a la vez no pagan lo mismo dos veces ──────
  console.log('\n[5] Dos giros lanzados a la vez');
  for (let i = 0; i < 3; i++) {
    await acreditarAliado({
      beneficiario: { businessId: negocio.id },
      source: 'order', sourceId: `ord-C${i}-${suf}`,
      grossAmount: 40000, commission: 4000,
    });
  }
  const carrera = await Promise.allSettled([
    crearGiroAliado({ businessId: negocio.id }, {}),
    crearGiroAliado({ businessId: negocio.id }, {}),
    crearGiroAliado({ businessId: negocio.id }, {}),
  ]);
  const ganadores = carrera.filter((r) => r.status === 'fulfilled');
  const totalGirado = ganadores.reduce(
    (s, r) => s + (r as PromiseFulfilledResult<{ amount: number }>).value.amount, 0,
  );
  check(totalGirado === 108000,
    'entre todos los giros se pagó EXACTAMENTE lo pendiente, ni un peso más',
    { totalGirado, ganadores: ganadores.length });
  const trasCarrera = await saldoDelAliado({ businessId: negocio.id });
  check(trasCarrera.disponible === 0, 'y no queda saldo colgando', trasCarrera.disponible);

  // ── 6. Guardas ───────────────────────────────────────────────────────────
  console.log('\n[6] Lo que NO se permite');
  let rechazos = 0;
  for (const [etiqueta, fn] of [
    ['dos beneficiarios', () => acreditarAliado({
      beneficiario: { businessId: negocio.id, operatorId: empresa.id },
      source: 'order', sourceId: `x1-${suf}`, grossAmount: 1000, commission: 0,
    })],
    ['comisión mayor que el bruto', () => acreditarAliado({
      beneficiario: { businessId: negocio.id },
      source: 'order', sourceId: `x2-${suf}`, grossAmount: 1000, commission: 5000,
    })],
    ['girar sin saldo', () => crearGiroAliado({ businessId: negocio.id }, {})],
  ] as [string, () => Promise<unknown>][]) {
    try { await fn(); console.log(`  ✗ NO rechazó: ${etiqueta}`); fallos++; }
    catch (e) {
      rechazos++;
      check(e instanceof GiroError, `rechaza ${etiqueta}`, (e as Error).message);
    }
  }
  check(rechazos === 3, 'las tres guardas rechazan', rechazos);

  // ── 7. El aviso de «ya te pagamos» ───────────────────────────────────────
  console.log('\n[7] Se le avisa al negocio con la referencia');
  const avisos: Array<{ tipo: string; msg: Record<string, unknown> }> = [];
  registerAvisoDeGiro((destino, msg) => avisos.push({ tipo: destino.tipo, msg }));

  await acreditarAliado({
    beneficiario: { businessId: negocio.id },
    source: 'order', sourceId: `ord-D-${suf}`,
    grossAmount: 60000, commission: 6000,
  });
  const giro2 = await crearGiroAliado({ businessId: negocio.id }, {});
  await adminUpdatePayout(giro2.id, 'PAID', {
    processedBy: '+573001112233', reference: 'TRF-99887',
  });
  // El aviso sale sin `await` a propósito: se le da un respiro.
  await new Promise((r) => setTimeout(r, 400));

  const aviso = avisos.find((a) => a.msg['payoutId'] === giro2.id);
  check(aviso !== undefined, 'le llega el aviso al negocio', { avisos: avisos.length });
  check(aviso?.tipo === 'negocio', 'identificado como negocio', aviso?.tipo);
  check(aviso?.msg['reference'] === 'TRF-99887',
    'CON la referencia: es lo que le permite buscarla en su banco', aviso?.msg['reference']);
  check(aviso?.msg['amount'] === 54000, 'y con el monto', aviso?.msg['amount']);

  const dest = await destinatarioDelGiro(giro2.id);
  check(dest?.nombre === negocio.name, 'el destinatario se resuelve por nombre', dest?.nombre);

  // ── 8. La empresa funciona igual ─────────────────────────────────────────
  console.log('\n[8] Y una empresa, por el mismo camino');
  await acreditarAliado({
    beneficiario: { operatorId: empresa.id },
    source: 'booking', sourceId: `bk-A-${suf}`,
    grossAmount: 80000, commission: 8000,
  });
  const sEmp = await saldoDelAliado({ operatorId: empresa.id });
  check(sEmp.disponible === 72000, 'la empresa tiene su saldo', sEmp.disponible);
  const giroEmp = await crearGiroAliado({ operatorId: empresa.id }, { method: 'bank' });
  check(giroEmp.amount === 72000, 'y se le gira', giroEmp.amount);
  const destEmp = await destinatarioDelGiro(giroEmp.id);
  check(destEmp?.tipo === 'empresa', 'identificada como empresa', destEmp?.tipo);
  // El saldo del negocio no se mezcla con el de la empresa.
  const sNeg = await saldoDelAliado({ businessId: negocio.id });
  check(sNeg.disponible === 0, 'los saldos no se mezclan entre aliados', sNeg.disponible);

  const historial = await girosDelAliado({ businessId: negocio.id });
  check(historial.length >= 2, 'el negocio ve su historial de giros', historial.length);

  // ── 9. El tiquete en la puerta del bus ───────────────────────────────────
  console.log('\n[9] El pasajero enseña su tiquete');
  const conductor = await prisma.driver.create({
    data: {
      name: 'Conductor Bus', phone: `+5730033${suf.slice(-4)}`,
      isVerified: true, status: 'ONLINE',
    },
  });
  const usuario = await prisma.user.create({
    data: { name: 'Pasajera', phone: `+5730044${suf.slice(-4)}` },
  });
  const salida = await prisma.pooledTrip.create({
    data: {
      tripRef: `PT-${suf}`,
      driverId: conductor.id, driverName: conductor.name, driverPhone: conductor.phone,
      origin: 'pamplona', destination: 'cucuta',
      departureTime: new Date(Date.now() + 3600_000),
      totalSeats: 10, farePerSeat: 25000, maxFarePerSeat: 40000,
      vehicleDescription: 'Bus', status: 'OPEN', operatorId: empresa.id,
    },
  });
  const codigo = generarCodigoTiquete();
  const reserva = await prisma.seatBooking.create({
    data: {
      tripId: salida.id, userId: usuario.id,
      passengerName: 'Pasajera', passengerPhone: usuario.phone,
      seatsBooked: 2, status: 'CONFIRMED',
      fareTotal: 50000, discount: 5000,
      ticketCode: codigo,
    },
  });

  // Se teclea con espacios y en minúscula, como lo haría cualquiera.
  const r1 = await abordarConTiquete(conductor.id, salida.id,
    `${codigo.slice(0, 3).toLowerCase()} ${codigo.slice(3).toLowerCase()}`);
  check(r1.ok, 'sube con el código tecleado con espacios y en minúscula', r1.motivo);
  check(r1.aCobrar === 45000, 'y le dice al conductor cuánto cobrarle, ya con descuento', r1.aCobrar);
  check(r1.puestos === 2, 'y cuántos puestos ampara', r1.puestos);

  // ── 10. Un tiquete aborda UNA vez ────────────────────────────────────────
  console.log('\n[10] Alguien fotografió el tiquete y lo usa otra vez');
  const r2 = await abordarConTiquete(conductor.id, salida.id, codigo);
  check(!r2.ok, 'el segundo intento se rechaza');
  check((r2.motivo ?? '').includes('ya se usó'), 'diciendo que ya se usó', r2.motivo);
  check(typeof r2.abordoEn === 'string',
    'Y A QUÉ HORA: es lo que zanja la discusión en la puerta', r2.abordoEn);

  // Concurrencia real: cuatro validaciones del mismo código a la vez.
  await prisma.seatBooking.update({ where: { id: reserva.id }, data: { boardedAt: null } });
  const simultaneas = await Promise.allSettled(
    Array.from({ length: 4 }, () => abordarConTiquete(conductor.id, salida.id, codigo)),
  );
  const aprobados = simultaneas.filter(
    (r) => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok,
  ).length;
  check(aprobados === 1, 'con cuatro validaciones simultáneas, sube UNA sola vez', aprobados);

  // ── 11. Las otras guardas del tiquete ────────────────────────────────────
  console.log('\n[11] Guardas del tiquete');
  const otroConductor = await prisma.driver.create({
    data: { name: 'Otro', phone: `+5730055${suf.slice(-4)}`, isVerified: true },
  });
  const ajeno = await abordarConTiquete(otroConductor.id, salida.id, codigo);
  check(!ajeno.ok && (ajeno.motivo ?? '').includes('no es tuya'),
    'un conductor ajeno no puede quemar tiquetes de esa salida', ajeno.motivo);

  const inventado = await abordarConTiquete(conductor.id, salida.id, 'ZZZ999');
  check(!inventado.ok && (inventado.motivo ?? '').includes('No encontramos'),
    'un código inventado no sube a nadie', inventado.motivo);

  const vacio = await abordarConTiquete(conductor.id, salida.id, '  ');
  check(!vacio.ok, 'un código vacío tampoco', vacio.motivo);

  // ── Limpieza ─────────────────────────────────────────────────────────────
  await prisma.seatBooking.deleteMany({ where: { tripId: salida.id } });
  await prisma.pooledTrip.delete({ where: { id: salida.id } });
  await prisma.user.delete({ where: { id: usuario.id } });
  await prisma.driver.deleteMany({ where: { id: { in: [conductor.id, otroConductor.id] } } });
  await prisma.partnerCredit.deleteMany({
    where: { OR: [{ businessId: negocio.id }, { operatorId: empresa.id }] },
  });
  await prisma.payout.deleteMany({
    where: { OR: [{ businessId: negocio.id }, { operatorId: empresa.id }] },
  });
  await prisma.business.delete({ where: { id: negocio.id } });
  await prisma.operator.delete({ where: { id: empresa.id } });

  await prisma.$disconnect();
  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${ok} comprobaciones en verde, ${fallos} en rojo`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
