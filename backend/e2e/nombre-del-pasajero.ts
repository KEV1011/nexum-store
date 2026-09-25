/**
 * E2E del registro del pasajero: que la cuenta NO nazca con un nombre inventado.
 *
 * LO QUE ESTO VIGILA. La app cliente no tiene registro —teléfono, código y
 * dentro—, así que la cuenta se creaba con el literal 'Usuario ZIPA' escrito
 * por nosotros. Ese nombre no se queda en la pantalla de Cuenta: es el que el
 * conductor lee al aceptar y al ir a recoger, el del manifiesto de un
 * intermunicipal y el que ve el negocio en su pedido. O sea que todos los
 * pasajeros de la plataforma se llamaban igual.
 *
 * Con el literal EN LA COLUMNA no hay forma de distinguir «todavía no lo ha
 * dicho» de «se llama así», que es justo lo que hace falta para preguntárselo
 * una vez y no volver a molestarle. Por eso la columna se deja en NULL y la
 * señal viaja en `needsName`.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/nombre-del-pasajero.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const nuevoTelefono = (): string =>
  `+5730${Math.floor(10000000 + Math.random() * 89999999)}`;

async function main(): Promise<void> {
  process.env['NODE_ENV'] = 'development'; // OTP de desarrollo
  const {
    verifyClientOtp,
    sendClientOtp,
    getClientById,
    getClientProfile,
    updateClientProfile,
  } = await import('../src/services/client.service');
  const { usuarioParaTelefonoVerificado } = await import(
    '../src/services/enlace-magico.service'
  );
  const otpDev = process.env['OTP_DEV_CODE'] ?? '123456';

  const creados: string[] = [];

  console.log('\n═══ La cuenta nace SIN nombre, no con uno de relleno ═══');
  const telefono = nuevoTelefono();
  {
    await sendClientOtp(telefono);
    const { client } = await verifyClientOtp(telefono, otpDev);
    creados.push(client.id);

    const fila = await prisma.user.findUnique({
      where: { id: client.id },
      select: { name: true },
    });
    comprobar('la columna queda en NULL', fila?.name === null, String(fila?.name));
    comprobar('y NO con el literal de antes', fila?.name !== 'Usuario ZIPA');
    comprobar('la app recibe needsName', client.needsName === true, String(client.needsName));
    comprobar(
      'el nombre de relleno es genérico y honesto',
      client.name === 'Pasajero',
      client.name,
    );
  }

  console.log('\n═══ Entrar en una cuenta que ya existe no inventa nada ═══');
  {
    // Teléfono nuevo: el limitador de envíos de OTP es por número y exige 45 s
    // entre códigos, así que repetir el login del bloque anterior mediría el
    // limitador, no lo que interesa aquí.
    const otro = nuevoTelefono();
    const previo = await prisma.user.create({ data: { phone: otro } });
    creados.push(previo.id);

    await sendClientOtp(otro);
    const { client } = await verifyClientOtp(otro, otpDev);
    comprobar('entra en la MISMA cuenta', client.id === previo.id, client.id);
    comprobar('y sigue faltando el nombre', client.needsName === true);
    const fila = await prisma.user.findUnique({
      where: { id: previo.id },
      select: { name: true },
    });
    comprobar('sin escribir nada en la columna', fila?.name === null, String(fila?.name));
  }

  console.log('\n═══ Una inicial suelta no es un nombre ═══');
  {
    let motivo = '';
    try {
      await updateClientProfile(creados[0]!, { name: 'A' });
    } catch (e) {
      motivo = e instanceof Error ? e.message : String(e);
    }
    comprobar('se rechaza un nombre de una letra', motivo.length > 0, 'se aceptó');
    const fila = await prisma.user.findUnique({
      where: { id: creados[0]! },
      select: { name: true },
    });
    comprobar('y no se escribió nada', fila?.name === null, String(fila?.name));
  }

  console.log('\n═══ Cuando lo dice, se guarda y deja de preguntarse ═══');
  {
    const perfil = await updateClientProfile(creados[0]!, { name: '  Ana Gómez  ' });
    comprobar('se guarda sin espacios sobrantes', perfil.name === 'Ana Gómez', perfil.name);
    comprobar('needsName desaparece', perfil.needsName !== true, String(perfil.needsName));

    const cliente = await getClientById(creados[0]!);
    comprobar('la sesión ya devuelve el nombre real', cliente?.name === 'Ana Gómez', String(cliente?.name));
    comprobar('y sin needsName', cliente?.needsName !== true);

    const p2 = await getClientProfile(creados[0]!);
    comprobar('el perfil coincide', p2.name === 'Ana Gómez', p2.name);
  }

  console.log('\n═══ La puerta de WhatsApp sigue la misma regla ═══');
  {
    // Con nombre del perfil del chat se estrena la cuenta con él; sin nombre
    // se deja en NULL y la app lo pregunta, igual que por OTP.
    const conNombre = await usuarioParaTelefonoVerificado(nuevoTelefono(), 'Luis Pérez');
    creados.push(conNombre.id);
    comprobar('el nombre del chat estrena la cuenta', conNombre.name === 'Luis Pérez', String(conNombre.name));

    const sinNombre = await usuarioParaTelefonoVerificado(nuevoTelefono(), '   ');
    creados.push(sinNombre.id);
    comprobar('sin nombre del chat queda en NULL', sinNombre.name === null, String(sinNombre.name));
  }

  console.log('\n═══ El conductor ve «Pasajero», nunca «Usuario ZIPA» ═══');
  {
    // Es el punto donde de verdad se notaba: la oferta y la pantalla de
    // recogida leen el nombre del pasajero del viaje.
    const sinNombre = creados[creados.length - 1]!;
    const { requestClientTrip } = await import('../src/services/client.service');
    const viaje = await requestClientTrip(sinNombre, {
      serviceType: 'taxi',
      originAddress: 'Parque principal',
      destinationAddress: 'Terminal',
      originLat: 7.3754,
      originLng: -72.6486,
      destLat: 7.3921,
      destLng: -72.6602,
    } as Parameters<typeof requestClientTrip>[1]);
    const conPasajero = await prisma.trip.findUnique({
      where: { id: viaje.id },
      include: { passenger: { select: { name: true } } },
    });
    const visible = conPasajero?.passenger?.name ?? 'Pasajero';
    comprobar('el conductor lee un genérico honesto', visible === 'Pasajero', visible);
    await prisma.trip.delete({ where: { id: viaje.id } });
  }

  console.log('\n═══ La migración limpia el relleno de las cuentas viejas ═══');
  {
    const viejo = await prisma.user.create({
      data: { phone: nuevoTelefono(), name: 'Usuario ZIPA' },
    });
    const real = await prisma.user.create({
      data: { phone: nuevoTelefono(), name: 'Carla Ruiz' },
    });
    creados.push(viejo.id, real.id);

    await prisma.$executeRawUnsafe(
      `UPDATE "users" SET "name" = NULL WHERE "name" = 'Usuario ZIPA'`,
    );

    const v = await prisma.user.findUnique({ where: { id: viejo.id }, select: { name: true } });
    const r = await prisma.user.findUnique({ where: { id: real.id }, select: { name: true } });
    comprobar('el relleno se borra', v?.name === null, String(v?.name));
    comprobar('y un nombre de verdad NO se toca', r?.name === 'Carla Ruiz', String(r?.name));

    const cliente = await getClientById(viejo.id);
    comprobar('a esa cuenta se le vuelve a preguntar', cliente?.needsName === true, String(cliente?.needsName));
  }

  await prisma.user.deleteMany({ where: { id: { in: creados } } });

  console.log(`\n${fallos === 0 ? '✅ Todo en verde' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
