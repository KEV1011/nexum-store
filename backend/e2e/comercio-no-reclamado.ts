/**
 * E2E: el comercio que todavía no es cliente nuestro.
 *
 * EL MODELO, en una frase: su carta se publica desde una foto, el cliente pide
 * igual, y en vez de mandarle el pedido a un portal donde no hay nadie, va un
 * repartidor de ZIPA, compra y entrega. Para el local no cambia nada —entra un
 * cliente más y paga en caja— y cuando vea los pedidos llegando, la
 * conversación de «entra al portal» ya tiene con qué respaldarse.
 *
 * LO QUE SE COMPRUEBA, y por qué cada cosa:
 *
 *  1. **El pedido normal se RECHAZA**, diciendo qué se puede hacer en su
 *     lugar. Sin esa guarda el pedido se quedaría en PENDING hasta caducar y
 *     el cliente esperando una comida que nadie empezó.
 *  2. **La compra sale como mandado** con la lista, el presupuesto y el local
 *     como punto de recogida — y el presupuesto queda POR ENCIMA de la suma
 *     de la carta: un precio pudo subir y dejar al repartidor sin poder pagar.
 *  3. **El precio lo pone la BASE.** Lo que mande el teléfono se descarta: de
 *     ese número sale la plata que se autoriza a gastar.
 *  4. **El repartidor dice en cuánto entrega** y le llega al cliente. En una
 *     compra a un local sin conectar no hay otra forma de saberlo.
 *  5. **Entregar la ficha al dueño** devuelve el comercio al camino normal:
 *     sus pedidos vuelven a ir a su portal.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/comercio-no-reclamado.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
let ok = 0;
function comprobar(nombre: string, cond: boolean, detalle?: unknown): void {
  if (cond) { ok++; logOriginal(`  ✓ ${nombre}`); }
  else {
    fallos++;
    logOriginal(`  ✗ ${nombre}`, detalle !== undefined ? JSON.stringify(detalle) : '');
  }
}

const avisos: string[] = [];
const logOriginal = console.log.bind(console);
console.log = (...args: unknown[]): void => {
  const linea = args.map((a) => String(a)).join(' ');
  if (linea.includes('[Push:mock]') || linea.includes('[Push] Sent')) avisos.push(linea);
  logOriginal(...args);
};
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const tel = (p: string): string =>
  `+57${p}${Math.floor(1000000 + Math.random() * 8999999)}`;

async function main(): Promise<void> {
  const { abrirFichaDeComercio, entregarFichaAlDueno } =
    await import('../src/services/admin.service');
  const { createBusinessProduct } = await import('../src/services/business.service');
  const { placeClientOrder } = await import('../src/services/client.service');
  const { comprarEnComercio } =
    await import('../src/services/comercio-no-reclamado.service');
  const { acceptClientErrand, declararEtaDeMandado, getClientErrandById } =
    await import('../src/services/errand.service');

  logOriginal('\n═══ Comercio que todavía no es cliente ═══\n');

  // ── 1. El admin abre la ficha ────────────────────────────────────────────
  logOriginal('1. Se abre la ficha desde el panel, sin hablar con el local');
  const ficha = await abrirFichaDeComercio({
    name: `Asadero E2E ${Date.now() % 100000}`,
    address: 'Calle 5 # 3-40',
    category: 'restaurant',
    phone: tel('31'),
  });
  comprobar('devuelve el enlace del portal, que es con el que se carga la carta',
    ficha.portalPath.includes('/negocio/'), ficha.portalPath);

  const negocio = await prisma.business.findUniqueOrThrow({
    where: { id: ficha.id },
    select: { claimed: true, name: true, acceptingOrders: true },
  });
  comprobar('nace SIN reclamar', negocio.claimed === false);
  comprobar('y recibiendo: el cliente tiene que poder pedirle', negocio.acceptingOrders);

  // La carta, como la dejaría el OCR de la foto.
  const plato = await createBusinessProduct(ficha.id, {
    name: 'Pollo asado entero', price: 42000, category: 'Asados',
  } as never);
  const bebida = await createBusinessProduct(ficha.id, {
    name: 'Gaseosa 1.5 L', price: 6000, category: 'Bebidas',
  } as never);
  const pid = (plato as { id: string }).id;
  const bid = (bebida as { id: string }).id;

  const cliente = await prisma.user.create({
    data: { name: 'Marta Ruiz', phone: tel('32'), fcmToken: `tk-${Date.now()}` },
  });

  // ── 2. El pedido normal no entra ─────────────────────────────────────────
  logOriginal('\n2. El camino normal del pedido');
  let motivoPedido = '';
  try {
    await placeClientOrder(cliente.id, cliente.phone, {
      businessId: ficha.id,
      deliveryAddress: 'Carrera 6 # 4-20',
      items: [{ productId: pid, quantity: 1 }],
    } as never);
  } catch (e) {
    motivoPedido = e instanceof Error ? e.message : '';
  }
  comprobar(
    'se RECHAZA: no hay nadie al otro lado del portal para aceptarlo',
    motivoPedido.length > 0,
    motivoPedido,
  );
  comprobar(
    'y el motivo dice qué se puede hacer en su lugar',
    /comprarlo por ti/i.test(motivoPedido) && /recibo/i.test(motivoPedido),
    motivoPedido,
  );

  // ── 3. La compra por mandado ─────────────────────────────────────────────
  logOriginal('\n3. La compra: va un repartidor');
  const compra = await comprarEnComercio(cliente.id, {
    businessId: ficha.id,
    items: [
      { productId: pid, quantity: 1, notes: 'bien asado' },
      { productId: bid, quantity: 2 },
    ],
    dropoffAddress: 'Carrera 6 # 4-20',
  });

  comprobar(
    'la suma referencial es la de la carta',
    compra.referencial === 42000 + 2 * 6000,
    compra.referencial,
  );
  comprobar(
    'el presupuesto queda POR ENCIMA: un precio pudo subir',
    compra.presupuesto > compra.referencial,
    { ref: compra.referencial, presupuesto: compra.presupuesto },
  );

  const mandado = await prisma.errand.findUniqueOrThrow({
    where: { id: compra.errand.id },
    select: {
      description: true, pickupAddress: true, purchaseBudget: true,
      category: true, status: true, deliveryPin: true,
    },
  });
  comprobar(
    'la recogida es EL LOCAL, no el centro del pueblo',
    mandado.pickupAddress === 'Calle 5 # 3-40',
    mandado.pickupAddress,
  );
  comprobar(
    'la lista que lee el repartidor trae cantidades y la nota del cliente',
    mandado.description.includes('1 × Pollo asado entero')
      && mandado.description.includes('2 × Gaseosa 1.5 L')
      && mandado.description.includes('bien asado'),
    mandado.description,
  );
  comprobar(
    'y le dice que los precios son aproximados y que guarde el recibo',
    /aproximad/i.test(mandado.description) && /recibo/i.test(mandado.description),
  );
  comprobar(
    'el presupuesto autorizado es el calculado',
    mandado.purchaseBudget === compra.presupuesto,
    { bd: mandado.purchaseBudget, calculado: compra.presupuesto },
  );
  comprobar(
    'un restaurante se despacha como mandado de COMIDA',
    mandado.category === 'FOOD',
    mandado.category,
  );
  comprobar('y lleva PIN de entrega, como todo mandado', !!mandado.deliveryPin);

  // ── 4. El precio lo pone la base ─────────────────────────────────────────
  logOriginal('\n4. El teléfono no decide cuánto se gasta');
  const barato = await comprarEnComercio(cliente.id, {
    businessId: ficha.id,
    // Un cliente malicioso mandando «este pollo vale 1 peso». El DTO ni
    // siquiera acepta precio, pero la comprobación que vale es la del
    // resultado: el presupuesto sale del catálogo.
    items: [{ productId: pid, quantity: 1 }],
    dropoffAddress: 'Carrera 6 # 4-20',
  });
  comprobar(
    'el presupuesto sale del catálogo, no de lo que mande la app',
    barato.referencial === 42000,
    barato.referencial,
  );

  // ── 5. El repartidor dice en cuánto entrega ──────────────────────────────
  logOriginal('\n5. Los tiempos de entrega los dice quien está en el local');
  const repartidor = await prisma.driver.create({
    data: {
      name: 'Nelson Parra', phone: tel('35'),
      documentNumber: `${Date.now()}`.slice(-9),
      status: 'ONLINE', isVerified: true, fcmToken: `tk-con-${Date.now()}`,
    },
  });
  await acceptClientErrand(
    compra.errand.id, 'Nelson Parra', repartidor.phone, repartidor.id,
  );

  const malo = await declararEtaDeMandado(repartidor.id, compra.errand.id, 2);
  comprobar(
    'un «en 2 minutos» no es creíble y se rechaza diciendo el rango',
    malo.ok === false && /5/.test(malo.ok === false ? malo.motivo : ''),
    malo,
  );

  const antes = avisos.length;
  const bueno = await declararEtaDeMandado(repartidor.id, compra.errand.id, 35);
  await esperar(400);
  comprobar('un tiempo razonable se acepta', bueno.ok === true, bueno);
  comprobar(
    'y le llega al CLIENTE: antes no tenía forma de saber cuánto falta',
    avisos.slice(antes).some(
      (l) => l.includes(`user=${cliente.id}`) && l.includes('errand_eta'),
    ),
    avisos.slice(antes),
  );

  const conEta = await getClientErrandById(cliente.id, compra.errand.id);
  comprobar('y queda en su pantalla', conEta?.etaMinutes === 35, conEta?.etaMinutes);

  const ajeno = await prisma.driver.create({
    data: {
      name: 'Otro', phone: tel('36'),
      documentNumber: `${Date.now() + 1}`.slice(-9), isVerified: true,
    },
  });
  const robo = await declararEtaDeMandado(ajeno.id, compra.errand.id, 20);
  comprobar(
    'otro repartidor no puede prometer por el mandado ajeno',
    robo.ok === false,
    robo,
  );

  // ── 6. El dueño se queda con la ficha ────────────────────────────────────
  logOriginal('\n6. El dueño dice que sí');
  await entregarFichaAlDueno(ficha.id);
  const entregada = await prisma.business.findUniqueOrThrow({
    where: { id: ficha.id },
    select: { claimed: true, claimedAt: true },
  });
  comprobar('la ficha pasa a ser suya', entregada.claimed === true);
  comprobar('con constancia de cuándo', entregada.claimedAt != null);

  let motivoCompra = '';
  try {
    await comprarEnComercio(cliente.id, {
      businessId: ficha.id,
      items: [{ productId: pid, quantity: 1 }],
      dropoffAddress: 'Carrera 6 # 4-20',
    });
  } catch (e) {
    motivoCompra = e instanceof Error ? e.message : '';
  }
  comprobar(
    'y ya no se le manda un repartidor a comprar en su mostrador',
    /directamente/i.test(motivoCompra),
    motivoCompra,
  );

  const pedidoNormal = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: ficha.id,
    deliveryAddress: 'Carrera 6 # 4-20',
    items: [{ productId: pid, quantity: 1 }],
  } as never);
  comprobar(
    'su pedido vuelve a ir a su portal, como cualquier cliente nuestro',
    !!pedidoNormal.id,
    pedidoNormal.orderRef,
  );

  await prisma.$disconnect();
  logOriginal(`\n${'─'.repeat(60)}`);
  logOriginal(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  if (fallos > 0) process.exit(1);
}

main().catch(async (e) => {
  logOriginal(e);
  await prisma.$disconnect();
  process.exit(1);
});
