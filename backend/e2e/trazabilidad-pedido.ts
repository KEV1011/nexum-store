/**
 * E2E de la trazabilidad del pedido y del método de pago.
 *
 * LO QUE SE PRUEBA, y por qué cada cosa:
 *
 *  1. **Cada paso deja su hora.** La línea de tiempo eran cinco etiquetas
 *     fijas sin un solo instante: no se podía decir a qué hora aceptó el
 *     negocio ni cuánto llevaba la caja en el bus. Se comprueba que el
 *     recorrido completo queda registrado, en orden y con quién lo movió.
 *  2. **Los pasos se adaptan a la forma del pedido.** Una encomienda en bus
 *     decía «Conductor recogiendo» durante seis horas y un pedido en mesa
 *     prometía un repartidor inexistente.
 *  3. **Nunca se inventa una hora.** Un paso sin registro va sin hora; un
 *     pedido anterior a la bitácora conserva la de creación y nada más.
 *  4. **El pago se SELLA y llega a quien decide con él**: al negocio en su
 *     portal y al repartidor en la oferta. Antes esa elección no salía del
 *     teléfono del cliente y el repartidor llegaba sin saber si cobrar.
 *  5. **Un método inventado no se guarda**, y uno ausente se lee como
 *     efectivo en vez de como «ya pagado» (el error caro).
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/trazabilidad-pedido.ts
 */
import { prisma } from '../src/lib/prisma';
import {
  placeClientOrder, acceptOrderByBusiness, acceptClientOrder,
  updateOrderStatusByDriver, getClientOrderById,
} from '../src/services/client.service';
import { getOrderOfferInfo } from '../src/services/order-offer.service';
import { historialDePedido } from '../src/services/pedido-eventos.service';
import { lineaDeTiempoPedido } from '../src/lib/linea-tiempo-pedido';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

const sufijo = () => Math.floor(10000 + Math.random() * 89999);

async function main() {
  const marca = `e2etraza-${Date.now()}`;

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Restaurante`,
      ownerName: 'Dueña',
      phone: `+5730071${sufijo()}`,
      address: 'Calle 5 # 3-40',
      category: 'RESTAURANT',
      token: `tok-${marca}`,
      lat: 7.3754,
      lng: -72.6486,
      deliveryFee: 4000,
      etaMinutes: 25,
    },
  });
  const producto = await prisma.product.create({
    data: {
      businessId: negocio.id,
      name: 'Bandeja paisa',
      description: 'Completa',
      price: 25000,
      category: 'Platos',
      isAvailable: true,
    },
  });
  const cliente = await prisma.user.create({
    data: { phone: `+5730072${sufijo()}`, name: 'Cliente E2E' },
  });
  const conductor = await prisma.driver.create({
    data: {
      phone: `+5730073${sufijo()}`,
      name: 'Repartidor E2E',
      documentNumber: `${sufijo()}${sufijo()}`,
      status: 'ONLINE',
      isVerified: true,
    },
  });

  const items = [{ productId: producto.id, quantity: 1, unitPrice: producto.price }];

  // ── 1. El pago se sella y se lee ────────────────────────────────────────
  console.log('\n[1] Con qué paga el cliente deja de morir en su teléfono');
  const pedido = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Carrera 6 # 4-20',
    deliveryLat: 7.3760,
    deliveryLng: -72.6490,
    paymentMethod: 'bre_b',
    items,
  });
  const enBD = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
  check(enBD.paymentMethod === 'bre_b', 'el método queda SELLADO en el pedido', enBD.paymentMethod);
  check(
    pedido.paymentLabel === 'Llave Bre-B',
    'y el DTO trae la etiqueta ya redactada por el servidor',
    pedido.paymentLabel,
  );
  check(
    pedido.cobraElRepartidor === true,
    'Bre-B lo cobra el REPARTIDOR: la plata entra a su llave, no a la pasarela',
  );

  const inventado = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Carrera 6 # 4-20',
    paymentMethod: 'criptomonedas',
    items,
  });
  const inv = await prisma.order.findUniqueOrThrow({ where: { id: inventado.id } });
  check(inv.paymentMethod === null, 'un método inventado NO se guarda', inv.paymentMethod);

  // ── 2. La bitácora, paso a paso ─────────────────────────────────────────
  console.log('\n[2] Cada paso deja su hora y quién lo movió');
  let hist = await historialDePedido(pedido.id);
  check(hist.length === 1 && hist[0]!.status === 'PENDING', 'nace con su primer hecho', hist);
  check(hist[0]!.actor === 'cliente', 'y con quién lo hizo', hist[0]!.actor);

  await acceptOrderByBusiness(negocio.id, pedido.id, 20);
  hist = await historialDePedido(pedido.id);
  const prep = hist.find((e) => e.status === 'PREPARING');
  check(prep != null, 'aceptar el negocio queda registrado');
  check(prep?.actor === 'negocio', 'a nombre del negocio', prep?.actor);
  check(
    (prep?.note ?? '').includes('20'),
    'con el tiempo que prometió, que es lo que el cliente va a contar',
    prep?.note,
  );

  // (orderId, driverName, driverPhone, driverId): el id va el ÚLTIMO.
  await acceptClientOrder(
    pedido.id, 'Repartidor E2E', conductor.phone, conductor.id,
  );
  // Los PIN de custodia se leen de la BD: el de recogida lo tiene el negocio
  // y el de entrega el cliente, y ninguno de los dos viaja en el DTO del
  // repartidor a propósito.
  const pins = await prisma.order.findUniqueOrThrow({
    where: { id: pedido.id },
    select: { pickupPin: true, deliveryPin: true },
  });
  // (orderId, driverId, ...) y no al revés: los scripts de e2e/ NO entran en
  // el typecheck, así que invertirlos no lo caza el compilador — devolvía
  // null en silencio y el pedido se quedaba parado.
  await updateOrderStatusByDriver(
    pedido.id, conductor.id, 'in_transit', pins.pickupPin ?? undefined,
  );
  await updateOrderStatusByDriver(
    pedido.id, conductor.id, 'delivered', pins.deliveryPin ?? undefined,
  );

  hist = await historialDePedido(pedido.id);
  const secuencia = hist.map((e) => e.status);
  check(
    JSON.stringify(secuencia)
      === JSON.stringify(['PENDING', 'PREPARING', 'DRIVER_TO_PICKUP', 'IN_TRANSIT', 'DELIVERED']),
    'el recorrido completo queda en orden',
    secuencia,
  );
  const enOrden = hist.every((e, i) => i === 0 || e.at.getTime() >= hist[i - 1]!.at.getTime());
  check(enOrden, 'y las horas van hacia adelante');

  // ── 3. La línea de tiempo que ve el cliente ─────────────────────────────
  console.log('\n[3] Lo que ve el cliente: pasos con hora, sin huecos inventados');
  const detalle = await getClientOrderById(cliente.id, pedido.id);
  const linea = detalle?.timeline ?? [];
  check(linea.length > 0, 'el detalle trae la línea de tiempo');
  check(
    linea.every((p) => p.estado !== 'pendiente'),
    'un pedido entregado no deja pasos pendientes',
    linea.map((p) => `${p.clave}:${p.estado}`),
  );
  const conHora = linea.filter((p) => p.at != null).length;
  check(conHora >= 4, 'y casi todos llevan su hora real', { conHora, total: linea.length });
  check(
    linea.some((p) => p.clave === 'recogiendo'),
    'el domicilio urbano incluye el paso del repartidor',
  );
  check(
    !linea.some((p) => p.clave === 'en_ruta_ciudad'),
    'y NO el tramo intermunicipal, que aquí no existe',
  );

  // ── 4. El repartidor sabe si tiene que cobrar ───────────────────────────
  console.log('\n[4] La oferta le dice al repartidor cómo va a cobrar');
  const otro = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Carrera 6 # 4-20',
    deliveryLat: 7.3760,
    deliveryLng: -72.6490,
    paymentMethod: 'en_linea',
    items,
  });
  const oferta = await getOrderOfferInfo(otro.id);
  check(
    oferta?.dto.paymentNote === 'Ya pagado en la app',
    'con pago en línea se le dice que ya está pagado',
    oferta?.dto.paymentNote,
  );
  check(
    oferta?.dto.cobraElRepartidor === false,
    'y que NO tiene que cobrar nada',
  );

  const efectivo = await placeClientOrder(cliente.id, cliente.phone, {
    businessId: negocio.id,
    deliveryAddress: 'Carrera 6 # 4-20',
    paymentMethod: 'efectivo',
    items,
  });
  const ofertaEfectivo = await getOrderOfferInfo(efectivo.id);
  check(
    ofertaEfectivo?.dto.cobraElRepartidor === true,
    'en efectivo SÍ cobra él: lo contrario es dejarlo entregar sin recibir',
  );

  // ── 5. Sin bitácora, sin horas inventadas ───────────────────────────────
  console.log('\n[5] Un pedido anterior a la bitácora no estrena horas falsas');
  const viejo = await prisma.order.create({
    data: {
      orderRef: `NX-${sufijo()}`,
      userId: cliente.id,
      businessId: negocio.id,
      deliveryAddress: 'Calle vieja',
      status: 'DELIVERED',
      subtotal: 10000,
      deliveryFee: 4000,
      total: 14000,
    },
  });
  const lineaVieja = lineaDeTiempoPedido(
    {
      status: 'DELIVERED',
      dineIn: false,
      intercity: false,
      lastMile: false,
      createdAt: viejo.createdAt,
    },
    await historialDePedido(viejo.id),
  );
  check(
    lineaVieja[0]!.at === viejo.createdAt.toISOString(),
    'el primer paso lleva la fecha REAL de creación',
  );
  check(
    lineaVieja.slice(1).every((p) => p.at === null),
    'y ningún otro estrena una hora que nadie registró',
    lineaVieja.map((p) => p.at),
  );
  check(
    lineaVieja.every((p) => p.estado !== 'pendiente'),
    'pero se ve completo: está entregado, y eso sí se sabe',
  );

  await prisma.$disconnect();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Comprobaciones: ${ok} en verde, ${fallos} en rojo`);
  if (fallos > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
