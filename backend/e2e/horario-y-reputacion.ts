/**
 * E2E del control de la tienda: horario que cierra de verdad, pausa que se
 * levanta sola, promoción con vigencia — y la calificación que deja de mentir.
 *
 * Las unitarias fijan la aritmética y los rechazos. Aquí se comprueba lo único
 * que importa de verdad: que **la pantalla y la caja digan lo mismo**. Un local
 * que la app pinta cerrado y que aun así acepta un pedido a las 3 de la mañana
 * es exactamente el daño que esta tanda viene a impedir.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/horario-y-reputacion.ts
 */
import { prisma } from '../src/lib/prisma';

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? '  ✓' : '  ✗'} ${nombre}${ok ? '' : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

async function rechaza(nombre: string, fn: () => Promise<unknown>, patron: RegExp): Promise<void> {
  try {
    await fn();
    comprobar(nombre, false, 'no lanzó');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    comprobar(nombre, patron.test(msg), msg);
  }
}

const tel = (p: string) => `+57${p}${Math.floor(10000000 + Math.random() * 89999999)}`;

/** El día de la semana colombiano de un instante (0 = domingo). */
function diaColombiano(d = new Date()): number {
  return new Date(d.getTime() - 5 * 3_600_000).getUTCDay();
}

async function main(): Promise<void> {
  const {
    updateBusinessSettings, getBusinessSettings, getBusinessPublicById,
    createBusinessProduct, getBusinessReviews, tiendaRecibiendo,
  } = await import('../src/services/business.service');
  const { placeClientOrder, rateClientOrder } = await import('../src/services/client.service');

  const marca = `e2ehor-${Date.now()}`;

  const negocio = await prisma.business.create({
    data: {
      name: `${marca} Asadero`,
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
    data: { name: 'Cliente', phone: tel('30') },
  });
  const producto = await createBusinessProduct(negocio.id, {
    name: 'Pollo entero', price: 45000, category: 'Asados',
  } as never);

  const pedir = () =>
    placeClientOrder(cliente.id, cliente.phone, {
      businessId: negocio.id,
      deliveryAddress: 'Casa',
      items: [{ productId: producto.id, quantity: 1 }],
    } as never);

  // ── 1. La nota de fábrica ya no existe ─────────────────────────────────────
  console.log('\n1. La calificación de un negocio nuevo');
  {
    const enBd = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
    comprobar('un negocio nuevo NO nace con 5,0', enBd.rating === null, String(enBd.rating));
    const publico = await getBusinessPublicById(negocio.id);
    comprobar('la vitrina lo manda como null, no como número',
      publico.rating === null, String(publico.rating));
    comprobar('y con el conteo en cero', publico.ratingCount === 0, String(publico.ratingCount));
  }

  // ── 2. El horario cierra de VERDAD ─────────────────────────────────────────
  console.log('\n2. El horario');
  {
    const hoy = diaColombiano();
    // Un horario que NO incluye este momento: solo mañana, de madrugada.
    await updateBusinessSettings(negocio.id, {
      hours: [{ dia: (hoy + 1) % 7, abre: '03:00', cierra: '04:00' }],
    });

    const cerrado = await getBusinessPublicById(negocio.id);
    comprobar('fuera de horario la vitrina lo pinta cerrado', cerrado.isOpen === false);
    comprobar('y dice CUÁNDO vuelve, no un «cerrado» a secas',
      typeof cerrado.cerradoMotivo === 'string' && /Abre/.test(cerrado.cerradoMotivo),
      String(cerrado.cerradoMotivo));

    // Lo que de verdad importa: la CAJA lo rechaza igual que la pantalla.
    await rechaza('y el pedido se rechaza con ese mismo motivo', pedir, /no está recibiendo pedidos/i);

    // El interruptor sigue encendido: el local creía estar abierto.
    const ajustes = await getBusinessSettings(negocio.id);
    comprobar('el portal le avisa al dueño de que está cerrado pese al interruptor',
      ajustes.acceptingOrders === true && ajustes.isOpen === false);

    // Ahora un horario que SÍ lo incluye: de 00:00 a 23:59 de hoy.
    await updateBusinessSettings(negocio.id, {
      hours: [{ dia: hoy, abre: '00:00', cierra: '23:59' }],
    });
    const abierto = await getBusinessPublicById(negocio.id);
    comprobar('dentro de horario vuelve a estar abierto', abierto.isOpen === true);
    const o = await pedir();
    comprobar('y el pedido entra', Boolean(o.id));
    await prisma.orderLine.deleteMany({ where: { orderId: o.id } });
    await prisma.order.delete({ where: { id: o.id } });

    await rechaza('un horario imposible se rechaza al guardar',
      () => updateBusinessSettings(negocio.id, { hours: [{ dia: 1, abre: '99:00', cierra: '10:00' }] }),
      /HH:MM/);

    // Sin horario, como los negocios que ya estaban registrados.
    await updateBusinessSettings(negocio.id, { hours: [] });
    const sinHorario = await getBusinessPublicById(negocio.id);
    comprobar('SIN horario declarado sigue abierto (no se apaga a nadie al desplegar)',
      sinHorario.isOpen === true);
  }

  // ── 3. La pausa se levanta sola ────────────────────────────────────────────
  console.log('\n3. La pausa temporal');
  {
    await updateBusinessSettings(negocio.id, { pauseMinutes: 30, pauseReason: 'Cocina copada' });
    const enPausa = await getBusinessPublicById(negocio.id);
    comprobar('en pausa la vitrina lo pinta cerrado', enPausa.isOpen === false);
    comprobar('con el motivo que escribió el dueño',
      enPausa.cerradoMotivo === 'Cocina copada', String(enPausa.cerradoMotivo));
    await rechaza('y la caja lo rechaza', pedir, /cocina copada/i);

    // Se levanta SOLA: se mueve el reloj hacia atrás en la base y ya está.
    await prisma.business.update({
      where: { id: negocio.id },
      data: { pausedUntil: new Date(Date.now() - 60_000) },
    });
    const reanudado = await getBusinessPublicById(negocio.id);
    comprobar('pasada la hora vuelve solo, sin que nadie toque nada',
      reanudado.isOpen === true);
    const ajustes = await getBusinessSettings(negocio.id);
    comprobar('y el portal ya no anuncia una pausa vencida',
      ajustes.pausedUntil === undefined, String(ajustes.pausedUntil));

    await rechaza('una «pausa» de tres días se rechaza: eso es cerrar',
      () => updateBusinessSettings(negocio.id, { pauseMinutes: 60 * 72 }),
      /24 horas/);

    await updateBusinessSettings(negocio.id, { pauseMinutes: 0 });
  }

  // ── 4. La promoción se apaga sola ──────────────────────────────────────────
  console.log('\n4. La vigencia de la promoción');
  {
    await updateBusinessSettings(negocio.id, {
      promoDiscount: 6000, promoMinAmount: 30000,
    });
    const vigente = await getBusinessPublicById(negocio.id);
    comprobar('sin fechas, la promoción se anuncia', vigente.promoDiscount === 6000);

    // Una promoción que terminó ayer.
    await updateBusinessSettings(negocio.id, {
      promoDiscount: 6000, promoMinAmount: 30000,
      promoUntil: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const vencida = await getBusinessPublicById(negocio.id);
    comprobar('vencida NO se anuncia', vencida.promoDiscount === undefined,
      String(vencida.promoDiscount));

    // Y —lo que importa— tampoco se cobra: el pedido sale sin descuento.
    const o = await pedir();
    comprobar('y tampoco se descuenta al cobrar',
      !o.promoDiscount, String(o.promoDiscount));
    comprobar('el total es subtotal + domicilio, sin regalos',
      Math.round(o.total) === Math.round(o.subtotal + o.deliveryFee),
      `${o.total} vs ${o.subtotal}+${o.deliveryFee}`);

    await rechaza('un rango al revés se rechaza',
      () => updateBusinessSettings(negocio.id, {
        promoDiscount: 6000, promoMinAmount: 30000,
        promoFrom: '2026-10-10', promoUntil: '2026-10-01',
      }),
      /antes de empezar/);

    // Quitar la promoción se lleva sus fechas: si no, la siguiente nacería
    // vencida sin que nadie entendiera por qué.
    await updateBusinessSettings(negocio.id, { promoDiscount: null, promoMinAmount: null });
    const limpio = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
    comprobar('al quitarla se van también sus fechas',
      limpio.promoUntil === null && limpio.promoFrom === null);

    // El pedido de la comprobación anterior sirve ahora para calificar.
    await prisma.order.update({ where: { id: o.id }, data: { status: 'DELIVERED' } });
    (globalThis as Record<string, unknown>)['__pedidoEntregado'] = o.id;
  }

  // ── 5. La calificación llega al negocio ────────────────────────────────────
  console.log('\n5. La calificación');
  {
    const pedidoId = (globalThis as Record<string, unknown>)['__pedidoEntregado'] as string;

    await rateClientOrder(cliente.id, pedidoId, 4, '  Llegó tibio pero rico  ');
    const enBd = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
    comprobar('la nota del cliente llega al negocio', enBd.rating === 4, String(enBd.rating));
    comprobar('y queda contada', enBd.ratingCount === 1, String(enBd.ratingCount));

    const publico = await getBusinessPublicById(negocio.id);
    comprobar('la vitrina ya enseña la nota real', publico.rating === 4);

    const reseñas = await getBusinessReviews(negocio.id);
    comprobar('el dueño ve el comentario, no solo el número',
      reseñas.comentarios[0]?.comentario === 'Llegó tibio pero rico',
      JSON.stringify(reseñas.comentarios[0]));
    comprobar('y de dónde sale el promedio', reseñas.distribucion[4] === 1);

    // Corregirse: la nota se reemplaza y el promedio se RECALCULA.
    await rateClientOrder(cliente.id, pedidoId, 2, null);
    const corregido = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
    comprobar('corregir la estrella recalcula el promedio, no lo suma encima',
      corregido.rating === 2 && corregido.ratingCount === 1,
      `${corregido.rating} / ${corregido.ratingCount}`);

    // Un segundo pedido entregado, y el promedio de los dos.
    const o2 = await pedir();
    await prisma.order.update({ where: { id: o2.id }, data: { status: 'DELIVERED' } });
    await rateClientOrder(cliente.id, o2.id, 5, null);
    const dos = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
    comprobar('con dos notas, el promedio de las dos',
      dos.rating === 3.5 && dos.ratingCount === 2, `${dos.rating} / ${dos.ratingCount}`);

    // Los rechazos.
    const o3 = await pedir();
    await rechaza('no se puede calificar un pedido que aún no llegó',
      () => rateClientOrder(cliente.id, o3.id, 5, null), /ya te entregaron/);
    await rechaza('ni seis estrellas',
      () => rateClientOrder(cliente.id, pedidoId, 6, null), /1 a 5/);
    const otro = await prisma.user.create({ data: { name: 'Otra', phone: tel('32') } });
    await rechaza('ni el pedido de otra persona',
      () => rateClientOrder(otro.id, pedidoId, 5, null), /no existe/);
    await prisma.user.delete({ where: { id: otro.id } });
  }

  // ── 6. Una sola función decide si la tienda recibe ─────────────────────────
  console.log('\n6. La vitrina y la caja usan la MISMA regla');
  {
    // Si esto se rompe, la pantalla y el cobro pueden discrepar: es la razón
    // de que `tiendaRecibiendo` exista y esté exportada.
    const b = await prisma.business.findUniqueOrThrow({ where: { id: negocio.id } });
    await prisma.business.update({ where: { id: negocio.id }, data: { acceptingOrders: false } });
    const apagado = await getBusinessPublicById(negocio.id);
    const directo = tiendaRecibiendo({ ...b, acceptingOrders: false });
    comprobar('la vitrina dice lo mismo que la función',
      apagado.isOpen === directo.abierta && apagado.isOpen === false);
    await rechaza('y la caja también', pedir, /no está recibiendo pedidos/i);
    await prisma.business.update({ where: { id: negocio.id }, data: { acceptingOrders: true } });
  }

  // Limpieza.
  await prisma.orderLine.deleteMany({ where: { order: { businessId: negocio.id } } });
  await prisma.order.deleteMany({ where: { businessId: negocio.id } });
  await prisma.product.deleteMany({ where: { businessId: negocio.id } });
  await prisma.business.delete({ where: { id: negocio.id } });
  await prisma.user.delete({ where: { id: cliente.id } });

  console.log(
    `\n${fallos === 0
      ? '✅ La tienda cierra cuando dice que cierra, y la nota es la que le dieron'
      : `❌ ${fallos} fallo(s)`}\n`,
  );
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
