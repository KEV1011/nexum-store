/**
 * E2E de la vitrina: descuento, promoción de la tienda y «lo más pedido».
 *
 * Las unitarias fijan la aritmética. Esto comprueba lo que de verdad duele:
 * que lo que la pantalla PROMETE sea lo que la caja COBRA. Un banner que dice
 * «$6.000 OFF» y un pedido que se cobra completo no da un error — da una
 * discusión con el cliente y una reseña de una estrella.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/vitrina.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

async function main(): Promise<void> {
  const {
    createBusinessProduct, updateBusinessSettings, getBusinessPublicById,
  } = await import('../src/services/business.service');
  const { placeClientOrder } = await import('../src/services/client.service');
  const { promoDeTienda } = await import('../src/lib/vitrina');

  const marca = `e2evit-${Date.now()}`;

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Burgers`,
      ownerName: 'Dueño',
      category: 'RESTAURANT',
      address: 'Calle 5 #3-40',
      phone: tel('31'),
      token: `tok-${marca}`,
      acceptingOrders: true,
      deliveryFee: 3500,
      etaMinutes: 30,
    },
  });
  const cliente = await prisma.user.create({
    data: { phone: tel('30'), name: `${marca}-pax` },
  });

  console.log('\n═══ El precio tachado sale del dato, no del sistema ═══');
  let combo = '';
  {
    const p = await createBusinessProduct(negocio.id, {
      name: 'Combo Hamburguesa 250gr', price: 16000, compareAtPrice: '$30.000',
      category: 'Combos',
    });
    combo = p.id;
    comprobar('guarda el precio anterior leyendo el punto como MILES',
      p.compareAtPrice === 30000, String(p.compareAtPrice));
    comprobar('y trae el porcentaje ya calculado', p.descuentoPct === 47,
      String(p.descuentoPct));

    const sinOferta = await createBusinessProduct(negocio.id, {
      name: 'Gaseosa', price: 4000, category: 'Bebidas',
    });
    comprobar('un producto sin oferta no trae insignia',
      sinOferta.compareAtPrice === undefined && sinOferta.descuentoPct === undefined);

    let rechazado = '';
    try {
      await createBusinessProduct(negocio.id, {
        name: 'Al revés', price: 30000, compareAtPrice: 16000, category: 'x',
      });
    } catch (e) { rechazado = e instanceof Error ? e.message : ''; }
    comprobar('RECHAZA el «antes» escrito al revés', /MAYOR/.test(rechazado), rechazado);

    let increible = '';
    try {
      await createBusinessProduct(negocio.id, {
        name: 'Engaño', price: 1000, compareAtPrice: 100000, category: 'x',
      });
    } catch (e) { increible = e instanceof Error ? e.message : ''; }
    comprobar('RECHAZA el descuento increíble (precio engañoso)',
      /engañoso/i.test(increible), increible);
  }

  console.log('\n═══ La promoción de la tienda: banner y caja, la MISMA cuenta ═══');
  {
    await updateBusinessSettings(negocio.id, {
      promoMinAmount: '30.000', promoDiscount: '$6.000',
    });
    const vitrina = await getBusinessPublicById(negocio.id);
    comprobar('la tienda anuncia su promoción',
      vitrina.promoMinAmount === 30000 && vitrina.promoDiscount === 6000,
      `${vitrina.promoMinAmount} / ${vitrina.promoDiscount}`);

    // Pedido POR DEBAJO del mínimo: 1 combo = 16.000.
    const corto = await placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id,
      deliveryAddress: 'Casa',
      items: [{ productId: combo, quantity: 1 }],
    } as never);
    comprobar('sin llegar al mínimo NO se descuenta',
      corto.promoDiscount === undefined && corto.total === 16000 + 3500,
      `desc=${corto.promoDiscount} total=${corto.total}`);

    // Pedido que SÍ alcanza: 2 combos = 32.000 ≥ 30.000.
    const largo = await placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id,
      deliveryAddress: 'Casa',
      items: [{ productId: combo, quantity: 2 }],
    } as never);
    comprobar('al alcanzar el mínimo SÍ se descuenta', largo.promoDiscount === 6000,
      String(largo.promoDiscount));
    comprobar('el total es subtotal − descuento + domicilio',
      largo.total === 32000 - 6000 + 3500, String(largo.total));
    comprobar('el domicilio NO se toca: es el pago del repartidor',
      largo.deliveryFee === 3500, String(largo.deliveryFee));

    // Lo que anunciaría el banner con ese mismo carrito.
    const banner = promoDeTienda(32000, vitrina.promoMinAmount, vitrina.promoDiscount)!;
    comprobar('el banner y el cobro coinciden al peso',
      banner.descuento === largo.promoDiscount, `${banner.descuento} vs ${largo.promoDiscount}`);

    console.log('\n═══ Renegociar la promoción NO reescribe lo ya cobrado ═══');
    await updateBusinessSettings(negocio.id, { promoMinAmount: '', promoDiscount: '' });
    const trasQuitar = await getBusinessPublicById(negocio.id);
    comprobar('la tienda deja de anunciarla',
      trasQuitar.promoMinAmount === undefined && trasQuitar.promoDiscount === undefined);
    const guardado = await prisma.order.findUnique({ where: { id: largo.id } });
    comprobar('pero el pedido de antes conserva su descuento',
      guardado?.promoDiscount === 6000, String(guardado?.promoDiscount));
    comprobar('y su total', guardado?.total === 29500, String(guardado?.total));

    let media = '';
    try {
      await updateBusinessSettings(negocio.id, { promoMinAmount: 30000 });
    } catch (e) { media = e instanceof Error ? e.message : ''; }
    comprobar('RECHAZA media promoción', /las dos/i.test(media), media);
  }

  console.log('\n═══ «Lo más pedido» no presume sin ventas ═══');
  {
    const antes = await getBusinessPublicById(negocio.id);
    comprobar('con pocas ventas NO se marca nada',
      antes.products.every((p) => p.masPedidoPuesto === undefined),
      JSON.stringify(antes.products.map((p) => p.masPedidoPuesto)));

    // Se entregan pedidos de verdad hasta pasar el umbral del ranking.
    const entregados = await prisma.order.findMany({
      where: { businessId: negocio.id }, select: { id: true },
    });
    await prisma.order.updateMany({
      where: { id: { in: entregados.map((o) => o.id) } },
      data: { status: 'DELIVERED' },
    });
    // 3 unidades no bastan: hacen falta 15.
    const flojo = await getBusinessPublicById(negocio.id);
    comprobar('tres unidades entregadas siguen sin bastar',
      flojo.products.every((p) => p.masPedidoPuesto === undefined));

    for (let i = 0; i < 6; i++) {
      const o = await placeClientOrder(cliente.id, cliente.phone, {
        businessId: negocio.id, deliveryAddress: 'Casa',
        items: [{ productId: combo, quantity: 3 }],
      } as never);
      await prisma.order.update({ where: { id: o.id }, data: { status: 'DELIVERED' } });
    }
    const conVentas = await getBusinessPublicById(negocio.id);
    const elCombo = conVentas.products.find((p) => p.id === combo);
    comprobar('con ventas suficientes, el combo es el #1',
      elCombo?.masPedidoPuesto === 1, String(elCombo?.masPedidoPuesto));
    const gaseosa = conVentas.products.find((p) => p.name === 'Gaseosa');
    comprobar('lo que nadie pidió no aparece en el ranking',
      gaseosa?.masPedidoPuesto === undefined, String(gaseosa?.masPedidoPuesto));
  }

  // Limpieza.
  await prisma.orderLine.deleteMany({ where: { order: { businessId: negocio.id } } });
  await prisma.order.deleteMany({ where: { businessId: negocio.id } });
  await prisma.product.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.delete({ where: { id: negocio.id } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(`\n${fallos === 0 ? '✅ La vitrina promete lo que la caja cobra' : `❌ ${fallos} fallo(s)`}\n`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
