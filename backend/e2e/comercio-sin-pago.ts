/**
 * E2E: el comercio que no ha pagado su plan y sigue vendiendo.
 *
 * EL MODELO, en una frase: desactivar a un local que no pagó lo saca de la
 * app y se pierde la venta de los dos lados. Marcarlo «sin pago» lo deja en la
 * vitrina con su carta, y el pedido a domicilio sale como el de un comercio
 * que no es cliente: va un repartidor de ZIPA, compra en su mostrador y
 * entrega. Al ponerse al día, los pedidos vuelven a llegar a su portal.
 *
 * LO QUE SE COMPRUEBA, y por qué:
 *
 *  1. **Sigue en la vitrina.** Si «sin pago» lo escondiera, sería lo mismo
 *     que desactivarlo y no habría venta que conservar.
 *  2. **El DTO lo trata como no reclamado** (`claimed=false`): es lo único que
 *     mira la app para mandar el carrito al mandado de compra. Con un campo
 *     nuevo, las apps instaladas seguirían mandando el pedido al portal.
 *  3. **El pedido directo se rechaza** —el portal de un local que debe no lo
 *     está atendiendo— y el motivo NO le cuenta al cliente que el local debe.
 *  4. **La compra por mandado sí entra.**
 *  5. **Marcar dos veces no reescribe la fecha**: el panel tiene que seguir
 *     diciendo desde cuándo debe.
 *  6. **Su portal se entera** (`pagoPendienteDesde`), o vería la pantalla
 *     vacía y creería que dejaron de pedirle.
 *  7. **Al ponerse al día** vuelve el pedido directo y se cierra el mandado.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/comercio-sin-pago.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
let ok = 0;
function comprobar(nombre: string, cond: boolean, detalle?: unknown): void {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else {
    fallos++;
    console.log(`  ✗ ${nombre}`, detalle !== undefined ? JSON.stringify(detalle) : '');
  }
}

const tel = (p: string): string =>
  `+57${p}${Math.floor(1000000 + Math.random() * 8999999)}`;

async function rechazo(fn: () => Promise<unknown>): Promise<string> {
  try { await fn(); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

async function main(): Promise<void> {
  const admin = await import('../src/services/admin.service');
  const biz = await import('../src/services/business.service');
  const { placeClientOrder } = await import('../src/services/client.service');
  const { comprarEnComercio } = await import('../src/services/comercio-no-reclamado.service');

  console.log('\n═══ Comercio sin pago que sigue vendiendo ═══\n');

  const negocio = await prisma.business.create({
    data: {
      name: `Pieros E2E ${Date.now() % 100000}`,
      ownerName: 'Piero', phone: tel('31'), address: 'Calle 5 # 3-40',
      category: 'RESTAURANT', token: `tok-sinpago-${Date.now()}`,
      isOpen: true, acceptingOrders: true, claimed: true,
      lat: 7.3754, lng: -72.6486,
    } as never,
  });
  const plato = await biz.createBusinessProduct(negocio.id, {
    name: 'Pizza hawaiana', price: 30000, category: 'Pizzas',
  } as never) as { id: string };
  const cliente = await prisma.user.create({
    data: { name: 'Marta Ruiz', phone: tel('32') },
  });
  const pedir = () => placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Carrera 6 # 4-20',
    items: [{ productId: plato.id, quantity: 1 }],
  } as never);
  const comprar = () => comprarEnComercio(cliente.id, {
    businessId: negocio.id,
    items: [{ productId: plato.id, quantity: 1 }],
    dropoffAddress: 'Carrera 6 # 4-20',
  });

  // ── 0. Al día ────────────────────────────────────────────────────────────
  console.log('0. Al día: el camino de siempre');
  const alDia = await biz.getBusinessPublicById(negocio.id);
  comprobar('el DTO dice reclamado', alDia.claimed === true, alDia.claimed);
  const motivoAlDia = await rechazo(pedir);
  comprobar('el pedido directo entra', motivoAlDia === '', motivoAlDia);
  comprobar('y el mandado de compra NO (atiende su portal)',
    /directamente/i.test(await rechazo(comprar)));

  // ── 1. Se marca sin pago ─────────────────────────────────────────────────
  console.log('\n1. El admin lo marca «sin pago»');
  await admin.setBusinessUnpaid(negocio.id, true);
  const fila1 = (await admin.listBusinessesForAdmin(negocio.name)).find((b) => b.id === negocio.id);
  comprobar('el panel dice desde cuándo debe', !!fila1?.unpaidSince, fila1?.unpaidSince);
  comprobar('y NO lo desactiva', fila1?.isOpen === true, fila1?.isOpen);

  const enVitrina = (await biz.getAllBusinessesPublic()).find((b) => b.id === negocio.id);
  comprobar('sigue en la vitrina con su carta',
    !!enVitrina && (enVitrina.products?.length ?? 0) > 0, enVitrina?.products?.length);
  comprobar('el DTO lo trata como no reclamado (las apps ya instaladas lo entienden)',
    enVitrina?.claimed === false, enVitrina?.claimed);
  const detalle = await biz.getBusinessPublicById(negocio.id);
  comprobar('también en el detalle', detalle.claimed === false, detalle.claimed);

  const motivo = await rechazo(pedir);
  comprobar('el pedido directo se rechaza', motivo.length > 0);
  comprobar('diciendo que se lo compramos', /comprarlo por ti/i.test(motivo), motivo);
  comprobar('sin contarle al cliente que el local debe',
    !/pag[oóa]|plan|deud|debe/i.test(motivo), motivo);

  const compra = await comprar();
  comprobar('la compra por mandado SÍ entra', !!compra.errand?.id);
  const mandado = await prisma.errand.findUniqueOrThrow({
    where: { id: compra.errand.id }, select: { pickupAddress: true },
  });
  comprobar('y se recoge en el local', mandado.pickupAddress === 'Calle 5 # 3-40', mandado.pickupAddress);

  const portal = await biz.getBusinessService().getBusinessByToken(negocio.token);
  comprobar('su portal se entera (pagoPendienteDesde)', !!portal.pagoPendienteDesde, portal.pagoPendienteDesde);

  // ── 2. Marcar otra vez no reescribe la fecha ─────────────────────────────
  console.log('\n2. Volver a marcar');
  const antes = (await prisma.business.findUniqueOrThrow({
    where: { id: negocio.id }, select: { unpaidSince: true },
  })).unpaidSince;
  await new Promise((r) => setTimeout(r, 20));
  await admin.setBusinessUnpaid(negocio.id, true);
  const despues = (await prisma.business.findUniqueOrThrow({
    where: { id: negocio.id }, select: { unpaidSince: true },
  })).unpaidSince;
  comprobar('la fecha de «debe desde» se conserva',
    !!antes && !!despues && antes.getTime() === despues.getTime(), { antes, despues });

  // ── 3. Se pone al día ────────────────────────────────────────────────────
  console.log('\n3. Paga y queda al día');
  await admin.setBusinessUnpaid(negocio.id, false);
  const pagado = await biz.getBusinessPublicById(negocio.id);
  comprobar('vuelve a ser reclamado', pagado.claimed === true, pagado.claimed);
  const motivoFinal = await rechazo(pedir);
  comprobar('el pedido directo vuelve a entrar', motivoFinal === '', motivoFinal);
  comprobar('y el mandado de compra se cierra', /directamente/i.test(await rechazo(comprar)));
  const portal2 = await biz.getBusinessService().getBusinessByToken(negocio.token);
  comprobar('su portal deja de mostrar el aviso', !portal2.pagoPendienteDesde, portal2.pagoPendienteDesde);

  // ── 4. Un negocio inexistente ────────────────────────────────────────────
  comprobar('marcar un id inexistente falla en vez de callarse',
    (await rechazo(() => admin.setBusinessUnpaid('no-existe', true))).length > 0);

  console.log(`\n${ok} bien · ${fallos} mal\n`);
  await prisma.$disconnect();
  process.exit(fallos > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
