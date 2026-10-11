/**
 * El reporte de ventas del negocio, contra PostgreSQL real y POR HTTP.
 *
 * LO QUE SOLO SE VE EJECUTANDO: que la CONSULTA traiga lo que la regla espera.
 * `reporte-ventas.test.ts` prueba la aritmética sobre datos de mentira; aquí se
 * comprueba el `select` —que el nombre del producto salga de `productName` y no
 * de un campo que no existe, que `promoDiscount` llegue, que el rango incluya
 * el último día completo— y que la ruta no añada ni quite nada.
 *
 * Y la comprobación que justifica el script: que **el domicilio, el flete y la
 * propina NO entren en «tu venta»**. Sumar `total` le prometería al dueño una
 * plata que no le llega, y lo descubriría al cuadrar la caja.
 *
 *   DATABASE_URL=postgresql://... npx tsx e2e/reporte-ventas.ts
 */
import { spawn } from 'child_process';
import { prisma } from '../src/lib/prisma';

const PUERTO = 3012;
const BASE = `http://127.0.0.1:${PUERTO}`;

let fallos = 0;
let ok = 0;
function check(cond: boolean, msg: string, detalle?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${msg}`); }
  else { fallos++; console.log(`  ✗ ${msg}`, detalle !== undefined ? JSON.stringify(detalle) : ''); }
}

interface Reporte {
  pedidos: number; tuyo: number; descuentos: number; domicilios: number;
  fletes: number; propinas: number; enMesa: number; aDomicilio: number;
  ticketPromedio: number | null;
  porDia: Array<{ fecha: string; pedidos: number; tuyo: number }>;
  porProducto: Array<{ nombre: string; unidades: number; tuyo: number }>;
  porMedio: Array<{ medio: string; etiqueta: string; cobraLaPlataforma: boolean; pedidos: number; tuyo: number }>;
}

async function esperarServidor(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* todavía no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('El servidor no levantó.');
}

/** Un día a mediodía de Colombia (17:00 UTC), para no bailar entre días. */
function dia(iso: string): Date {
  return new Date(`${iso}T17:00:00Z`);
}

async function main() {
  try {
    await fetch(`${BASE}/health`);
    console.error(`El puerto ${PUERTO} ya está ocupado. Mátalo: fuser -k ${PUERTO}/tcp`);
    process.exit(1);
  } catch { /* libre */ }

  const servidor = spawn('npx', ['tsx', 'src/index.ts'], {
    env: { ...process.env, PORT: String(PUERTO), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const registros: string[] = [];
  servidor.stdout?.on('data', (b) => registros.push(String(b)));
  servidor.stderr?.on('data', (b) => registros.push(String(b)));

  const sello = Date.now();
  let bizId = '';

  try {
    await esperarServidor();

    const biz = await prisma.business.create({
      data: {
        name: `Reporte E2E ${sello}`, address: 'Calle 5 # 3-40', category: 'RESTAURANT',
        token: `tok-reporte-${sello}`, phone: '+573000000801',
      },
    });
    bizId = biz.id;

    const bandeja = await prisma.product.create({
      data: { businessId: biz.id, name: 'Bandeja paisa', category: 'Platos fuertes', price: 25000 },
    });
    const gaseosa = await prisma.product.create({
      data: { businessId: biz.id, name: 'Gaseosa', category: 'Bebidas', price: 3500 },
    });

    // (1) Entregado el día 10: 25.000 de comida + 5.000 de domicilio + 2.000 de
    // propina. Lo del negocio son 25.000, NO 32.000.
    await prisma.order.create({
      data: {
        orderRef: `R-${sello}-1`, businessId: biz.id, status: 'DELIVERED', mode: 'DELIVERY',
        deliveryAddress: 'Calle 1', subtotal: 25000, deliveryFee: 5000, total: 30000,
        tipAmount: 2000, paymentMethod: 'efectivo', createdAt: dia('2026-06-10'),
        lines: {
          create: [{
            productId: bandeja.id, productName: 'Bandeja paisa', quantity: 1,
            unitPrice: 25000, subtotal: 25000,
          }],
        },
      },
    });

    // (2) Entregado el día 12, en mesa, con descuento de 2.000 y pago en línea.
    await prisma.order.create({
      data: {
        orderRef: `R-${sello}-2`, businessId: biz.id, status: 'DELIVERED', mode: 'DINE_IN',
        deliveryAddress: 'Mesa 4', subtotal: 7000, promoDiscount: 2000, deliveryFee: 0,
        total: 5000, paymentMethod: 'en_linea', createdAt: dia('2026-06-12'),
        lines: {
          create: [{
            productId: gaseosa.id, productName: 'Gaseosa', quantity: 2,
            unitPrice: 3500, subtotal: 7000,
          }],
        },
      },
    });

    // (3) CANCELADO el día 12, por 500.000: no lo pagó nadie.
    await prisma.order.create({
      data: {
        orderRef: `R-${sello}-3`, businessId: biz.id, status: 'CANCELLED', mode: 'DELIVERY',
        deliveryAddress: 'Calle 9', subtotal: 500000, deliveryFee: 5000, total: 505000,
        createdAt: dia('2026-06-12'),
      },
    });

    // (4) EN CURSO: todavía puede caerse.
    await prisma.order.create({
      data: {
        orderRef: `R-${sello}-4`, businessId: biz.id, status: 'IN_TRANSIT', mode: 'DELIVERY',
        deliveryAddress: 'Calle 9', subtotal: 90000, deliveryFee: 5000, total: 95000,
        createdAt: dia('2026-06-12'),
      },
    });

    // (5) Entregado el ÚLTIMO día del rango: el que un `lte` sin hora deja fuera.
    await prisma.order.create({
      data: {
        orderRef: `R-${sello}-5`, businessId: biz.id, status: 'DELIVERED', mode: 'DELIVERY',
        deliveryAddress: 'Calle 2', subtotal: 10000, deliveryFee: 4000, intercityFee: 12000,
        total: 26000, isIntercity: true, paymentMethod: 'efectivo',
        createdAt: dia('2026-06-15'),
        lines: {
          create: [{
            productId: gaseosa.id, productName: 'Gaseosa', quantity: 1,
            unitPrice: 4000, subtotal: 4000,
          }],
        },
      },
    });

    // (6) Entregado a las 9 DE LA NOCHE del 15 (02:00 UTC del 16). Con la
    // ventana en UTC este pedido quedaba FUERA del reporte del 10 al 15, o sea
    // que a un restaurante le faltaba toda la venta de la noche.
    await prisma.order.create({
      data: {
        orderRef: `R-${sello}-6`, businessId: biz.id, status: 'DELIVERED', mode: 'DINE_IN',
        deliveryAddress: 'Mesa 2', subtotal: 18000, deliveryFee: 0, total: 18000,
        paymentMethod: 'efectivo', createdAt: new Date('2026-06-16T02:00:00Z'),
        lines: {
          create: [{
            productId: bandeja.id, productName: 'Bandeja paisa', quantity: 1,
            unitPrice: 18000, subtotal: 18000,
          }],
        },
      },
    });

    const pedir = async (from: string, to: string): Promise<Reporte> => {
      const r = await fetch(`${BASE}/business/${biz.token}/ventas?from=${from}&to=${to}`);
      const j = (await r.json()) as { success: boolean; data: Reporte };
      if (!r.ok || !j.success) throw new Error(`la ruta falló: ${r.status}`);
      return j.data;
    };

    console.log('\n[1] Lo del negocio NO incluye plata ajena');
    const rep = await pedir('2026-06-10', '2026-06-15');
    // 25.000 + (7.000 − 2.000) + 10.000
    check(rep.tuyo === 58000, 'tu venta = subtotal − descuentos', rep.tuyo);
    check(rep.domicilios === 9000, 'los domicilios van aparte (del repartidor)', rep.domicilios);
    check(rep.fletes === 12000, 'el flete intermunicipal aparte (del transportador)', rep.fletes);
    check(rep.propinas === 2000, 'la propina aparte (del repartidor)', rep.propinas);
    check(rep.descuentos === 2000, 'y el descuento que asumió se dice', rep.descuentos);

    console.log('\n[2] Qué pedidos cuentan');
    check(rep.pedidos === 4, 'solo los entregados: 4 de 6', rep.pedidos);
    check(rep.tuyo < 500000, 'el CANCELADO de 500.000 no suma', rep.tuyo);
    check(rep.enMesa === 2 && rep.aDomicilio === 2, 'separa salón de domicilio', {
      enMesa: rep.enMesa, aDomicilio: rep.aDomicilio,
    });

    console.log('\n[3] El último día del rango entra COMPLETO');
    // Con `lte: 2026-06-15T00:00:00` el pedido del 15 quedaría fuera y el mes
    // no cuadraría justo en el corte que importa.
    const soloHasta15 = await pedir('2026-06-15', '2026-06-15');
    check(soloHasta15.pedidos === 2,
      'los dos del 15 aparecen pidiendo del 15 al 15, incluido el de las 9 de la noche',
      soloHasta15.pedidos);
    check(soloHasta15.tuyo === 28000, 'con su venta', soloHasta15.tuyo);
    check(soloHasta15.porDia.length === 1 && soloHasta15.porDia[0]?.fecha === '2026-06-15',
      'y un solo día en el desglose', soloHasta15.porDia.map((d) => d.fecha));

    console.log('\n[4] Día por día, con los vacíos dibujados');
    check(rep.porDia.length === 6,
      'seis días del 10 al 15: ni uno de menos (solo los que vendieron) ni uno de más',
      rep.porDia.map((d) => d.fecha));
    check(rep.porDia[0]?.fecha === '2026-06-10',
      'y el primero es el 10, no el 9: la ventana empieza a medianoche de COLOMBIA',
      rep.porDia[0]?.fecha);
    const d11 = rep.porDia.find((d) => d.fecha === '2026-06-11');
    check(d11?.pedidos === 0, 'el 11 aparece en cero: ese día no se vendió nada', d11);
    check(rep.porDia.find((d) => d.fecha === '2026-06-10')?.tuyo === 25000, 'el 10 con sus 25.000');
    check(rep.porDia.find((d) => d.fecha === '2026-06-15')?.tuyo === 28000,
      'y la venta de la NOCHE del 15 cuenta en el 15, no en el 16',
      rep.porDia.find((d) => d.fecha === '2026-06-15'));
    check(rep.porDia.reduce((s, d) => s + d.tuyo, 0) === rep.tuyo,
      'la suma de los días cuadra con el total de arriba');

    console.log('\n[5] Por producto, con el precio SELLADO');
    const gas = rep.porProducto.find((p) => p.nombre === 'Gaseosa');
    check(gas?.unidades === 3, 'tres gaseosas entre los dos pedidos', gas);
    // 2 × 3.500 + 1 × 4.000: el precio de cada pedido, no el del catálogo.
    check(gas?.tuyo === 11000, 'cada una al precio con el que se vendió', gas?.tuyo);
    check(rep.porProducto[0]?.nombre === 'Bandeja paisa', 'ordenado por lo que más vende');
    check(rep.porProducto[0]?.unidades === 2, 'dos bandejas', rep.porProducto[0]);

    console.log('\n[6] Quién cobró');
    const linea = rep.porMedio.find((m) => m.medio === 'en_linea');
    check(linea?.cobraLaPlataforma === true, 'el pago en línea lo recaudó la plataforma', linea);
    check(rep.porMedio.find((m) => m.medio === 'efectivo')?.cobraLaPlataforma === false,
      'el efectivo lo cobró el negocio o el repartidor');

    console.log('\n[7] El CSV');
    const resCsv = await fetch(`${BASE}/business/${biz.token}/ventas.csv?from=2026-06-10&to=2026-06-15`);
    // Los BYTES, no `.text()`: el decodificador de UTF-8 QUITA el BOM por
    // norma, así que leyendo texto la comprobación del BOM falla siempre
    // aunque el archivo lo lleve — y la primera versión de este script lo dio
    // por defecto del código.
    const bytes = new Uint8Array(await resCsv.arrayBuffer());
    const csv = new TextDecoder('utf-8').decode(bytes);
    check(/REPORTE DE VENTAS/.test(csv), 'se llama reporte de ventas');
    check(/no es una factura/i.test(csv),
      'y DICE que no es una factura electrónica: esa la emite un facturador DIAN');
    check(csv.includes('Concepto;Valor'), 'con punto y coma, que es lo que lee el Excel en español');
    check(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF,
      'y con BOM, o las tildes salen partidas en Excel',
      [...bytes.slice(0, 3)]);

    console.log('\n[8] Sin ventas en el rango no se inventa nada');
    const vacio = await pedir('2026-01-01', '2026-01-05');
    check(vacio.pedidos === 0 && vacio.tuyo === 0, 'cero pedidos y cero venta', vacio.pedidos);
    check(vacio.ticketPromedio === null,
      'y el ticket promedio es null, no cero: sin denominador no hay promedio',
      vacio.ticketPromedio);

    console.log(`\n${ok} comprobaciones bien, ${fallos} mal`);
    if (fallos > 0) console.log('\n--- registros del servidor ---\n' + registros.join(''));
    process.exitCode = fallos > 0 ? 1 : 0;
  } catch (err) {
    console.error(err);
    console.log('\n--- registros del servidor ---\n' + registros.join(''));
    process.exitCode = 1;
  } finally {
    if (bizId) {
      await prisma.orderLine.deleteMany({ where: { order: { businessId: bizId } } });
      await prisma.orderEvent.deleteMany({ where: { order: { businessId: bizId } } });
      await prisma.order.deleteMany({ where: { businessId: bizId } });
      await prisma.product.deleteMany({ where: { businessId: bizId } });
      await prisma.business.deleteMany({ where: { id: bizId } });
    }
    await prisma.$disconnect();
    try { process.kill(-servidor.pid!, 'SIGKILL'); } catch { /* ya murió */ }
  }
}

void main();
