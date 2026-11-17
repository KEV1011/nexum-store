/**
 * «El local da LISTO y el pedido no le llega a ningún repartidor».
 *
 * El despacho del pedido buscaba repartidor alrededor del punto GUARDADO del
 * local, sin preguntarse si ese punto era creíble. Un local geocodificado sin
 * ciudad pudo quedar en Bogotá siendo de Pamplona, y entonces nadie a menos de
 * 5 km de Bogotá = nadie, aunque el repartidor estuviera en la puerta. Es el
 * mismo defecto que ya se corrigió en la compra a un local sin registrar; aquí
 * se aplica la misma regla (`anclaDeCompra`).
 *
 *   1. Local con el punto en Bogotá, entrega y repartidor en Pamplona → la
 *      oferta le llega (capturada de verdad, no solo el estado).
 *   2. Contraprueba: local con su punto correcto en Pamplona → también le
 *      llega, y la búsqueda ancla en el LOCAL (no en la entrega).
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  if (ok) console.log(`  ✓ ${nombre}`);
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}
const sufijo = String(Date.now()).slice(-6);
let n = 0;
const tel = () => `+5732${sufijo}${String(++n).padStart(2, '0')}`;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = { lat: 7.3754, lng: -72.6486 };
const ENTREGA = { lat: 7.3725, lng: -72.6481 }; // Universidad de Pamplona, aprox.
const EN_BOGOTA = { lat: 4.6, lng: -74.08 };

async function main(): Promise<void> {
  const { placeClientOrder, acceptOrderByBusiness, markOrderReadyByBusiness } =
    await import('../src/services/client.service');
  const { createBusinessProduct } = await import('../src/services/business.service');
  const { getOrderOfferInfo } = await import('../src/services/order-offer.service');
  const { warmMunicipalities } = await import('../src/services/municipality.service');
  const matching = await import('../src/services/matching.service');

  for (const [slug, name, c] of [['pamplona', 'Pamplona', P], ['bogota', 'Bogotá', EN_BOGOTA]] as const) {
    await prisma.municipality.upsert({
      where: { slug }, update: { lat: c.lat, lng: c.lng, isActive: true },
      create: { slug, name, department: 'X', lat: c.lat, lng: c.lng, isActive: true },
    });
  }
  await warmMunicipalities();
  await prisma.driver.updateMany({ where: { status: { in: ['ONLINE', 'ON_TRIP'] } }, data: { status: 'OFFLINE' } });

  const ofertas: Array<{ id: string; orderId?: string }> = [];
  matching.registerSendToDriver((id, msg) => {
    const m = msg as { type: string; order?: { id: string } };
    if (m.type === 'order_request') ofertas.push({ id, orderId: m.order?.id });
    return true;
  });

  const m = `e2emalub-${sufijo}`;
  const cliente = await prisma.user.create({ data: { name: 'Cliente', phone: tel() } });
  const repartidor = await prisma.driver.create({
    data: {
      name: 'Steve', phone: tel(), documentType: 'CC', documentNumber: `94${sufijo}`,
      isVerified: true, status: 'ONLINE', acceptsOrders: true,
    },
  });
  await matching.updateDriverGeo(repartidor.id, P.lat + 0.002, P.lng);

  const negocios: string[] = [];
  deshacer = async () => {
    const ids = (await prisma.order.findMany({ where: { businessId: { in: negocios } }, select: { id: true } })).map((o) => o.id);
    for (const id of ids) matching.cancelSearchRetry(`order:${id}`);
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.product.deleteMany({ where: { businessId: { in: negocios } } });
    await prisma.business.deleteMany({ where: { id: { in: negocios } } });
    await prisma.driver.deleteMany({ where: { id: repartidor.id } });
    await prisma.user.deleteMany({ where: { id: cliente.id } });
  };

  const negocio = async (nombre: string, p: { lat: number; lng: number }, citySlug: string | null) => {
    const b = await prisma.business.create({
      data: {
        name: `${m} ${nombre}`, ownerName: 'Dueño', category: 'RESTAURANT', address: 'Calle 5 #4-20',
        phone: tel(), token: `tok-${m}-${n}`, acceptingOrders: true, deliveryFee: 2500, etaMinutes: 20,
        lat: p.lat, lng: p.lng, citySlug,
      },
    });
    negocios.push(b.id);
    const prod = await createBusinessProduct(b.id, { name: 'Hamburguesa', price: 25000, category: 'Comida' } as never) as { id: string };
    return { id: b.id, prod: prod.id };
  };
  const pedido = async (b: { id: string; prod: string }) => (await placeClientOrder(cliente.id, cliente.phone, {
    businessId: b.id, deliveryAddress: 'Universidad De Pamplona, Cl. 5',
    deliveryLat: ENTREGA.lat, deliveryLng: ENTREGA.lng, paymentMethod: 'efectivo',
    items: [{ productId: b.prod, quantity: 1 }],
  } as never)).id;

  console.log('\n── 1. Local guardado en Bogotá, todo lo demás en Pamplona ──');
  // Sin ciudad: así quedaron los locales geocodificados antes de que el
  // registro la pidiera (el relleno de plazas no le asigna una a un punto que
  // no cae cerca de ninguna). Con ciudad «bogota» el pedido sería un envío a
  // otra ciudad, que es otra cosa.
  const malo = await negocio('Betos', EN_BOGOTA, null);
  const p1 = await pedido(malo);
  await acceptOrderByBusiness(malo.id, p1, 15);
  await markOrderReadyByBusiness(malo.id, p1);
  await esperar(900);
  const info1 = await getOrderOfferInfo(p1);
  comprobar('la búsqueda NO ancla en el punto de Bogotá', !!info1 && Math.abs(info1.lat - EN_BOGOTA.lat) > 1,
    `ancla=${info1?.lat},${info1?.lng}`);
  comprobar('la oferta le llega al repartidor de Pamplona',
    ofertas.some((o) => o.orderId === p1 && o.id === repartidor.id), `ofertas=${JSON.stringify(ofertas)}`);
  matching.cancelSearchRetry(`order:${p1}`);
  await prisma.order.update({ where: { id: p1 }, data: { status: 'CANCELLED' } });
  await esperar(20_000); // que venza la oferta en curso

  console.log('\n── 2. Contraprueba: local bien ubicado en Pamplona ──');
  ofertas.length = 0;
  const local = { lat: P.lat + 0.004, lng: P.lng + 0.002 };
  const bueno = await negocio('Pieros', local, 'pamplona');
  const p2 = await pedido(bueno);
  await acceptOrderByBusiness(bueno.id, p2, 15);
  await esperar(900);
  const info2 = await getOrderOfferInfo(p2);
  comprobar('ancla en el LOCAL, no en la entrega',
    !!info2 && Math.abs(info2.lat - local.lat) < 1e-6 && Math.abs(info2.lng - local.lng) < 1e-6,
    `ancla=${info2?.lat},${info2?.lng}`);
  comprobar('y la oferta le llega', ofertas.some((o) => o.orderId === p2 && o.id === repartidor.id));

  await limpiar();
  console.log(fallos === 0 ? '\nTODO EN VERDE' : `\n${fallos} FALLO(S)`);
  process.exit(fallos === 0 ? 0 : 1);
}

let deshacer: (() => Promise<void>) | null = null;
async function limpiar(): Promise<void> {
  const f = deshacer;
  deshacer = null;
  if (!f) return;
  try { await f(); } catch (e) { console.error('(no se pudo limpiar del todo)', e); }
}

main().catch(async (e) => {
  console.error(e);
  await limpiar();
  process.exit(1);
});
