/**
 * La promoción de un producto, contra PostgreSQL real.
 *
 * LO QUE SOLO SE VE EJECUTANDO, y es todo el motivo de este script: que la
 * VITRINA y la CAJA digan lo mismo. Son dos caminos distintos
 * —`_productToDTO` y `resolverLineasDePedido`— y el defecto que se persigue es
 * que uno vea la promoción vencida y el otro no: la pantalla mostraría el
 * precio normal y el pedido se cobraría con el descuento de la semana pasada,
 * o al revés. Ninguna prueba unitaria toca esos dos caminos a la vez.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/promo-producto.ts
 */
import { prisma } from '../src/lib/prisma';
import { resolverLineasDePedido } from '../src/services/order-lines.service';
import { getBusinessPublicById } from '../src/services/business.service';

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  const sello = Date.now();
  const biz = await prisma.business.create({
    data: {
      name: `Promo E2E ${sello}`,
      address: 'Calle 5 # 3-40',
      category: 'RESTAURANT',
      token: `tok-promo-${sello}`,
      phone: '+573000000222',
    },
  });

  try {
    // Precio normal 18.000, en promoción a 12.000.
    const viva = await prisma.product.create({
      data: {
        businessId: biz.id, name: 'Hamburguesa viva', category: 'Hamburguesas',
        price: 12000, compareAtPrice: 18000, promoUntil: dias(3),
      },
    });
    const vencida = await prisma.product.create({
      data: {
        businessId: biz.id, name: 'Hamburguesa vencida', category: 'Hamburguesas',
        price: 12000, compareAtPrice: 18000, promoUntil: dias(-1),
      },
    });
    const sinFecha = await prisma.product.create({
      data: {
        businessId: biz.id, name: 'Combo sin fecha', category: 'Combos',
        price: 12000, compareAtPrice: 18000,
      },
    });

    console.log('\n[1] La VITRINA');
    const vitrina = await getBusinessPublicById(biz.id);
    const dto = (id: string) => vitrina.products.find((p) => p.id === id)!;
    check(dto(viva.id).price === 12000, 'promoción viva: precio rebajado', dto(viva.id).price);
    check(dto(viva.id).compareAtPrice === 18000, 'con el normal tachado', dto(viva.id).compareAtPrice);
    check(dto(viva.id).descuentoPct === 33, 'y su porcentaje', dto(viva.id).descuentoPct);

    check(dto(vencida.id).price === 18000, 'VENCIDA: vuelve sola al precio normal', dto(vencida.id).price);
    check(dto(vencida.id).compareAtPrice === undefined,
      'y deja de tachar: anunciar un descuento que no rige es lo que no puede pasar',
      dto(vencida.id).compareAtPrice);
    check(dto(vencida.id).descuentoPct === undefined, 'sin porcentaje', dto(vencida.id).descuentoPct);

    check(dto(sinFecha.id).price === 12000,
      'sin fecha sigue en promoción: es el comportamiento de los ya cargados');

    console.log('\n[2] La CAJA cobra lo mismo que enseña la vitrina');
    // Es la comprobación que justifica el script. Si la caja leyera
    // `producto.price` a secas, cobraría 12.000 por la vencida — el descuento
    // de la semana pasada, para siempre.
    const r = await resolverLineasDePedido(biz.id, [
      { productId: viva.id, quantity: 1 },
      { productId: vencida.id, quantity: 1 },
      { productId: sinFecha.id, quantity: 2 },
    ]);
    const linea = (id: string) => r.lines.find((l) => l.productId === id)!;
    check(linea(viva.id).unitPrice === 12000, 'viva se cobra a 12.000', linea(viva.id).unitPrice);
    check(linea(vencida.id).unitPrice === 18000,
      'VENCIDA SE COBRA A 18.000, igual que dice la pantalla', linea(vencida.id).unitPrice);
    check(linea(sinFecha.id).unitPrice === 12000, 'sin fecha, 12.000');
    check(r.subtotal === 12000 + 18000 + 24000, 'y el subtotal cuadra', r.subtotal);

    console.log('\n[3] Vitrina y caja coinciden producto a producto');
    for (const p of [viva, vencida, sinFecha]) {
      check(dto(p.id).price === linea(p.id).unitPrice,
        `${p.name}: la pantalla y el cobro dicen lo mismo`,
        { vitrina: dto(p.id).price, caja: linea(p.id).unitPrice });
    }

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    process.exitCode = fallos > 0 ? 1 : 0;
  } finally {
    await prisma.product.deleteMany({ where: { businessId: biz.id } });
    await prisma.business.delete({ where: { id: biz.id } });
    await prisma.$disconnect();
  }
}

void main();
