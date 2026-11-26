/**
 * E2E del domicilio fijo de ZIPA (`lib/tarifa-domicilio.ts`).
 *
 * Lo que se prueba: que el local que puso OTRO domicilio en su portal se
 * vende igual a 4.000 en los tres sitios donde el cliente lo ve o lo paga —
 * la ficha pública, la cotización del envío y la caja—. Si uno de los tres
 * leyera la columna del local, la app prometería 4.000 y cobraría otra cosa.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/domicilio-fijo.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

async function main(): Promise<void> {
  delete process.env['DOMICILIO_FIJO_COP'];
  const { createBusinessProduct, getBusinessPublicById, getBusinessSettings } =
    await import('../src/services/business.service');
  const { placeClientOrder, cotizarEnvio } = await import('../src/services/client.service');

  const marca = `e2edom-${Date.now()}`;
  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Asadero`, ownerName: 'Dueño', category: 'RESTAURANT',
      address: 'Calle 5 #3-40', phone: tel('31'), token: `tok-${marca}`,
      acceptingOrders: true, deliveryFee: 6500, etaMinutes: 30,
    },
  });
  const cliente = await prisma.user.create({ data: { phone: tel('30'), name: `${marca}-pax` } });

  try {
    const plato = await createBusinessProduct(negocio.id, {
      name: 'Pollo asado', price: 20000, category: 'Asados',
    });

    const ficha = await getBusinessPublicById(negocio.id);
    comprobar('la ficha pública dice 4.000, no los 6.500 del local',
      ficha.deliveryFee === 4000, String(ficha.deliveryFee));

    const cot = await cotizarEnvio(ficha as never, {});
    comprobar('la cotización del envío también', cot.deliveryFee === 4000,
      String(cot.deliveryFee));

    const pedido = await placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id, deliveryAddress: 'Casa',
      items: [{ productId: plato.id, quantity: 1 }],
    } as never);
    comprobar('y la caja cobra eso', pedido.deliveryFee === 4000 && pedido.total === 24000,
      `domicilio=${pedido.deliveryFee} total=${pedido.total}`);

    const ajustes = await getBusinessSettings(negocio.id);
    comprobar('el portal del local sabe que lo fija ZIPA',
      (ajustes as { domicilioFijo?: number | null }).domicilioFijo === 4000,
      JSON.stringify((ajustes as { domicilioFijo?: unknown }).domicilioFijo));

    process.env['DOMICILIO_FIJO_COP'] = 'comercio';
    const otra = await getBusinessPublicById(negocio.id);
    comprobar('con «comercio» vuelve a mandar el del local', otra.deliveryFee === 6500,
      String(otra.deliveryFee));
  } finally {
    await prisma.orderEvent.deleteMany({ where: { order: { businessId: negocio.id } } }).catch(() => {});
    await prisma.orderLine.deleteMany({ where: { order: { businessId: negocio.id } } }).catch(() => {});
    await prisma.order.deleteMany({ where: { businessId: negocio.id } });
    await prisma.product.deleteMany({ where: { businessId: negocio.id } });
    await prisma.business.delete({ where: { id: negocio.id } });
    await prisma.user.delete({ where: { id: cliente.id } }).catch(() => {});
  }

  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} en rojo`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
